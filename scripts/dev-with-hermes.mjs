#!/usr/bin/env node
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import YAML from "yaml";

const INSTALLER_URL = "https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh";
const workspacePath = process.cwd();
const hermesHome = process.env.HERMES_HOME?.trim() || path.join(os.homedir(), ".hermes");
const configPath = path.join(hermesHome, "config.yaml");

function resolveHermesBinary() {
  const candidates = [
    process.env.HERMES_BIN?.trim(),
    "hermes",
    path.join(os.homedir(), ".local", "bin", "hermes"),
    path.join(hermesHome, "hermes-agent", "venv", "bin", "hermes"),
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      const output = execFileSync("bash", ["-lc", `command -v ${candidate.includes("/") ? `'${candidate.replace(/'/g, `'\\''`)}'` : candidate}`], {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      if (output) return output;
    } catch {
      if (candidate.includes("/") && existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function installHermes() {
  const interactive = Boolean(process.stdin.isTTY);
  const command = interactive
    ? `curl -fsSL ${INSTALLER_URL} | bash`
    : `curl -fsSL ${INSTALLER_URL} | bash -s -- --skip-setup`;
  execFileSync("bash", ["-lc", command], {
    stdio: interactive ? "inherit" : ["ignore", "pipe", "pipe"],
    env: process.env,
  });
}

function mergeConfig(existing) {
  const next = existing && typeof existing === "object" ? { ...existing } : {};
  const toolsets = Array.isArray(next.toolsets) ? [...next.toolsets] : [];
  if (!toolsets.includes("hermes-cli")) toolsets.push("hermes-cli");
  next.toolsets = toolsets;
  const terminal = next.terminal && typeof next.terminal === "object" ? { ...next.terminal } : {};
  terminal.cwd = workspacePath;
  next.terminal = terminal;
  return next;
}

let hermesPath = resolveHermesBinary();
if (!hermesPath) {
  console.log("[denchclaw] Hermes not found. Installing Hermes Agent...");
  installHermes();
  hermesPath = resolveHermesBinary();
}

if (!hermesPath) {
  console.error("[denchclaw] Hermes installation did not produce a usable `hermes` command.");
  process.exit(1);
}

const existing = existsSync(configPath)
  ? YAML.parse(readFileSync(configPath, "utf-8"))
  : null;
const merged = mergeConfig(existing);
mkdirSync(path.dirname(configPath), { recursive: true });
writeFileSync(configPath, YAML.stringify(merged), "utf-8");

const env = {
  ...process.env,
  HERMES_BIN: hermesPath,
  HERMES_WORKSPACE: workspacePath,
  PATH: [path.dirname(hermesPath), process.env.PATH || ""].filter(Boolean).join(path.delimiter),
};

const nextBin = process.platform === "win32" ? "npx.cmd" : "npx";
const child = spawn(nextBin, ["next", "dev", "--port", "3010"], {
  cwd: workspacePath,
  stdio: "inherit",
  env,
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
