"use strict";

import * as path from "path";
import * as vscode from "vscode";
import { getMesonTargets } from "./meson/introspection";
import { exists, exec, getOutputChannel } from "./utils";

import "array-flat-polyfill";

interface MesonTaskDefinition extends vscode.TaskDefinition {
  type: "meson";
  target: string;
  mode?: "build" | "run";
}

export async function getMesonTasks(buildDir: string): Promise<vscode.Task[]> {
  try {
    const targets = await getMesonTargets(buildDir);
    const defaultBuildTask = new vscode.Task(
      { type: "meson", target: "all", mode: "build" },
      "Build all targets",
      "Meson",
      new vscode.ShellExecution("ninja", { cwd: buildDir })
    );
    const defaultTestTask = new vscode.Task(
      { type: "meson", target: "test" },
      "Run tests",
      "Meson",
      new vscode.ShellExecution("ninja test", { cwd: buildDir })
    );
    const defaultReconfigureTask = new vscode.Task(
      { type: "meson", target: "reconfigure" },
      "Reconfigure",
      "Meson",
      new vscode.ShellExecution("ninja reconfigure", { cwd: buildDir })
    );
    const defaultCleanTask = new vscode.Task(
      { type: "meson", target: "clean" },
      "Clean",
      "Meson",
      new vscode.ShellExecution("ninja clean", { cwd: buildDir })
    );
    defaultBuildTask.group = vscode.TaskGroup.Build;
    defaultTestTask.group = vscode.TaskGroup.Test;
    defaultReconfigureTask.group = vscode.TaskGroup.Rebuild;
    defaultCleanTask.group = vscode.TaskGroup.Clean;
    const tasks = [
      defaultBuildTask,
      defaultTestTask,
      defaultReconfigureTask,
      defaultCleanTask
    ];
    tasks.push(
      ...targets
        .map(t => {
          const def: MesonTaskDefinition = {
            type: "meson",
            target: t.name,
            mode: "build"
          };
          const buildTask = new vscode.Task(
            def,
            `Build ${t.name}`,
            "Meson",
            new vscode.ShellExecution(`ninja ${t.name}`, { cwd: buildDir })
          );
          buildTask.group = vscode.TaskGroup.Build;
          if (t.type == "executable") {
            const runTask = new vscode.Task(
              {
                type: "meson",
                target: t.name,
                mode: "run"
              },
              `Run ${t.name}`,
              "Meson",
              new vscode.ShellExecution(path.join(buildDir, t.filename), {
                cwd: vscode.workspace.rootPath
              })
            );
            runTask.group = vscode.TaskGroup.Test;
            return [buildTask, runTask];
          }
          return buildTask;
        })
        .flat(1)
    );
    return tasks;
  } catch (e) {
    getOutputChannel().appendLine(e);
    if (e.stderr) getOutputChannel().appendLine(e.stderr);
    vscode.window.showErrorMessage(
      "Could not fetch targets. See Meson Build output tab for more info."
    );

    return [];
  }
  /* let emptyTasks: vscode.Task[] = [];
  if (!dir) {
    return emptyTasks;
  }
  let mesonFile = path.join(dir, "meson.build");
  if (!(await exists(mesonFile))) {
    return emptyTasks;
  }

  let commandLine = "meson . .meson";
  try {
    let { stdout, stderr } = await exec(commandLine, { cwd: dir });
    if (stderr && stderr.length > 0) {
      getOutputChannel().appendLine(stderr);
      getOutputChannel().show(true);
    }
    let result: vscode.Task[] = [];
    if (stdout) {
      let taskName = "build";
      let kind: MesonTaskDefinition = {
        type: "meson",
        target: taskName
      };
      let task = new vscode.Task(
        kind,
        taskName,
        "Meson",
        new vscode.ShellExecution("ninja", { cwd: dir + "/.meson" })
      );
      task.group = vscode.TaskGroup.Build;
      result.push(task);
    }
    return result;
  } catch (err) {
    const channel = getOutputChannel();
    if (err.stderr) {
      channel.appendLine(err.stderr);
    }
    if (err.stdout) {
      channel.appendLine(err.stdout);
    }
    channel.appendLine("Auto detecting meson task failed.");
    channel.show(true);
    return emptyTasks;
  } */
}

/*
const buildNames: string[] = ['build', 'compile', 'watch'];
function isBuildTask(name: string): boolean {
	for (let buildName of buildNames) {
		if (name.indexOf(buildName) !== -1) {
			return true;
		}
	}
	return false;
}

const testNames: string[] = ['test'];
function isTestTask(name: string): boolean {
	for (let testName of testNames) {
		if (name.indexOf(testName) !== -1) {
			return true;
		}
	}
	return false;
}
*/
