import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as process from "node:process";
import * as YAML from "yaml";

export const DEFAULT_HERMES_INSTALLER_URL =
  "https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh";

export type HermesConfigShape = {
  toolsets?: string[];
  terminal?: Record<string, unknown>;
  [key: string]: unknown;
};

export type EnsureHermesSetupOptions = {
  workspacePath?: string;
  interactive?: boolean;
  installerUrl?: string;
  env?: NodeJS.ProcessEnv;
  stdout?: NodeJS.WritableStream;
  stderr?: NodeJS.WritableStream;
};

export type EnsureHermesSetupResult = {
  hermesPath: string;
  hermesHome: string;
  configPath: string;
  workspacePath: string;
  installedHermes: boolean;
  wroteConfig: boolean;
};

export function resolveRepoAppsWebWorkspace(packageRoot: string): string {
  return path.join(packageRoot, "apps", "web");
}

export function resolveHermesHome(env: NodeJS.ProcessEnv = process.env): string {
  return env.HERMES_HOME?.trim() || path.join(os.homedir(), ".hermes");
}

export function resolveHermesConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveHermesHome(env), "config.yaml");
}

export function buildHermesInstallerShell(params?: {
  interactive?: boolean;
  installerUrl?: string;
}): string {
  const installerUrl = params?.installerUrl?.trim() || DEFAULT_HERMES_INSTALLER_URL;
  const skipSetupArg = params?.interactive === false ? " -s -- --skip-setup" : "";
  return `curl -fsSL ${installerUrl} | bash${skipSetupArg}`;
}

export function mergeHermesConfig(
  config: HermesConfigShape | null,
  workspacePath: string,
): HermesConfigShape {
  const next: HermesConfigShape = config ? { ...config } : {};
  const toolsets = Array.isArray(next.toolsets) ? [...next.toolsets] : [];
  if (!toolsets.includes("hermes-cli")) {
    toolsets.push("hermes-cli");
  }
  next.toolsets = toolsets;

  const terminal = next.terminal && typeof next.terminal === "object"
    ? { ...next.terminal }
    : {};
  terminal.cwd = workspacePath;
  next.terminal = terminal;

  return next;
}

function parseHermesConfig(filePath: string): HermesConfigShape | null {
  if (!existsSync(filePath)) return null;
  try {
    const parsed = YAML.parse(readFileSync(filePath, "utf-8")) as HermesConfigShape | null;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function writeHermesConfig(filePath: string, config: HermesConfigShape): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, YAML.stringify(config), "utf-8");
}

function resolveHermesBinary(env: NodeJS.ProcessEnv = process.env): string | null {
  const candidates = [
    env.HERMES_BIN?.trim() || "",
    "hermes",
    path.join(os.homedir(), ".local", "bin", "hermes"),
    path.join(resolveHermesHome(env), "hermes-agent", "venv", "bin", "hermes"),
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      const resolved = execFileSync("bash", ["-lc", `command -v ${candidate.includes("/") ? `'${candidate.replace(/'/g, `'\\''`)}'` : candidate}`], {
        encoding: "utf-8",
        env,
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      if (resolved) return resolved;
    } catch {
      if (candidate.includes("/") && existsSync(candidate)) return candidate;
    }
  }

  return null;
}

function installHermes(params: {
  interactive: boolean;
  installerUrl?: string;
  env: NodeJS.ProcessEnv;
}): void {
  const shell = buildHermesInstallerShell({
    interactive: params.interactive,
    installerUrl: params.installerUrl,
  });

  execFileSync("bash", ["-lc", shell], {
    stdio: params.interactive ? "inherit" : ["ignore", "pipe", "pipe"],
    env: params.env,
  });
}

export function ensureHermesSetup(options: EnsureHermesSetupOptions = {}): EnsureHermesSetupResult {
  const env = options.env ?? process.env;
  const workspacePath = options.workspacePath ?? process.env.DENCHCLAW_HERMES_WORKSPACE ?? process.cwd();
  const interactive = options.interactive ?? Boolean(process.stdin.isTTY);

  let hermesPath = resolveHermesBinary(env);
  let installedHermes = false;
  if (!hermesPath) {
    installHermes({
      interactive,
      installerUrl: options.installerUrl,
      env,
    });
    hermesPath = resolveHermesBinary(env);
    installedHermes = true;
  }

  if (!hermesPath) {
    throw new Error("Hermes CLI could not be found after installation.");
  }

  const hermesBinDir = path.dirname(hermesPath);
  const existingPath = env.PATH ?? "";
  if (!existingPath.split(path.delimiter).includes(hermesBinDir)) {
    env.PATH = [hermesBinDir, existingPath].filter(Boolean).join(path.delimiter);
  }
  env.HERMES_BIN = hermesPath;
  env.HERMES_WORKSPACE = workspacePath;

  const configPath = resolveHermesConfigPath(env);
  const existing = parseHermesConfig(configPath);
  const merged = mergeHermesConfig(existing, workspacePath);
  const existingYaml = existing ? YAML.stringify(existing) : null;
  const mergedYaml = YAML.stringify(merged);
  const wroteConfig = existingYaml !== mergedYaml;
  if (wroteConfig) {
    writeHermesConfig(configPath, merged);
  }

  return {
    hermesPath,
    hermesHome: resolveHermesHome(env),
    configPath,
    workspacePath,
    installedHermes,
    wroteConfig,
  };
}

export function runNextDevWithHermes(params: {
  workspacePath: string;
  port?: number;
  env?: NodeJS.ProcessEnv;
}): never {
  const env = { ...(params.env ?? process.env), HERMES_WORKSPACE: params.workspacePath };
  ensureHermesSetup({ workspacePath: params.workspacePath, env });
  const child = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["next", "dev", "--port", String(params.port ?? 3010)], {
    stdio: "inherit",
    env,
    cwd: params.workspacePath,
  });
  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });
  child.on("error", (error) => {
    console.error("[denchclaw] Failed to start Next.js dev server:", error);
    process.exit(1);
  });
  throw new Error("unreachable");
}
