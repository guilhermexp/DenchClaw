import type { NextConfig } from "next";
import { readFileSync } from "node:fs";
import path from "node:path";
import { homedir } from "node:os";
import { createRequire } from "node:module";

const rootPkg = JSON.parse(
  readFileSync(path.join(import.meta.dirname, "..", "..", "package.json"), "utf-8"),
) as { version?: string };

let openclawVersion = "";
try {
  const req = createRequire(import.meta.url);
  const oclPkg = req("openclaw/package.json") as { version?: string };
  openclawVersion = oclPkg.version ?? "";
} catch { /* openclaw not resolvable at build time */ }

const denchVersion = rootPkg.version ?? "";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_DENCHCLAW_VERSION: denchVersion,
    NEXT_PUBLIC_OPENCLAW_VERSION: openclawVersion,
  },

  experimental: {
    devtoolSegmentExplorer: false,
  },

  async headers() {
    return [
      {
        source: "/((?!_next/static|_next/image|favicon\\.ico).*)",
        headers: [{ key: "X-Denchclaw-Version", value: denchVersion }],
      },
    ];
  },

  // Produce a self-contained standalone build so npm global installs
  // can run the web app with `node server.js` — no npm install or
  // next build required at runtime.
  output: "standalone",

  // Required for pnpm monorepos: trace dependencies from the workspace
  // root so the standalone build bundles its own node_modules correctly
  // instead of resolving through pnpm's virtual store symlinks.
  outputFileTracingRoot: path.join(import.meta.dirname, "..", ".."),

  // Externalize packages with native addons so webpack doesn't break them
  serverExternalPackages: ["ws", "bufferutil", "utf-8-validate", "node-pty"],

  // Transpile ESM-only packages so webpack can bundle them
  transpilePackages: ["react-markdown", "remark-gfm"],

  webpack: (config, { dev, isServer }) => {
    if (!isServer) {
      // html-to-docx references many Node-only modules. The editor only loads
      // that package on explicit DOCX save, so browser bundles should never try
      // to polyfill these builtins during normal app startup.
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        util: false,
        events: false,
        stream: false,
        http: false,
        https: false,
        url: false,
        punycode: false,
        crypto: false,
        zlib: false,
        encoding: false,
      };
    }
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: [
          "**/node_modules/**",
          "**/.git/**",
          "**/dist/**",
          "**/.next/**",
          path.join(homedir(), ".openclaw", "**"),
          path.join(homedir(), ".openclaw-*", "**"),
        ],
        poll: 1500,
      };
    }
    return config;
  },
};

export default nextConfig;
