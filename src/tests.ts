import * as vscode from "vscode";
import {
  exec,
  extensionConfiguration,
  workspaceRelative,
  getBuildFolder
} from "./utils";
import {
  Tests
} from "./meson/types"
import {
  getMesonTests,
  getMesonTargets
} from "./meson/introspection"

export async function rebuildTests(controller: vscode.TestController) {
  let tests = await getMesonTests(workspaceRelative(getBuildFolder()))

  controller.items.forEach(item => {
    if (!tests.some(test => item.id == test.name)) {
      controller.items.delete(item.id);
    }
  });

  for (let testDescr of tests) {
    let testItem = controller.createTestItem(testDescr.name, testDescr.name)
    controller.items.add(testItem)
  }
}

export async function testRunHandler(controller: vscode.TestController, request: vscode.TestRunRequest, token: vscode.CancellationToken) {
  const run = controller.createTestRun(request, null, false);
  const queue: vscode.TestItem[] = [];

  if (request.include) {
    request.include.forEach(test => queue.push(test));
  } else {
    controller.items.forEach(test => queue.push(test));
  }

  for (let test of queue) {
    run.started(test);
    let starttime = Date.now();
    try {
      await exec(extensionConfiguration("mesonPath"), ['test', '-C', workspaceRelative(getBuildFolder()), '--print-errorlog', test.id]);
      let duration = Date.now() - starttime;
      run.passed(test, duration);
    } catch (e) {
      run.appendOutput(e.stdout);
      let duration = Date.now() - starttime;
      if (e.error.code == 125) {
        vscode.window.showErrorMessage("Failed to build tests. Results will not be updated");
        run.errored(test, new vscode.TestMessage(e.stderr));
      } else {
        run.failed(test, new vscode.TestMessage(e.stderr), duration);
      }
    }
  }

  run.end();
}

export async function testDebugHandler(controller: vscode.TestController, request: vscode.TestRunRequest, token: vscode.CancellationToken) {
  const run = controller.createTestRun(request, null, false);
  const queue: vscode.TestItem[] = [];

  if (request.include) {
    request.include.forEach(test => queue.push(test));
  } else {
    controller.items.forEach(test => queue.push(test));
  }

  const tests: Tests = await getMesonTests(workspaceRelative(getBuildFolder()));
  const targets = await getMesonTargets(workspaceRelative(getBuildFolder()));

  /* while meson has the --gdb arg to test, but IMO we should go the actual debugger route.
   * We still want stuff to be built though... Without going through weird dances */
  const relevantTests = tests.filter(test => queue.some(candidate => candidate.id == test.name));
  const requiredTargets = targets.filter(target => relevantTests.some(test => test.depends.some(dep => dep == target.id)));

  var args = ['compile', '-C', workspaceRelative(getBuildFolder())]
  requiredTargets.forEach(target => {
    args.push(target.name);
  });

  try {
    await exec(extensionConfiguration("mesonPath"), args);
  } catch (e) {
    vscode.window.showErrorMessage("Failed to build tests. Results will not be updated");
    run.end();
    return;
  }

  let configDebugOptions = extensionConfiguration("debugOptions")

  /* We already figured out which tests we want to run.
   * We don't use the actual test either way, as we don't get the result here... */
  for (let test of relevantTests) {
    let args = [...test.cmd]
    args.shift();

    let debugConfiguration = {
      name: `meson-debug-${test.name}`,
      type: "cppdbg",
      request: "launch",
      cwd: test.workdir || workspaceRelative(getBuildFolder()),
      env: test.env,
      program: test.cmd[0],
      args: args,
    };
    await vscode.debug.startDebugging(undefined, { ...debugConfiguration, ...configDebugOptions });
  }

  run.end();
}
