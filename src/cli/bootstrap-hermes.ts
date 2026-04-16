import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import * as process from "node:process";
import { resolveRequiredHomeDir } from "../infra/home-dir.js";
import { theme } from "../terminal/theme.js";
import {
  DEFAULT_WEB_APP_PORT,
  ensureManagedWebRuntime,
  readLastKnownWebPort,
  resolveCliPackageRoot,
  stopManagedWebRuntime,
} from "./web-runtime.js";
import {
  ensureHermesSetup,
  resolveRepoAppsWebWorkspace,
  type EnsureHermesSetupResult,
} from "./hermes-local-setup.js";

const LEGACY_STATE_DIRNAME = ".openclaw-dench";
const STATE_DIRNAME = ".denchclaw";
const CONFIG_FILENAME = "denchclaw.json";

export function resolveHermesStateDir(
  env: NodeJS.ProcessEnv = process.env,
  homeDir?: string,
): string {
  const home = homeDir ?? resolveRequiredHomeDir(env);
  return path.join(home, STATE_DIRNAME);
}

export function resolveLegacyStateDir(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const home = resolveRequiredHomeDir(env);
  return path.join(home, LEGACY_STATE_DIRNAME);
}

export type DenchClawBootstrapConfig = {
  version: number;
  hermes: {
    command: string;
    home: string;
    configPath: string;
    workspacePath: string;
  };
  webPort?: number;
  createdAt: string;
  updatedAt: string;
};

export type BootstrapOptions = {
  profile?: string;
  forceOnboard?: boolean;
  nonInteractive?: boolean;
  yes?: boolean;
  skipUpdate?: boolean;
  updateNow?: boolean;
  gatewayPort?: string;
  webPort?: string;
  denchCloud?: boolean;
  denchCloudApiKey?: string;
  denchCloudModel?: string;
  denchGatewayUrl?: string;
  skipDaemonInstall?: boolean;
  noOpen?: boolean;
  json?: boolean;
};

export type BootstrapResult = {
  success: boolean;
  stateDir: string;
  webUrl: string;
  webPort: number;
  config: DenchClawBootstrapConfig;
  hermes: EnsureHermesSetupResult;
  error?: string;
};

function resolveConfigPath(stateDir: string): string {
  return path.join(stateDir, CONFIG_FILENAME);
}

function readBootstrapConfig(stateDir: string): DenchClawBootstrapConfig | null {
  const configPath = resolveConfigPath(stateDir);
  if (!existsSync(configPath)) return null;
  try {
    return JSON.parse(readFileSync(configPath, "utf-8")) as DenchClawBootstrapConfig;
  } catch {
    return null;
  }
}

function writeBootstrapConfig(stateDir: string, config: DenchClawBootstrapConfig): void {
  writeFileSync(resolveConfigPath(stateDir), JSON.stringify(config, null, 2) + "\n", "utf-8");
}

function migrateLegacyStateDir(stateDir: string, legacyDir: string): void {
  if (existsSync(stateDir) || !existsSync(legacyDir)) return;
  try {
    const { renameSync } = require("node:fs") as typeof import("node:fs");
    renameSync(legacyDir, stateDir);
  } catch {
    // best effort
  }
}

function readPackageVersion(packageRoot: string): string {
  try {
    const pkg = JSON.parse(readFileSync(path.join(packageRoot, "package.json"), "utf-8")) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function ensureStateDir(stateDir: string): void {
  if (!existsSync(stateDir)) {
    mkdirSync(stateDir, { recursive: true });
  }
}

function ensureDefaultConfig(
  stateDir: string,
  hermes: EnsureHermesSetupResult,
  webPort: number,
): DenchClawBootstrapConfig {
  const existing = readBootstrapConfig(stateDir);
  const now = new Date().toISOString();
  const next: DenchClawBootstrapConfig = {
    version: 2,
    hermes: {
      command: hermes.hermesPath,
      home: hermes.hermesHome,
      configPath: hermes.configPath,
      workspacePath: hermes.workspacePath,
    },
    webPort,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  writeBootstrapConfig(stateDir, next);
  return next;
}

function parsePreferredWebPort(value?: string): number {
  const parsed = value ? Number.parseInt(value, 10) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return DEFAULT_WEB_APP_PORT;
}

async function ensureHermesAndRuntime(opts: BootstrapOptions): Promise<BootstrapResult> {
  const packageRoot = resolveCliPackageRoot();
  const workspacePath = resolveRepoAppsWebWorkspace(packageRoot);
  const interactive = !opts.nonInteractive && !opts.json && process.stdin.isTTY;
  const hermes = ensureHermesSetup({
    workspacePath,
    interactive,
  });

  const stateDir = resolveHermesStateDir();
  migrateLegacyStateDir(stateDir, resolveLegacyStateDir());
  ensureStateDir(stateDir);

  const webPort = opts.webPort
    ? parsePreferredWebPort(opts.webPort)
    : DEFAULT_WEB_APP_PORT;
  const config = ensureDefaultConfig(stateDir, hermes, webPort);

  process.env.HERMES_WORKSPACE = workspacePath;
  process.env.HERMES_BIN = hermes.hermesPath;

  const denchVersion = readPackageVersion(packageRoot);
  const runtime = await ensureManagedWebRuntime({
    stateDir,
    packageRoot,
    denchVersion,
    port: webPort,
    gatewayPort: 0,
  });

  return {
    success: runtime.ready,
    stateDir,
    webUrl: `http://localhost:${webPort}`,
    webPort,
    config,
    hermes,
    error: runtime.ready ? undefined : runtime.reason,
  };
}

export async function bootstrapCommand(opts: BootstrapOptions): Promise<BootstrapResult> {
  const result = await ensureHermesAndRuntime(opts);

  if (!opts.json) {
    console.log(theme.heading("DenchClaw Bootstrap (Hermes)"));
    console.log(theme.muted(`Hermes: ${result.hermes.hermesPath}`));
    console.log(theme.muted(`Hermes config: ${result.hermes.configPath}`));
    console.log(theme.muted(`Workspace: ${result.hermes.workspacePath}`));
    console.log(theme.muted(`Web UI: ${result.webUrl}`));
    if (result.hermes.installedHermes) {
      console.log(theme.success("Hermes was installed automatically."));
    }
    if (result.hermes.wroteConfig) {
      console.log(theme.success("Hermes config updated for this workspace."));
    }
    if (result.error) {
      console.error(theme.warn(`Web runtime not ready: ${result.error}`));
    }
  } else {
    console.log(JSON.stringify({
      success: result.success,
      stateDir: result.stateDir,
      webUrl: result.webUrl,
      webPort: result.webPort,
      hermesPath: result.hermes.hermesPath,
      hermesHome: result.hermes.hermesHome,
      hermesConfigPath: result.hermes.configPath,
      workspacePath: result.hermes.workspacePath,
      installedHermes: result.hermes.installedHermes,
      wroteHermesConfig: result.hermes.wroteConfig,
      error: result.error,
    }, null, 2));
  }

  return result;
}

export async function startCommand(opts: { webPort?: string; json?: boolean }): Promise<BootstrapResult> {
  return await bootstrapCommand({ webPort: opts.webPort, json: opts.json, noOpen: true });
}

export async function stopCommand(opts: {
  webPort?: string;
  json?: boolean;
}): Promise<{ stopped: boolean; port: number; stoppedPids: number[] }> {
  const stateDir = resolveHermesStateDir();
  const port = opts.webPort ? parsePreferredWebPort(opts.webPort) : DEFAULT_WEB_APP_PORT;
  const result = await stopManagedWebRuntime({
    stateDir,
    port,
    includeLegacyStandalone: true,
  });

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (result.stoppedPids.length > 0) {
    console.log(theme.success(`Stopped web runtime on port ${port} (PIDs: ${result.stoppedPids.join(", ")})`));
  } else {
    console.log(theme.muted(`No managed web runtime found on port ${port}`));
  }

  return { stopped: result.stoppedPids.length > 0, port: result.port, stoppedPids: result.stoppedPids };
}

export async function restartCommand(opts: {
  webPort?: string;
  json?: boolean;
}): Promise<BootstrapResult> {
  await stopCommand({ webPort: opts.webPort, json: false });
  return await startCommand({ webPort: opts.webPort, json: opts.json });
}

export type BootstrapDiagnostics = {
  stateDir: string;
  webPort: number;
  gatewayPort: number;
  version: string;
};

export function buildBootstrapDiagnostics(): BootstrapDiagnostics {
  const stateDir = resolveHermesStateDir();
  return {
    stateDir,
    webPort: readLastKnownWebPort(stateDir),
    gatewayPort: 0,
    version: readPackageVersion(resolveCliPackageRoot()),
  };
}

export function runBootstrap(opts: BootstrapOptions): Promise<BootstrapResult> {
  return bootstrapCommand(opts);
}
