import * as vscode from "vscode";
import { getMesonTargets, getMesonTests, getMesonBenchmarks } from "./introspection";
import { extensionConfiguration, getOutputChannel, getTargetName, getEnvDict } from "./utils";
import { Test, Target } from "./types";
import { checkMesonIsConfigured } from "./utils";

interface MesonTaskDefinition extends vscode.TaskDefinition {
  type: "meson";
  target?: string;
  mode?: "build" | "run" | "test" | "benchmark" | "clean" | "reconfigure" | "install";
  filename?: string;
}

function createTestTask(t: Test, buildDir: string, isBenchmark: boolean) {
  const project = t.suite[0].split(":")[0];
  const name = `${project}:${t.name}`;
  const mode = isBenchmark ? "benchmark" : "test";
  const benchmarkSwitch = isBenchmark ? ["--benchmark"] : [];
  const args = ["test", ...benchmarkSwitch, ...extensionConfiguration(`${mode}Options`), name];

  const testTask = new vscode.Task(
    { type: "meson", mode, target: name },
    `Test ${name}`,
    "Meson",
    new vscode.ProcessExecution(extensionConfiguration("mesonPath"), args, {
      cwd: buildDir,
    }),
  );
  testTask.group = vscode.TaskGroup.Test;
  testTask.detail = `Timeout: ${t.timeout}s, ${!isBenchmark && t.is_parallel ? "run in parallel" : "run serially"}`;
  return testTask;
}

function createRunTask(t: Target, targetName: string) {
  const targetDisplayName = targetName.split(":")[0];
  let runTask = new vscode.Task(
    {
      type: "meson",
      target: targetName,
      filename: t.filename[0],
      mode: "run",
    },
    `Run ${targetDisplayName}`,
    "Meson",
    new vscode.ProcessExecution(t.filename[0], {
      cwd: vscode.workspace.rootPath,
      env: getEnvDict(),
    }),
  );
  runTask.group = vscode.TaskGroup.Test;
  return runTask;
}

function createReconfigureTask(buildDir: string) {
  const configureOpts = extensionConfiguration("configureOptions");
  const setupOpts = extensionConfiguration("setupOptions");
  const reconfigureOpts = checkMesonIsConfigured(buildDir) ? ["--reconfigure"] : [];
  const args = ["setup", ...reconfigureOpts, ...configureOpts, ...setupOpts, buildDir];
  return new vscode.Task(
    { type: "meson", mode: "reconfigure" },
    "Reconfigure",
    "Meson",
    // Note "setup --reconfigure" needs to be run from the root.
    new vscode.ProcessExecution(extensionConfiguration("mesonPath"), args, { cwd: vscode.workspace.rootPath }),
  );
}

export async function getMesonTasks(buildDir: string) {
  try {
    const defaultBuildTask = new vscode.Task(
      { type: "meson", mode: "build" },
      "Build all targets",
      "Meson",
      new vscode.ProcessExecution(extensionConfiguration("mesonPath"), ["compile", "-C", buildDir]),
      "$meson-gcc",
    );
    const defaultTestTask = new vscode.Task(
      { type: "meson", mode: "test" },
      "Run all tests",
      "Meson",
      new vscode.ProcessExecution(
        extensionConfiguration("mesonPath"),
        ["test", ...extensionConfiguration("testOptions")],
        { cwd: buildDir },
      ),
    );
    const defaultBenchmarkTask = new vscode.Task(
      { type: "meson", mode: "benchmark" },
      "Run all benchmarks",
      "Meson",
      new vscode.ProcessExecution(
        extensionConfiguration("mesonPath"),
        ["test", "--benchmark", ...extensionConfiguration("benchmarkOptions")],
        { cwd: buildDir },
      ),
    );
    const defaultReconfigureTask = createReconfigureTask(buildDir);
    const defaultInstallTask = new vscode.Task(
      { type: "meson", mode: "install" },
      "Run install",
      "Meson",
      new vscode.ProcessExecution(extensionConfiguration("mesonPath"), ["install"], { cwd: buildDir }),
    );
    const defaultCleanTask = new vscode.Task(
      { type: "meson", mode: "clean" },
      "Clean",
      "Meson",
      new vscode.ProcessExecution(extensionConfiguration("mesonPath"), ["compile", "--clean"], { cwd: buildDir }),
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
      defaultInstallTask,
    ];

    // Remaining tasks needs a valid configuration
    if (!checkMesonIsConfigured(buildDir)) {
      return tasks;
    }

    const [targets, tests, benchmarks] = await Promise.all([
      getMesonTargets(buildDir),
      getMesonTests(buildDir),
      getMesonBenchmarks(buildDir),
    ]);

    tasks.push(
      ...(
        await Promise.all(
          targets.map(async (t) => {
            const targetName = await getTargetName(t);
            const def: MesonTaskDefinition = {
              type: "meson",
              target: targetName,
              mode: "build",
            };
            const buildTask = new vscode.Task(
              def,
              `Build ${targetName}`,
              "Meson",
              new vscode.ProcessExecution(extensionConfiguration("mesonPath"), ["compile", targetName], {
                cwd: buildDir,
              }),
              "$meson-gcc",
            );
            buildTask.group = vscode.TaskGroup.Build;
            if (t.type == "executable") {
              // Create run tasks for executables that are not tests,
              // both installed and uninstalled (eg: examples)
              if (!tests.some((test) => test.name === t.name)) {
                return [buildTask, createRunTask(t, targetName)];
              }
            }
            return buildTask;
          }),
        )
      ).flat(1),
      ...tests.map((t) => createTestTask(t, buildDir, false)),
      ...benchmarks.map((b) => createTestTask(b, buildDir, true)),
    );
    return tasks;
  } catch (e: any) {
    if ("error" in e) {
      getOutputChannel().appendLine(e.error.message);
    }
    if ("stderr" in e) {
      getOutputChannel().appendLine(e.stderr);
    }

    vscode.window.showErrorMessage("Could not fetch targets. See Meson Build output tab for more info.");

    throw e;
  }
}

export async function getTask(mode: string, name?: string) {
  const tasks = await vscode.tasks.fetchTasks({ type: "meson" });
  const filtered = tasks.filter((t) => t.definition["mode"] == mode && (!name || t.definition["target"] == name));
  if (filtered.length === 0) {
    throw new Error(`Cannot find ${mode} target ${name}.`);
  }

  return filtered[0];
}

export async function getTasks(mode: string) {
  const tasks = await vscode.tasks.fetchTasks({ type: "meson" });
  return tasks.filter((t) => t.definition["mode"] === mode);
}

export async function runTask(task: vscode.Task) {
  try {
    await vscode.tasks.executeTask(task);
  } catch (e: any) {
    vscode.window.showErrorMessage(`Could not ${task.definition["mode"]} ${task.name}`);
    getOutputChannel().appendLine(`Running task ${task.name}:`);

    if ("error" in e) {
      getOutputChannel().appendLine(e.error.message);
    }
    if ("stderr" in e) {
      getOutputChannel().appendLine(e.stderr);
    }

    getOutputChannel().show(true);
  }
}

export async function runFirstTask(mode: string, name?: string) {
  runTask(await getTask(mode, name));
}
