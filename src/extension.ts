import * as path from "path";
import * as vscode from "vscode";
import {
  runMesonBuild,
  runMesonTests,
  runMesonInstall,
  makeTaskTitle
} from "./meson/runners";
import { getMesonTasks } from "./tasks";
import { MesonProjectExplorer } from "./treeview";
import {
  extensionConfiguration,
  execAsTask,
  workspaceRelative,
  extensionConfigurationSet,
  getBuildFolder
} from "./utils";
import {
  getMesonTargets,
  getMesonTests,
  getMesonBenchmarks,
  getMesonProjectInfo
} from "./meson/introspection";
import { DebugConfigurationProvider } from "./configprovider";
import {
  testDebugHandler,
  testRunHandler,
  rebuildTests
} from "./tests";

import { BuildDirectoryNode } from "./treeview/nodes/builddirectory";
import { IBuildableNode, IDebuggableNode, IRunnableNode } from "./treeview/nodes/base";
import { TargetNode } from "./treeview/nodes/targets";

import {
  activateFormatters
} from "./formatters"

export let extensionPath: string;
let explorer: MesonProjectExplorer;
let mesonWatcher: vscode.FileSystemWatcher;
let controller: vscode.TestController;

export async function activate(ctx: vscode.ExtensionContext) {
  if (!vscode.workspace.workspaceFolders) {
    return;
  }

  extensionPath = ctx.extensionPath;
  explorer = new MesonProjectExplorer(ctx);

  activateFormatters(ctx);

  mesonWatcher = vscode.workspace.createFileSystemWatcher("**/meson.build", false, true, false);
  controller = vscode.tests.createTestController('meson-test-controller', 'Meson test controller');

  ctx.subscriptions.push(
    vscode.debug.registerDebugConfigurationProvider('cppdbg',
      new DebugConfigurationProvider(workspaceRelative(getBuildFolder())),
      vscode.DebugConfigurationProviderTriggerKind.Dynamic)
  );
  ctx.subscriptions.push(mesonWatcher);
  ctx.subscriptions.push(controller);

  mesonWatcher.onDidCreate(() => MesonProjectExplorer.refresh());
  mesonWatcher.onDidDelete(() => MesonProjectExplorer.refresh());

  controller.createRunProfile("Meson debug test", vscode.TestRunProfileKind.Debug, (request, token) => testDebugHandler(controller, request, token), true)
  controller.createRunProfile("Meson run test", vscode.TestRunProfileKind.Run, (request, token) => testRunHandler(controller, request, token), true)

  async function pickWorkspaceRootAndBuildDir() {
    let workspaceFolder: vscode.WorkspaceFolder;

    // Pick root if there are multiple.
    if (vscode.workspace.workspaceFolders.length > 1) {
      workspaceFolder = await vscode.window.showWorkspaceFolderPick();
    } else {
      workspaceFolder = vscode.workspace.workspaceFolders[0];
    }

    if (!workspaceFolder) {
      throw new Error(`No workspace selected`);
    }

    // Pick build directory.
    // TODO if this is rewritten to go through the known state of roots & builddirs, can avoid the dialog when there's only 1 build folder.
    const buildDir = await vscode.window.showInputBox({ value: extensionConfiguration("buildFolder") });

    if (!buildDir) {
      throw new Error(`No build directory selected`);
    }

    return { workspaceFolder, buildDir };
  }

  // TODO this needs root/build support in some way.
  ctx.subscriptions.push(
    vscode.tasks.registerTaskProvider("meson", {
      provideTasks(token) {
        return getMesonTasks(
          workspaceRelative(getBuildFolder())
        );
      },
      resolveTask() {
        return undefined;
      }
    })
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand("mesonbuild.openBuildFile", async (node: TargetNode) => {
      let file = node.getTarget().defined_in;
      let uri  = vscode.Uri.file(file)
      await vscode.commands.executeCommand('vscode.open', uri);
      })
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand(
      "mesonbuild.build",
      async (buildDir?: string, name?: string) => {
        try {
          const [actualBuildDir, projectName, targetName] = await pickBuildTarget(buildDir, name);
          runMesonBuild(actualBuildDir, projectName, targetName);
        } catch (err) {
          // Pick cancelled.
        }

        MesonProjectExplorer.refresh();
      }
    )
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand("mesonbuild.install", async () => {
      await runMesonInstall();
      MesonProjectExplorer.refresh();
    })
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand(
      "mesonbuild.node.build",
      async (node?: IBuildableNode) => {
        if (node != null) {
          node.build();
        }

        // MesonProjectExplorer.refresh();
      }
    )
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand(
      "mesonbuild.node.debug",
      async (node?: IDebuggableNode) => {
        if (node != null) {
          node.debug();
        }

        // MesonProjectExplorer.refresh();
      }
    )
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand(
      "mesonbuild.node.run",
      async (node?: IRunnableNode) => {
        if (node != null) {
          node.run();
        }

        // MesonProjectExplorer.refresh();
      }
    )
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand(
      "mesonbuild.builddir.reconfigure",
      async (buildDirectoryNode?: BuildDirectoryNode) => {
        if (buildDirectoryNode != null) {
          buildDirectoryNode.reconfigure();
        }

        // MesonProjectExplorer.refresh();
      }
    )
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand(
      "mesonbuild.builddir.clean",
      async (buildDirectoryNode?: BuildDirectoryNode) => {
        if (buildDirectoryNode != null) {
          buildDirectoryNode.clean();
        }

        // MesonProjectExplorer.refresh();
      }
    )
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand(
      "mesonbuild.test",
      async (buildDir?: string, name?: string) => runTestsOrBenchmarks(false, buildDir, name)
    )
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand(
      "mesonbuild.benchmark",
      async (buildDir?: string, name?: string) => runTestsOrBenchmarks(true, buildDir, name)
    )
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand("mesonbuild.clean", async () => {
      const { workspaceFolder, buildDir } = await pickWorkspaceRootAndBuildDir();

      // TODO factor out with BuildDirectoryNode.clean

      const title = makeTaskTitle("clean", this.buildDir);

      await execAsTask(extensionConfiguration("mesonPath"), ["compile", "--clean"], { cwd: path.join(workspaceFolder.uri.fsPath, buildDir) },
        vscode.TaskRevealKind.Silent, null, title);
    })
  );

  const configureOnOpenKey = "configureOnOpen";
  let configureOnOpen = extensionConfiguration(configureOnOpenKey);
  if (configureOnOpen === "ask") {
    enum Options {
      no = "Not this time",
      never = "Never",
      yes = "Yes, this time",
      automatic = "Automatic"
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

      case Options.automatic:
        extensionConfigurationSet(configureOnOpenKey, true, vscode.ConfigurationTarget.Workspace);
        configureOnOpen = true;
        break;
    }
  }

  if (configureOnOpen === true) {
    await vscode.commands.executeCommand("mesonbuild.configure");
    MesonProjectExplorer.refresh();
  }

  async function pickBuildTarget(actualBuildDir?: string, name?: string) {
    if (actualBuildDir && name) {
      const projectInfo = await getMesonProjectInfo(actualBuildDir);

      if (!projectInfo) {
        throw new Error(`Couldn't get project info for ${actualBuildDir}`);
      }

      return [actualBuildDir, projectInfo.descriptive_name, name];
    }

    const { workspaceFolder, buildDir } = await pickWorkspaceRootAndBuildDir();
    const buildPath = path.join(workspaceFolder.uri.fsPath, buildDir);

    const picker = vscode.window.createQuickPick();
    picker.busy = true;
    picker.placeholder = "Select target to build";
    picker.show();

    try {
      const projectInfo = await getMesonProjectInfo(buildPath);
      const targets = await getMesonTargets(buildPath);

      if (targets.length === 0) {
        throw new Error(`${buildDir} has no targets`);
      }

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
            detail: path.relative(workspaceFolder.uri.fsPath, path.dirname(target.defined_in)),
            description: target.type,
            picked: false
          }
        })
      ];

      return new Promise<[string, string, string | null]>((resolve, reject) => {
        picker.onDidAccept(() => {
          const selection = picker.activeItems[0];

          if (selection.label === "all") {
            resolve([buildPath, projectInfo.descriptive_name, null]);
          } else {
            const target = targets.find((target) => target.name === selection.label);
            resolve([buildPath, projectInfo.descriptive_name, target.name]);
          }

          picker.dispose();
        });

        picker.onDidHide(() => reject());
      });
    }
    catch (error) {
      picker.dispose();
    }
  }

  async function pickTestOrBenchmark(isBenchmark: boolean) {
    const { workspaceFolder, buildDir } = await pickWorkspaceRootAndBuildDir();
    const buildPath = path.join(workspaceFolder.uri.fsPath, buildDir);

    const tests = isBenchmark ? await getMesonBenchmarks(buildPath) : await getMesonTests(buildPath)

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
      return [buildPath, null];
    } else {
      return [buildPath, result.label];
    }
  }

  async function runTestsOrBenchmarks(isBenchmark: boolean, buildDir?: string, name?: string) {
    try {
      if ((name == null) && (buildDir == null)) {
        [buildDir, name] = await pickTestOrBenchmark(isBenchmark);
      }

      await runMesonTests(buildDir, isBenchmark, name);
    }
    catch (err) {
      // Pick cancelled.
    }

    MesonProjectExplorer.refresh();
  }
}
