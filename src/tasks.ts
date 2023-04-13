import * as vscode from "vscode";
import {
  getMesonTargets,
  getMesonTests,
  getMesonBenchmarks
} from "./meson/introspection";
import { extensionConfiguration, getOutputChannel, getTargetName, getEnvDict } from "./utils";
import { Test, Target } from "./meson/types";

interface MesonTaskDefinition extends vscode.TaskDefinition {
  type: "meson";
  target?: string;
  mode?: "build" | "run" | "test" | "benchmark" | "clean" | "reconfigure" | "install";
  filename?: string;
}

function createTestTask(t: Test, buildDir: string, isBenchmark: boolean) {
  const project = t.suite[0].split(":")[0]
  const name = `${project}:${t.name}`;
  const mode = isBenchmark ? "benchmark" : 'test'
  const benchmarkArgs = isBenchmark ? ["--benchmark", "--verbose"] : [];
  const args = ["test", ...benchmarkArgs].concat(name);
  const testTask = new vscode.Task(
    { type: "meson", mode: mode, target: name },
    `Test ${name}`,
    "Meson",
    new vscode.ProcessExecution(extensionConfiguration("mesonPath"), args, {
      env: t.env,
      cwd: buildDir
    })
  );
  testTask.group = vscode.TaskGroup.Test;
  return testTask;
}

function createRunTask(t: Target, targetName: string) {
  const targetDisplayName = targetName.split(":")[0];
  let runTask = new vscode.Task(
    {
      type: "meson",
      target: targetName,
      filename: t.filename[0],
      mode: "run"
    },
    `Run ${targetDisplayName}`,
    "Meson",
    new vscode.ProcessExecution(t.filename[0], {
      cwd: vscode.workspace.rootPath,
      env: getEnvDict(),
    })
  );
  runTask.group = vscode.TaskGroup.Test;
  return runTask;
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
          // FIXME: We should only include executable installed in bindir,
          // but install_dir is missing from intro data.
          if (t.type == "executable" && t.installed) {
            return [buildTask, createRunTask(t, targetName)];
          }
          return buildTask;
        })
      )).flat(1),
      ...tests.map(t => createTestTask(t, buildDir, false)),
      ...benchmarks.map(b => createTestTask(b, buildDir, true))
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

export async function getTasks(mode: string) {
  const tasks = await vscode.tasks.fetchTasks({ type: "meson" });
  return tasks.filter(
    t => t.definition.mode === mode
  );
}
