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

export async function runMesonBuild(buildDir: string, name?: string) {
  const title = `Building ${name ? `target ${name}` : "project"} in ${buildDir}`;
  let taskExecution: Thenable<vscode.TaskExecution> | null = null;

  getOutputChannel().append(`\n${title}\n`);

  // If there's a task defined for this target and its cwd matches this build dir, use it. This is the only way to get problem matchers to work currently:
  // "$gcc" is insufficient as "fileLocation" is required for sane behaviour.

  try {
    const task = await getTask("build", name);

    if ((task.execution as vscode.ProcessExecution)?.options?.cwd == buildDir) {
      // Note hacking in task.execution.options.cwd doesn't work; it still uses the original directory.
      // task.execution = new ProcessExecution "works" but the problem matcher doesn't.

      task.presentationOptions.reveal = vscode.TaskRevealKind.Always;
      taskExecution = vscode.tasks.executeTask(task);
    }
  }
  catch (err) {
  }

  if (taskExecution == null) {
    // Otherwise the best we can do is just invoke meson with a default problem matcher. It may not be able to resolve files very well.

    // TODO not quite sure when this would be the case. Tasks are built up from available targets,
    // and this function is only called on those targets (or build all).
    // TODO $gcc $msBuild (or whatever it is) should figure out from the builddir's compiler.
    const args = ["compile"].concat(name ?? []);
    taskExecution = execAsTask(extensionConfiguration("mesonPath"), args, { cwd: buildDir }, vscode.TaskRevealKind.Always, "$gcc");
  }

  const res = await taskExecution;

  // TODO this is wrong: haven't really waited for the task!!
  getOutputChannel().append(`${title} finished.\n`);

  return res;
}

export async function runMesonBuild2(buildDir: string, name?: string) {
  const title = `Building ${name ? `target ${name}` : "project"} in ${buildDir}`;

  getOutputChannel().append(`\n${title}\n`);

  const command = extensionConfiguration("mesonPath");
  const args = ["compile"].concat(name ?? []);

  const task = new vscode.Task(
    { type: "temp" },
    command,
    "Meson",
    new vscode.ProcessExecution(command, args, { cwd: buildDir }),
    "$gcc"
  );

  // TODO bah. Can only give the name, not the full detail with path, like this:
  let problemMatcher = {
    base: "$gcc",
    fileLocation: ["autodetect", buildDir]
  };

  task.presentationOptions.echo = true;
  task.presentationOptions.focus = true;
  task.presentationOptions.reveal = vscode.TaskRevealKind.Always;

  await vscode.tasks.executeTask(task);

  getOutputChannel().append(`${title} finished.\n`);
}

export async function runMesonTests(buildDir: string, isBenchmark: boolean, name?: string) {
  try {
    const benchmarkArgs = isBenchmark ? ["--benchmark"] : [];
    const args = ["test", "--verbose", ...benchmarkArgs].concat(name ?? []);
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
