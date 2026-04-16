import type { Command } from "commander";
import { defaultRuntime } from "../../runtime.js";
import { formatDocsLink } from "../../terminal/links.js";
import { theme } from "../../terminal/theme.js";
import { bootstrapCommand } from "../bootstrap.js";
import { runCommandWithRuntime } from "../cli-utils.js";

export function registerBootstrapCommand(program: Command) {
  program
    .command("bootstrap")
    .description("Bootstrap DenchClaw with Hermes AI and open the web UI")
    .option("--profile <name>", "Compatibility flag; ignored (Hermes has no profiles)")
    .option("--force-onboard", "Run onboarding even if config already exists", false)
    .option("--non-interactive", "Skip prompts where possible", false)
    .option("--yes", "Auto-approve install prompts", false)
    .option("--skip-update", "Skip update prompt/check", false)
    .option("--update-now", "Ignored (Hermes does not need update)", false)
    .option("--gateway-port <port>", "Ignored (no gateway; Hermes uses HTTP API)")
    .option("--web-port <port>", "Preferred web UI port (default: 3010)")
    .option("--dench-cloud", "Configure Dench Cloud and skip provider onboarding", false)
    .option("--dench-cloud-api-key <key>", "Hermes API key for bootstrap-driven setup")
    .option("--dench-cloud-model <id>", "Hermes model id to use as default")
    .option("--dench-gateway-url <url>", "Override the Hermes API base URL")
    .option("--skip-daemon-install", "Ignored (no gateway daemon needed)", false)
    .option("--no-open", "Do not open the browser automatically")
    .option("--json", "Output summary as JSON", false)
    .addHelpText(
      "after",
      () =>
        `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/onboard", "docs.denchclaw.ai/cli/onboard")}\n`,
    )
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await bootstrapCommand({
          profile: opts.profile as string | undefined,
          forceOnboard: Boolean(opts.forceOnboard),
          nonInteractive: Boolean(opts.nonInteractive),
          yes: Boolean(opts.yes),
          skipUpdate: Boolean(opts.skipUpdate),
          updateNow: Boolean(opts.updateNow),
          gatewayPort: opts.gatewayPort as string | undefined,
          webPort: opts.webPort as string | undefined,
          denchCloud: opts.denchCloud ? true : undefined,
          denchCloudApiKey: opts.denchCloudApiKey as string | undefined,
          denchCloudModel: opts.denchCloudModel as string | undefined,
          denchGatewayUrl: opts.denchGatewayUrl as string | undefined,
          skipDaemonInstall: Boolean(opts.skipDaemonInstall),
          noOpen: Boolean(opts.open === false),
          json: Boolean(opts.json),
        });
      });
    });
}
