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
    getMesonTestLogs
} from "./meson/introspection"

export async function testRunHandler(controller: vscode.TestController, request: vscode.TestRunRequest, token: vscode.CancellationToken) {
    const run = controller.createTestRun(request, null, false);
    const queue: vscode.TestItem[] = [];

    if (request.include) {
        request.include.forEach(test => queue.push(test));
    } else {
        controller.items.forEach(test => queue.push(test));
    }

    queue.forEach(run.started);
    var args = ['test', '-C', workspaceRelative(extensionConfiguration("buildFolder"))]
    queue.forEach(test => {
        args.push(test.id);
    });

    try {
        await exec('meson', args)
    } catch(e) {} finally {
        const logs: TestLogs = await getMesonTestLogs(workspaceRelative(extensionConfiguration("buildFolder")));
        logs.forEach(log => {
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
    for (let test of queue) {
        for (let config of tests) {
        if (test.id == config.name) {
            let args = [...config.cmd]
            args.shift();
            await vscode.debug.startDebugging(undefined, {
                    name: `meson-debug-${test.id}`,
                    type: "cppdbg",
                    request: "launch",
                    cwd: config.workdir || workspaceRelative(extensionConfiguration("buildFolder")),
                    env: config.env,
                    program: config.cmd[0],
                    args: args,
                });
            }
        }
    }

    run.end();
}