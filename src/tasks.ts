"use strict";

import * as path from "path";
import * as vscode from "vscode";
import { getMesonTargets, getMesonTests } from "./meson/introspection";
import { exists, exec, getOutputChannel } from "./utils";

import "array-flat-polyfill";

interface MesonTaskDefinition extends vscode.TaskDefinition {
  type: "meson";
  target: string;
  mode?: "build" | "run";
  filename?: string;
}

export async function getMesonTasks(buildDir: string): Promise<vscode.Task[]> {
  try {
    // const targets = await getMesonTargets(buildDir);
    const [targets, tests] = await Promise.all([
      getMesonTargets(buildDir),
      getMesonTests(buildDir)
    ]);
    const defaultBuildTask = new vscode.Task(
      { type: "meson", mode: "build" },
      "Build all targets",
      "Meson",
      new vscode.ShellExecution("ninja", { cwd: buildDir })
    );
    const defaultTestTask = new vscode.Task(
      { type: "meson", mode: "test" },
      "Run tests",
      "Meson",
      new vscode.ShellExecution("ninja test", { cwd: buildDir })
    );
    const defaultBenchmarkTask = new vscode.Task(
      { type: "meson", target: "benchmark" },
      "Run benchmarks",
      "Meson",
      new vscode.ShellExecution("ninja benchmark", { cwd: buildDir })
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
    defaultBenchmarkTask.group = vscode.TaskGroup.Test;
    defaultReconfigureTask.group = vscode.TaskGroup.Rebuild;
    defaultCleanTask.group = vscode.TaskGroup.Clean;
    const tasks = [
      defaultBuildTask,
      defaultTestTask,
      defaultBenchmarkTask,
      defaultReconfigureTask,
      defaultCleanTask
    ];
    tasks.push(
      ...targets
        .map(t => {
          const targetName = path.join(
            path.relative(
              vscode.workspace.rootPath,
              path.dirname(t.defined_in)
            ),
            t.name
          );
          const def: MesonTaskDefinition = {
            type: "meson",
            target: targetName,
            mode: "build"
          };
          const buildTask = new vscode.Task(
            def,
            `Build ${targetName}`,
            "Meson",
            new vscode.ShellExecution(`ninja ${targetName}`, { cwd: buildDir })
          );
          buildTask.group = vscode.TaskGroup.Build;
          if (t.type == "executable") {
            if (t.filename.length == 1) {
              const runTask = new vscode.Task(
                { type: "meson", target: targetName, mode: "run" },
                `Run ${targetName}`,
                "Meson",
                new vscode.ShellExecution(t.filename[0])
              );
              runTask.group = vscode.TaskGroup.Test;
              return [buildTask, runTask];
            } else {
              const runTasks = t.filename.map(f => {
                const runTask = new vscode.Task(
                  {
                    type: "meson",
                    target: targetName,
                    filename: f,
                    mode: "run"
                  },
                  `Run ${targetName}: ${f}`,
                  "Meson",
                  new vscode.ShellExecution(f, {
                    cwd: vscode.workspace.rootPath
                  })
                );
                runTask.group = vscode.TaskGroup.Test;
                return runTask;
              });
              return [buildTask, ...runTasks];
            }
          }
          return buildTask;
        })
        .flat(1),
      ...tests.map(t => {
        const testTask = new vscode.Task(
          { type: "meson", mode: "test", target: t.name },
          `Test ${t.name}`,
          "Meson",
          new vscode.ShellExecution(`meson test ${t.name}`, {
            env: t.env,
            cwd: buildDir
          })
        );
        testTask.group = vscode.TaskGroup.Test;
        return testTask;
      })
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
}

export async function getBuildTask(name?: string) {
  return getTask(name || "all", "build");
}

export async function getRunTask(name: string) {
  return getTask(name, "run");
}

async function getTask(name: string, mode: string) {
  const tasks = await vscode.tasks.fetchTasks({ type: "meson" });
  const filtered = tasks.filter(
    t => t.definition.mode === mode && t.definition.target === name
  );
  if (filtered.length === 0)
    throw new Error(`Cannot find ${mode} target ${name}.`);
  return filtered[0];
}
