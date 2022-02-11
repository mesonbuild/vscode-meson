import * as vscode from "vscode";
import {
  exec,
  extensionConfiguration,
  workspaceRelative,
} from "./utils";
import {
    Tests,
    TestLogs
} from "./meson/types"
import {
    getMesonTests,
    getMesonTestLogs,
    getMesonTargets
} from "./meson/introspection"

export async function rebuildTests(controller: vscode.TestController) {
    let tests = await getMesonTests(workspaceRelative(extensionConfiguration("buildFolder")))

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

    var args = ['test', '-C', workspaceRelative(extensionConfiguration("buildFolder")), '--print-errorlog']
    queue.forEach(test => {
        run.started(test);
        args.push(test.id);
    });

    try {
        await exec('meson', args);
    } catch(e) {
        if (e.error.code == 125) {
            /* If desired, we could probably do this in a way that we fault every test in this error case.
             * Might be better semantically but at the same time, those tests didn't fail. */
            vscode.window.showErrorMessage("Failed to build tests. Results will not be updated");
        }
        run.appendOutput(e.stdout);
    } finally {
        const logs: TestLogs = await getMesonTestLogs(workspaceRelative(extensionConfiguration("buildFolder")));
        logs.forEach(log => {
            /* Not a fan of this, but the testlog output doesn't contain the actual input name.
             * What it does contain is a mix of suite and name :/ */
            /* If this ever becoes a real problem, we could match on command? I don't think we can do env... */
            /* or we get the meson test tool to write the name proper as well, and if it's there match on that */
            let split = log.name.split(' ').pop();
            for (let test of queue) {
                if (test.id == split) {
                    if (log.result == "OK") {
                        run.passed(test, log.duration * 1000);
                    } else {
                        run.failed(test, new vscode.TestMessage(log.stderr), log.duration);
                    }
                }
            }
        });
        run.end();
    }
}

export async function testDebugHandler(controller: vscode.TestController, request: vscode.TestRunRequest, token: vscode.CancellationToken) {
    const run = controller.createTestRun(request, null, false);
    const queue: vscode.TestItem[] = [];

    if (request.include) {
        request.include.forEach(test => queue.push(test));
    } else {
        controller.items.forEach(test => queue.push(test));
    }

    const tests: Tests = await getMesonTests(workspaceRelative(extensionConfiguration("buildFolder")));
    const targets = await getMesonTargets(workspaceRelative(extensionConfiguration("buildFolder")));

    /* while meson has the --gdb arg to test, but IMO we should go the actual debugger route.
     * We still want stuff to be built though... Without going through weird dances */
    const relevantTests = tests.filter(test => queue.some(candidate => candidate.id == test.name));
    const requiredTargets = targets.filter(target => relevantTests.some(test => test.depends.some(dep => dep == target.id)));

    var args = ['compile', '-C', workspaceRelative(extensionConfiguration("buildFolder"))]
    requiredTargets.forEach(target => {
        args.push(target.name);
    });

    try {
        await exec('meson', args);
    } catch(e) {
        vscode.window.showErrorMessage("Failed to build tests. Results will not be updated");
        run.end();
        return;
    }

    /* We already figured out which tests we want to run.
     * We don't use the actual test either way, as we don't get the result here... */
    for (let test of relevantTests) {
        let args = [...test.cmd]
        args.shift();
        await vscode.debug.startDebugging(undefined, {
                name: `meson-debug-${test.name}`,
                type: "cppdbg",
                request: "launch",
                cwd: test.workdir || workspaceRelative(extensionConfiguration("buildFolder")),
                env: test.env,
                program: test.cmd[0],
                args: args,
            });
    }

    run.end();
}