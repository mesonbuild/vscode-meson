import * as os from "os";
import * as vscode from "vscode";
import { ExecResult, exec, extensionConfiguration, getTargetName } from "./utils";
import { Targets, Test, Tests, DebugEnvironmentConfiguration } from "./types";
import { getMesonTests, getMesonTargets } from "./introspection";
import { workspaceState } from "./extension";

// This is far from complete, but should suffice for the
// "test is made of a single executable is made of a single source file" usecase.
function findSourceOfTest(test: Test, targets: Targets): vscode.Uri | undefined {
  const testExe = test.cmd.at(0);
  if (!testExe) {
    return undefined;
  }

  // The meson target such that it is of meson type executable()
  // and produces the binary that the test() executes.
  const testDependencyTarget = targets.find((target) => {
    const depend = test.depends.find((depend) => {
      return depend == target.id && target.type == "executable";
    });
    return depend && testExe == target.filename.at(0);
  });

  // The first source file belonging to the target.
  const path = testDependencyTarget?.target_sources
    ?.find((elem) => {
      return elem.sources;
    })
    ?.sources?.at(0);
  return path ? vscode.Uri.file(path) : undefined;
}

export async function rebuildTests(controller: vscode.TestController) {
  const buildDir = workspaceState.get<string>("mesonbuild.buildDir")!;
  const tests = await getMesonTests(buildDir);
  const targets = await getMesonTargets(buildDir);

  controller.items.forEach((item) => {
    if (!tests.some((test) => item.id == test.name)) {
      controller.items.delete(item.id);
    }
  });

  for (let testDescr of tests) {
    const testSourceFile = findSourceOfTest(testDescr, targets);
    const testItem = controller.createTestItem(testDescr.name, testDescr.name, testSourceFile);
    controller.items.add(testItem);
  }
}

export async function testRunHandler(
  controller: vscode.TestController,
  request: vscode.TestRunRequest,
  token: vscode.CancellationToken,
) {
  const run = controller.createTestRun(request, undefined, false);
  const parallelTests: vscode.TestItem[] = [];
  const sequentialTests: vscode.TestItem[] = [];

  const buildDir = workspaceState.get<string>("mesonbuild.buildDir")!;
  const mesonTests = await getMesonTests(buildDir);

  // Look up the meson test for a given vscode test,
  // put it in the parallel or sequential queue,
  // and tell vscode about the enqueued test.
  const testAdder = (test: vscode.TestItem) => {
    const mesonTest = mesonTests.find((mesonTest) => {
      return mesonTest.name == test.id;
    })!;
    if (mesonTest.is_parallel) {
      parallelTests.push(test);
    } else {
      sequentialTests.push(test);
    }
    // This way the total number of runs shows up from the beginning,
    // instead of incrementing as individual runs finish
    run.enqueued(test);
  };
  if (request.include) {
    request.include.forEach(testAdder);
  } else {
    controller.items.forEach(testAdder);
  }

  const dispatchTest = (test: vscode.TestItem) => {
    run.started(test);
    return exec(
      extensionConfiguration("mesonPath"),
      ["test", "-C", buildDir, "--print-errorlog", `"${test.id}"`],
      extensionConfiguration("testEnvironment"),
    ).then(
      (onfulfilled) => {
        run.passed(test, onfulfilled.timeMs);
      },
      (onrejected) => {
        const execResult = onrejected as ExecResult;

        let stdout = execResult.stdout;
        if (os.platform() != "win32") {
          stdout = stdout.replace(/\n/g, "\r\n");
        }
        run.appendOutput(stdout, undefined, test);
        if (execResult.error?.code == 125) {
          vscode.window.showErrorMessage("Failed to build tests. Results will not be updated");
          run.errored(test, new vscode.TestMessage(execResult.stderr));
        } else {
          run.failed(test, new vscode.TestMessage(execResult.stderr), execResult.timeMs);
        }
      },
    );
  };

  const runningTests: Promise<void>[] = [];
  const maxRunning: number = (() => {
    const jobsConfig = extensionConfiguration("testJobs");
    switch (jobsConfig) {
      case -1:
        return os.cpus().length;
      case 0:
        return Number.MAX_SAFE_INTEGER;
      default:
        return jobsConfig;
    }
  })();

  for (const test of parallelTests) {
    const runningTest = dispatchTest(test).finally(() => {
      runningTests.splice(runningTests.indexOf(runningTest), 1);
    });

    runningTests.push(runningTest);

    if (runningTests.length >= maxRunning) {
      await Promise.race(runningTests);
    }
  }
  await Promise.all(runningTests);

  for (const test of sequentialTests) {
    await dispatchTest(test);
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

  let args = ["compile", "-C", buildDir];
  requiredTargets.forEach(async (target) => {
    args.push(await getTargetName(target));
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
  const codelldb = vscode.extensions.getExtension("vadimcn.vscode-lldb");
  const lldbDAP = vscode.extensions.getExtension("llvm-vs-code-extensions.lldb-dap");
  if (cppTools) {
    debugType = "cppdbg";
  } else if (codelldb) {
    debugType = "lldb";
  } else if (lldbDAP) {
    debugType = "lldb-dap";
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
