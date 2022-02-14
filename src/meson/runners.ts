import * as vscode from "vscode";
import * as cp from "child_process";

import {
  exec,
  execAsTask,
  getOutputChannel,
  extensionConfiguration
} from "../utils";
import { getTask } from "../tasks";
import { relative } from "path";
import { getMesonProjectInfo } from "./introspection";

async function isMesonConfigured(buildPath: string) {
  try {
    return await getMesonProjectInfo(buildPath) != null;
  }
  catch (e) {
  }

  return false;
}

export async function runMesonConfigure(source: string, buildPath: string) {
  return vscode.window.withProgress(
    {
      title: "Configuring",
      location: vscode.ProgressLocation.Notification,
      cancellable: false
    },
    async progress => {
      const relBuildDir = relative(source, buildPath);
      progress.report({ message: `Checking if Meson is configured in ${relBuildDir}...` });

      const configureOpts = extensionConfiguration("configureOptions");
      const setupOpts = extensionConfiguration("setupOptions");
      let res: { stdout: string; stderr: string, error?: cp.ExecException };

      try {
        if (await isMesonConfigured(buildPath)) {
          progress.report({ message: `Meson already configured in ${relBuildDir}`, increment: 100 });
        } else {
          progress.report({ message: `Configuring Meson into ${relBuildDir}...` });
          res = await exec(extensionConfiguration("mesonPath"), ["setup", ...configureOpts, ...setupOpts, buildPath], { cwd: source });
        }
      }
      catch (e) {
        res = e;
      }

      let timeout = 2000;

      if (res != null) {
        if (res.error != null) {
          progress.report({ message: res.error.message, increment: 100 });
          getOutputChannel().appendLine(res.error.message);
          timeout = 5000;
        } else {
          progress.report({ message: `Meson successfully configured into ${relBuildDir}`, increment: 100 });
        }

        getOutputChannel().appendLine(res.stdout);
        getOutputChannel().appendLine(res.stderr);

        if ((res.stderr.length > 0) || (res.error != null)) {
          getOutputChannel().show(true);
        }
      }

      return new Promise(res => setTimeout(res, timeout));
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

export async function runMesonBuild(buildDir: string, name?: string) {

  try {
    await vscode.tasks.executeTask(await getTask("build", name));
  } catch (e) {
    vscode.window.showErrorMessage(`Could not build ${name}`);
    getOutputChannel().appendLine(`Building target ${name}:`);
    getOutputChannel().appendLine(e);
    getOutputChannel().show(true);
  }

  return;
}

export async function runMesonTests(buildDir: string, isBenchmark: boolean, name?: string) {
  try {
    const benchmarkArgs = isBenchmark ? ["--benchmark", "--verbose"] : [];
    const args = ["test", ...benchmarkArgs].concat(name ?? []);
    return await execAsTask(
      extensionConfiguration("mesonPath"), args,
      { cwd: buildDir },
      vscode.TaskRevealKind.Always
    );
  } catch (e) {
    if (e.stderr) {
      vscode.window.showErrorMessage(`${isBenchmark ? "Benchmarks" : "Tests"} failed.`);
    }
  }
}
