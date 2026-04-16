import type { Command } from "commander";
import { defaultRuntime } from "../../runtime.js";
import { runCommandWithRuntime } from "../cli-utils.js";
import { restartCommand } from "../bootstrap.js";

export function registerRestartCommand(program: Command) {
  program
    .command("restart")
    .description("Restart Dench managed web runtime with Hermes configured for this workspace")
    .option("--profile <name>", "Compatibility flag; ignored")
    .option("--web-port <port>", "Web runtime port override")
    .option("--no-open", "Do not open the browser automatically")
    .option("--skip-daemon-install", "Ignored (Hermes setup does not use the old gateway daemon)", false)
    .option("--json", "Output summary as JSON", false)
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await restartCommand({
          webPort: opts.webPort as string | undefined,
          json: Boolean(opts.json),
        });
      });
    });
}
