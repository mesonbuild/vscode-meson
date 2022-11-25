import * as vscode from "vscode";
import {
  getMesonTargets,
  getMesonTests,
  getMesonBenchmarks
} from "./meson/introspection";
import { extensionConfiguration, getOutputChannel, getTargetName } from "./utils";

interface MesonTaskDefinition extends vscode.TaskDefinition {
  type: "meson";
  target?: string;
  mode?: "build" | "run" | "test" | "benchmark" | "clean" | "reconfigure" | "install";
  filename?: string;
}

export async function getMesonTasks(buildDir: string): Promise<vscode.Task[]> {
  try {
    const [targets, tests, benchmarks] = await Promise.all([
      getMesonTargets(buildDir),
      getMesonTests(buildDir),
      getMesonBenchmarks(buildDir)
    ]);
    const defaultBuildTask = new vscode.Task(
      { type: "meson", mode: "build" },
      "Build all targets",
      "Meson",
      new vscode.ProcessExecution(extensionConfiguration("mesonPath"), ["compile", "-C", buildDir]),
      "$meson-gcc"
    );
    const defaultTestTask = new vscode.Task(
      { type: "meson", mode: "test" },
      "Run tests",
      "Meson",
      new vscode.ProcessExecution(extensionConfiguration("mesonPath"), ["test"], { cwd: buildDir })
    );
    const defaultBenchmarkTask = new vscode.Task(
      { type: "meson", mode: "benchmark" },
      "Run benchmarks",
      "Meson",
      new vscode.ProcessExecution(extensionConfiguration("mesonPath"), ["test", "--benchmark", "--verbose"], { cwd: buildDir })
    );
    const defaultReconfigureTask = new vscode.Task(
      { type: "meson", mode: "reconfigure" },
      "Reconfigure",
      "Meson",
      // Note "setup --reconfigure" needs to be run from the root.
      new vscode.ProcessExecution(extensionConfiguration("mesonPath"), ["setup", "--reconfigure", buildDir],
        { cwd: vscode.workspace.rootPath })
    );
    const defaultInstallTask = new vscode.Task(
      { type: "meson", mode: "install" },
      "Run install",
      "Meson",
      new vscode.ProcessExecution(extensionConfiguration("mesonPath"), ["install"], { cwd: buildDir })
    );
    const defaultCleanTask = new vscode.Task(
      { type: "meson", mode: "clean" },
      "Clean",
      "Meson",
      new vscode.ProcessExecution(extensionConfiguration("mesonPath"), ["compile", "--clean"], { cwd: buildDir })
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
      defaultCleanTask,
      defaultInstallTask
    ];
    tasks.push(
      ...(await Promise.all(
        targets.map(async t => {
          const targetName = await getTargetName(t);
          const def: MesonTaskDefinition = {
            type: "meson",
            target: targetName,
            mode: "build"
          };
          const buildTask = new vscode.Task(
            def,
            `Build ${targetName}`,
            "Meson",
            new vscode.ProcessExecution(extensionConfiguration("mesonPath"), ["compile", targetName], {
              cwd: buildDir
            }),
            "$meson-gcc"
          );
          buildTask.group = vscode.TaskGroup.Build;
          if (t.type == "executable") {
            if (t.filename.length == 1) {
              const runTask = new vscode.Task(
                { type: "meson", target: targetName, mode: "run" },
                `Run ${targetName}`,
                "Meson",
                new vscode.ProcessExecution(t.filename[0])
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
                  new vscode.ProcessExecution(f, {
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
      )).flat(1),
      ...tests.map(t => {
        const testTask = new vscode.Task(
          { type: "meson", mode: "test", target: t.name },
          `Test ${t.name}`,
          "Meson",
          new vscode.ProcessExecution(extensionConfiguration("mesonPath"), ["test", t.name], {
            env: t.env,
            cwd: buildDir
          })
        );
        testTask.group = vscode.TaskGroup.Test;
        return testTask;
      }),
      ...benchmarks.map(b => {
        const benchmarkTask = new vscode.Task(
          { type: "meson", mode: "benchmark", target: b.name },
          `Benchmark ${b.name}`,
          "Meson",
          new vscode.ProcessExecution(extensionConfiguration("mesonPath"), ["test", "--benchmark", "--verbose", b.name], {
            env: b.env,
            cwd: buildDir
          })
        );
        benchmarkTask.group = vscode.TaskGroup.Test;
        return benchmarkTask;
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

export async function getTask(mode: string, name?: string) {
  const tasks = await vscode.tasks.fetchTasks({ type: "meson" });
  const filtered = tasks.filter(
    t => t.definition.mode === mode && (!name || t.definition.target === name)
  );
  if (filtered.length === 0)
    throw new Error(`Cannot find ${mode} target ${name}.`);
  return filtered[0];
}
