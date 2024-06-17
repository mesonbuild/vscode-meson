import * as vscode from "vscode";
import { ExecResult, exec, extensionConfiguration } from "./utils";
import { Tests, DebugEnvironmentConfiguration } from "./types";
import { getMesonTests, getMesonTargets } from "./introspection";
import { workspaceState } from "./extension";

export async function rebuildTests(controller: vscode.TestController) {
  let tests = await getMesonTests(workspaceState.get<string>("mesonbuild.buildDir")!);

  controller.items.forEach((item) => {
    if (!tests.some((test) => item.id == test.name)) {
      controller.items.delete(item.id);
    }
  });

  for (let testDescr of tests) {
    let testItem = controller.createTestItem(testDescr.name, testDescr.name);
    controller.items.add(testItem);
  }
}

export async function testRunHandler(
  controller: vscode.TestController,
  request: vscode.TestRunRequest,
  token: vscode.CancellationToken,
) {
  const run = controller.createTestRun(request, undefined, false);
  const queue: vscode.TestItem[] = [];

  if (request.include) {
    request.include.forEach((test) => queue.push(test));
  } else {
    controller.items.forEach((test) => queue.push(test));
  }

  const buildDir = workspaceState.get<string>("mesonbuild.buildDir")!;

  for (let test of queue) {
    run.started(test);
    let starttime = Date.now();
    try {
      await exec(
        extensionConfiguration("mesonPath"),
        ["test", "-C", buildDir, "--print-errorlog", test.id],
        extensionConfiguration("testEnvironment"),
      );
      let duration = Date.now() - starttime;
      run.passed(test, duration);
    } catch (e) {
      const execResult = e as ExecResult;

      run.appendOutput(execResult.stdout);
      let duration = Date.now() - starttime;
      if (execResult.error?.code == 125) {
        vscode.window.showErrorMessage("Failed to build tests. Results will not be updated");
        run.errored(test, new vscode.TestMessage(execResult.stderr));
      } else {
        run.failed(test, new vscode.TestMessage(execResult.stderr), duration);
      }
    }
  }

  run.end();
}

export async function testDebugHandler(
  controller: vscode.TestController,
  request: vscode.TestRunRequest,
  token: vscode.CancellationToken,
) {
  const run = controller.createTestRun(request, undefined, false);
  const queue: vscode.TestItem[] = [];

  if (request.include) {
    request.include.forEach((test) => queue.push(test));
  } else {
    controller.items.forEach((test) => queue.push(test));
  }

  const buildDir = workspaceState.get<string>("mesonbuild.buildDir")!;
  const tests: Tests = await getMesonTests(buildDir);
  const targets = await getMesonTargets(buildDir);

  /* while meson has the --gdb arg to test, but IMO we should go the actual debugger route.
   * We still want stuff to be built though... Without going through weird dances */
  const relevantTests = tests.filter((test) => queue.some((candidate) => candidate.id == test.name));
  const requiredTargets = targets.filter((target) =>
    relevantTests.some((test) => test.depends.some((dep) => dep == target.id)),
  );

  var args = ["compile", "-C", buildDir];
  requiredTargets.forEach((target) => {
    args.push(target.name);
  });

  try {
    await exec(extensionConfiguration("mesonPath"), args);
  } catch (e) {
    vscode.window.showErrorMessage("Failed to build tests. Results will not be updated");
    run.end();
    return;
  }

  let debugType = null;

  const cppTools = vscode.extensions.getExtension("ms-vscode.cpptools");
  if (cppTools && cppTools.isActive) {
    debugType = "cppdbg";
  } else {
    const codelldb = vscode.extensions.getExtension("vadimcn.vscode-lldb");
    if (codelldb && codelldb.isActive) {
      debugType = "lldb";
    }
  }

  if (!debugType) {
    vscode.window.showErrorMessage("No debugger extension found. Please install one and try again");
    run.end();
    return;
  }

  const configDebugOptions = extensionConfiguration("debugOptions");
  const sourceDir = workspaceState.get<string>("mesonbuild.sourceDir")!;

  /* We already figured out which tests we want to run.
   * We don't use the actual test either way, as we don't get the result here... */
  for (let test of relevantTests) {
    let args = [...test.cmd];
    args.shift();

    let debugEnvironmentConfiguration: DebugEnvironmentConfiguration;
    /* cppdbg uses 'environment' key, all others use 'env' key */
    if (debugType == "cppdbg") {
      const debugEnv = [];
      if (test.env instanceof Object) {
        /* convert from dict of key = value to array of {name: key, value: value} */
        for (const [key, val] of Object.entries(test.env)) {
          debugEnv.push({ name: key, value: val });
        }
      }
      debugEnvironmentConfiguration = {
        environment: debugEnv,
      };
    } else {
      debugEnvironmentConfiguration = {
        env: test.env,
      };
    }

    let debugConfiguration = {
      name: `meson-debug-${test.name}`,
      type: debugType,
      request: "launch",
      cwd: test.workdir || sourceDir,
      program: test.cmd[0],
      args: args,
    };
    const configuration = {
      ...debugConfiguration,
      ...debugEnvironmentConfiguration,
      ...configDebugOptions,
    };
    await vscode.debug.startDebugging(undefined, configuration);
  }

  run.end();
}
