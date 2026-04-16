import type { Command } from "commander";
import { defaultRuntime } from "../../runtime.js";
import { runCommandWithRuntime } from "../cli-utils.js";
import { stopCommand } from "../bootstrap.js";

export function registerStopCommand(program: Command) {
  program
    .command("stop")
    .description("Stop Dench managed web runtime")
    .option("--profile <name>", "Compatibility flag; ignored")
    .option("--web-port <port>", "Web runtime port override")
    .option("--skip-daemon-install", "Ignored (Hermes setup does not use the old gateway daemon)", false)
    .option("--json", "Output summary as JSON", false)
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await stopCommand({
          webPort: opts.webPort as string | undefined,
          json: Boolean(opts.json),
        });
      });
    });
}
