import type { Command } from "commander";
import { defaultRuntime } from "../../runtime.js";
import { runCommandWithRuntime } from "../cli-utils.js";
import { bootstrapCommand } from "../bootstrap.js";

export function registerUpdateCommand(program: Command) {
  program
    .command("update")
    .description("Refresh Dench managed web runtime and Hermes workspace setup")
    .option("--profile <name>", "Compatibility flag; ignored")
    .option("--web-port <port>", "Web runtime port override")
    .option("--non-interactive", "Skip interactive Hermes installer/setup prompts where possible", false)
    .option("--yes", "Auto-approve install prompts where possible", false)
    .option("--no-open", "Do not open the browser automatically")
    .option("--skip-daemon-install", "Ignored (Hermes setup does not use the old gateway daemon)", false)
    .option("--json", "Output summary as JSON", false)
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await bootstrapCommand({
          webPort: opts.webPort as string | undefined,
          nonInteractive: Boolean(opts.nonInteractive),
          yes: Boolean(opts.yes),
          noOpen: Boolean(opts.open === false),
          json: Boolean(opts.json),
        });
      });
    });
}
