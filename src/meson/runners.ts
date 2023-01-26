import * as vscode from "vscode";
import * as cp from "child_process";

import {
  exec,
  execAsTask,
  getOutputChannel,
  extensionConfiguration
} from "../utils";
import { getTask, MesonTaskMode } from "../tasks";
import { relative } from "path";
import { getMesonProjectInfo } from "./introspection";
import * as path from "path";

async function isMesonConfigured(buildPath: string) {
  try {
    return await getMesonProjectInfo(buildPath) != null;
  }
  catch (e) {
  }

  return false;
}

export async function runMesonConfigure(projectRoot: string, buildDir: string) {
  return vscode.window.withProgress(
    {
      title: "Configuring",
      location: vscode.ProgressLocation.Notification,
      cancellable: false
    },
    async progress => {
      progress.report({ message: `Checking if Meson is configured in ${buildDir}...` });

      const configureOpts = extensionConfiguration("configureOptions");
      const setupOpts = extensionConfiguration("setupOptions");
      let res: { stdout: string; stderr: string, error?: cp.ExecException };

      try {
        if (await isMesonConfigured(path.resolve(projectRoot, buildDir))) {
          progress.report({ message: `Meson already configured in ${buildDir}`, increment: 100 });
        } else {
          progress.report({ message: `Configuring Meson into ${buildDir}...` });
          res = await exec(extensionConfiguration("mesonPath"), ["setup", ...configureOpts, ...setupOpts, buildDir], { cwd: projectRoot });
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
          progress.report({ message: `Meson successfully configured into ${buildDir}`, increment: 100 });
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

export function makeTaskTitle(taskMode: MesonTaskMode, buildDir: string, name?: string) {
  const mode = taskMode[0].toUpperCase() + taskMode.slice(1)

  return `${mode} ${name ? `${name}` : "project"} in ${path.basename(buildDir)}`;
}

export async function runMesonBuild(buildDir: string, name: string, targetName: string | null) {
  const title = makeTaskTitle("build", buildDir, targetName ?? name);
  getOutputChannel().append(`\n${title}\n`);

  // TODO $gcc $msBuild (or whatever it is) should figure out from the builddir's compiler.
  const args = ["compile"].concat(targetName ?? []);
  const res = await execAsTask(extensionConfiguration("mesonPath"), args, { cwd: buildDir }, vscode.TaskRevealKind.Always, "$meson-gcc", title);

  // TODO this is wrong: haven't really waited for the task!!
  getOutputChannel().append(`${title} finished.\n`);

  return res;
}

export async function runMesonTests(buildDir: string, isBenchmark: boolean, name?: string) {
  try {
    const benchmarkArgs = isBenchmark ? ["--benchmark"] : [];
    const args = ["test", "--verbose", ...benchmarkArgs].concat(name ?? []);
    const title = makeTaskTitle(isBenchmark ? "benchmark" : "test", buildDir, name);

    // Running test might build, so specify problemMatcher.
    return await execAsTask(
      extensionConfiguration("mesonPath"), args,
      { cwd: buildDir },
      vscode.TaskRevealKind.Always,
      "$meson-gcc", title);
  } catch (e) {
    if (e.stderr) {
      vscode.window.showErrorMessage(`${isBenchmark ? "Benchmarks" : "Tests"} failed.`);
    }
  }
}
