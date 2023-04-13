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

export async function runMesonReconfigure() {
  try {
    await vscode.tasks.executeTask(await getTask("reconfigure"));
  } catch (e) {
    vscode.window.showErrorMessage("Could not reconfigure project.");
    getOutputChannel().appendLine("Reconfiguring Meson:");
    getOutputChannel().appendLine(e);
    getOutputChannel().show(true);
  }
}

export async function runMesonInstall() {
  try {
    await vscode.tasks.executeTask(await getTask("install"));
  } catch (e) {
    vscode.window.showErrorMessage("Could not install project.");
    getOutputChannel().appendLine("Installing:");
    getOutputChannel().appendLine(e);
    getOutputChannel().show(true);
  }
}

export async function runTask(task: vscode.Task) {
  try {
    await vscode.tasks.executeTask(task);
  } catch (e) {
    vscode.window.showErrorMessage(`Could not ${task.definition.mode} ${task.name}`);
    getOutputChannel().appendLine(`Running task ${task.name}:`);
    getOutputChannel().appendLine(e);
    getOutputChannel().show(true);
  }
}
