import * as vscode from "vscode";
import {
  exec,
  execAsTask,
  getOutputChannel,
  extensionConfiguration
} from "../utils";
import { getTask } from "../tasks";
import { existsSync } from "fs";
import { join, relative } from "path";
import { checkMesonIsConfigured } from "./utils";

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
      if (await checkMesonIsConfigured(build)) {
        progress.report({
          message: "Applying configure options...",
          increment: 30
        });
        await execAsTask(
          `meson configure ${extensionConfiguration("configureOptions").join(
            " "
          )} ${build}`,
          { cwd: source }
        );
        progress.report({ message: "Reconfiguring build...", increment: 60 });
        await vscode.tasks.executeTask(await getTask("reconfigure"));
      } else {
        progress.report({
          message: `Configuring Meson into ${relative(source, build)}...`
        });
        const configureOpts = extensionConfiguration("configureOptions").join(
          " "
        );
        await execAsTask(`meson ${configureOpts} ${build}`, { cwd: source });
      }
      progress.report({ message: "Done.", increment: 100 });
    }
  );
}

export async function runMesonReconfigure() {
  try {
    await vscode.tasks.executeTask(await getTask("reconfigure"));
  } catch (e) {
    vscode.window.showErrorMessage("Couldn't reconfigure project.");
  }
}

export async function runMesonBuild(name?: string) {
  try {
    await vscode.tasks.executeTask(await getTask("build", name));
  } catch (e) {
    vscode.window.showErrorMessage("Build failed.\n\n" + e);
  }
}

export async function runMesonTests(build: string, name?: string) {
  try {
    if (name) return await execAsTask(`meson test ${name}`, { cwd: build });
    return await execAsTask("ninja test", { cwd: build });
  } catch (e) {
    if (e.stderr) {
      vscode.window.showErrorMessage("Tests failed.");
    }
  }
}
