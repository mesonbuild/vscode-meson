import * as path from "path";
import * as vscode from "vscode";
import {
  runMesonConfigure,
  runMesonBuild,
  runMesonTests,
  runMesonReconfigure
} from "./meson/runners";
import { getMesonTasks } from "./tasks";
import { MesonProjectExplorer } from "./treeview";
import {
  extensionConfiguration,
  execAsTask,
  workspaceRelative,
  extensionConfigurationSet,
  getTargetName
} from "./utils";
import {
  getMesonTargets,
  getMesonTests,
  getMesonBenchmarks
} from "./meson/introspection";
import {DebugConfigurationProvider} from "./configprovider";


export let extensionPath: string;
let explorer: MesonProjectExplorer;
let watcher: vscode.FileSystemWatcher;
let mesonWatcher: vscode.FileSystemWatcher;

export async function activate(ctx: vscode.ExtensionContext) {
  extensionPath = ctx.extensionPath;

  if (!vscode.workspace.workspaceFolders) {
    return;
  }

  const root = vscode.workspace.workspaceFolders[0].uri.fsPath;
  const buildDir = workspaceRelative(extensionConfiguration("buildFolder"));

  explorer = new MesonProjectExplorer(ctx, root, buildDir);
  watcher = vscode.workspace.createFileSystemWatcher(`${workspaceRelative(extensionConfiguration("buildFolder"))}/build.ninja`, false, false, true);
  mesonWatcher = vscode.workspace.createFileSystemWatcher("**/meson.build", false, true, false);

  ctx.subscriptions.push(
    vscode.debug.registerDebugConfigurationProvider('cppdbg',
      new DebugConfigurationProvider(workspaceRelative(extensionConfiguration("buildFolder"))),
      vscode.DebugConfigurationProviderTriggerKind.Dynamic)
  );

  ctx.subscriptions.push(watcher);
  ctx.subscriptions.push(mesonWatcher);

  let updateHasProject = async () => {
    let mesonFiles = await vscode.workspace.findFiles("**/meson.build");
    vscode.commands.executeCommand("setContext", 'mesonbuild.hasProject', mesonFiles.length > 0);
  }

  mesonWatcher.onDidCreate(updateHasProject)
  mesonWatcher.onDidDelete(updateHasProject)

  await updateHasProject()

  ctx.subscriptions.push(
    vscode.tasks.registerTaskProvider("meson", {
      provideTasks(token) {
        return getMesonTasks(
          workspaceRelative(extensionConfiguration("buildFolder"))
        );
      },
      resolveTask() {
        return undefined;
      }
    })
  );

  watcher.onDidChange(() => {
    explorer.refresh();
  });

  watcher.onDidCreate(() => {
    explorer.refresh();
  });

  ctx.subscriptions.push(
    vscode.commands.registerCommand("mesonbuild.configure", async () => {
      await runMesonConfigure(
        root,
        workspaceRelative(extensionConfiguration("buildFolder"))
      );
      explorer.refresh();
    })
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand("mesonbuild.reconfigure", async () => {
      await runMesonReconfigure();
      explorer.refresh();
    })
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand(
      "mesonbuild.build",
      async (name?: string) => {
        try {
          name ??= await pickBuildTarget();
          runMesonBuild(buildDir, name);
        } catch (err) {
          // Pick cancelled.
        }

        explorer.refresh();
      }
    ));

  ctx.subscriptions.push(
    vscode.commands.registerCommand(
      "mesonbuild.test",
      async (name?: string) => runTestsOrBenchmarks(false, name)
    )
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand(
      "mesonbuild.benchmark",
      async (name?: string) => runTestsOrBenchmarks(true, name)
    )
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand("mesonbuild.clean", async () => {
      await execAsTask("meson", ["compile", "--clean"], {
        cwd: workspaceRelative(extensionConfiguration("buildFolder"))
      });
    })
  );

  const configureOnOpenKey = "configureOnOpen";
  let configureOnOpen = extensionConfiguration(configureOnOpenKey);
  if (configureOnOpen === "ask") {
    enum Options {
      no = "Not this time",
      never = "Never",
      yes = "Yes, this time",
      always = "Always"
    };

    const response = await vscode.window.showInformationMessage(
      "Meson project detected in this workspace. Would you like VS Code to configure it?",
      ...Object.values(Options)
    );

    switch (response) {
      case Options.no:
        break;

      case Options.never:
        extensionConfigurationSet(configureOnOpenKey, false, vscode.ConfigurationTarget.Workspace);
        break;

      case Options.yes:
        configureOnOpen = true;
        break;

      case Options.always:
        extensionConfigurationSet(configureOnOpenKey, true, vscode.ConfigurationTarget.Workspace);
        configureOnOpen = true;
        break;
    }
  }

  if (configureOnOpen === true) {
    await vscode.commands.executeCommand("mesonbuild.configure");
    explorer.refresh();
  }

  async function pickBuildTarget() {
    const picker = vscode.window.createQuickPick();
    picker.busy = true;
    picker.placeholder = "Select target to build. Defaults to all targets";
    picker.show();

    const targets = await getMesonTargets(buildDir);

    picker.busy = false;
    picker.items = [
      {
        label: "all",
        detail: "Build all targets",
        description: "(meta-target)",
        picked: true
      },
      ...targets.map((target) => {
        return {
          label: target.name,
          detail: path.relative(root, path.dirname(target.defined_in)),
          description: target.type,
          picked: false
        }
      })
    ];

    return new Promise<string>((resolve, reject) => {
      picker.onDidAccept(() => {
        const selection = picker.activeItems[0];

        if (selection.label === "all") {
          resolve(null);
        } else {
          const target = targets.find((target) => target.name === selection.label);
          resolve(getTargetName(target));
        }

        picker.dispose();
      });

      picker.onDidHide(() => reject());
    });
  }

  async function pickTestOrBenchmark(isBenchmark: boolean) {
    const tests = isBenchmark ? await getMesonBenchmarks(buildDir) : await getMesonTests(buildDir)

    const items = [
      {
        label: "all",
        detail: `Run all ${isBenchmark ? "benchmarks" : "tests"}`,
        description: "(meta-target)",
        picked: true
      },
      ...tests.map<vscode.QuickPickItem>(t => ({
        label: t.name,
        detail: `Timeout: ${t.timeout}s, ${!isBenchmark && t.is_parallel ? "run in parallel" : "run serially"}`,
        description: t.suite.join(","),
        picked: false
      }))
    ];

    const result = await vscode.window.showQuickPick(items);

    if (result === undefined) {
      throw result;
    } else if (result.label === "all") {
      return null;
    } else {
      return result.label;
    }
  }

  async function runTestsOrBenchmarks(isBenchmark: boolean, name?: string) {
    try {
      name ??= await pickTestOrBenchmark(isBenchmark);
      await runMesonTests(buildDir, isBenchmark, name);
    } catch (err) {
      // Pick cancelled.
    }

    explorer.refresh();
  }
}
