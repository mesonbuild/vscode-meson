import * as vscode from "vscode";
import {
  exec,
  getOutputChannel,
  extensionConfiguration,
  execStream
} from "../utils";
import { getTask } from "../tasks";
import { relative } from "path";
import { checkMesonIsConfigured } from "./utils";
import { genEnvFile } from "../utils";

export async function runMesonConfigure(source: string, build: string) {
  return vscode.window.withProgress(
    {
      title: "Configuring",
      location: vscode.ProgressLocation.Notification,
      cancellable: false
    },
    async progress => {
      progress.report({
        message: `Checking if Meson is configured in ${relative(
          source,
          build
        )}...`
      });

      const configureOpts = extensionConfiguration("configureOptions");
      const setupOpts = extensionConfiguration("setupOptions");

      if (!await checkMesonIsConfigured(build)) {
        progress.report({
          message: `Configuring Meson into ${relative(source, build)}...`
        });

        const { stdout, stderr } = await exec(
          extensionConfiguration("mesonPath"), ["setup", ...configureOpts, ...setupOpts, build],
          { cwd: source });

        getOutputChannel().appendLine(stdout);
        getOutputChannel().appendLine(stderr);

        if (stderr.length > 0) {
          getOutputChannel().show(true);
        }
      }

      progress.report({ message: "Done.", increment: 100 });
      return new Promise(res => setTimeout(res, 2000));
    }
  );
}
