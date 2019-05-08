"use strict";

import * as path from "path";
import * as vscode from "vscode";
import { getMesonTargets } from "./meson/introspection";
import { exists, exec, getOutputChannel } from "./utils";

interface MesonTaskDefinition extends vscode.TaskDefinition {
  type: "meson";
  task: string;
}

export async function getMesonTasks(buildDir: string): Promise<vscode.Task[]> {
  try {
    const targets = await getMesonTargets(buildDir);
    const tasks = [
      new vscode.Task(
        { type: "meson", task: "build all" },
        "build all",
        "meson",
        new vscode.ShellExecution("ninja", { cwd: buildDir })
      ),
      new vscode.Task(
        { type: "meson", task: "reconfigure" },
        "reconfigure",
        "meson",
        new vscode.ShellExecution("ninja reconfigure", { cwd: buildDir })
      ),
      new vscode.Task(
        { type: "meson", task: "clean" },
        "clean",
        "meson",
        new vscode.ShellExecution("ninja clean", { cwd: buildDir })
      )
    ];
    tasks.push(
      ...targets.map(t => {
        const def: MesonTaskDefinition = { type: "meson", task: t.name };
        const task = new vscode.Task(
          def,
          t.name,
          "meson",
          new vscode.ShellExecution(`ninja ${t.name}`, { cwd: buildDir })
        );
        task.group = vscode.TaskGroup.Build;
        return task;
      })
    );
    return tasks;
  } catch (e) {
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
        task: taskName
      };
      let task = new vscode.Task(
        kind,
        taskName,
        "meson",
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
