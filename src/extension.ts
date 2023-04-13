import * as path from "path";
import * as vscode from "vscode";
import {
  runMesonConfigure,
  runTask,
  runMesonReconfigure,
  runMesonInstall
} from "./meson/runners";
import { getMesonTasks, getTask, getTasks } from "./tasks";
import { MesonProjectExplorer } from "./treeview";
import { TargetNode } from "./treeview/nodes/targets"
import {
  extensionConfiguration,
  execAsTask,
  workspaceRelative,
  extensionConfigurationSet,
  getTargetName,
  genEnvFile,
  patchCompileCommands,
  clearCache,
  getOutputChannel
} from "./utils";
import {
  getMesonTargets,
  getMesonTests,
  getMesonBenchmarks
} from "./meson/introspection";
import { DebugConfigurationProvider } from "./configprovider";
import {
  testDebugHandler,
  testRunHandler,
  rebuildTests
} from "./tests";
import {
  activateLinters
} from "./linters"
import {
  activateFormatters
} from "./formatters"
import { TaskQuickPickItem } from "./types";

export let extensionPath: string;
let explorer: MesonProjectExplorer;
let watcher: vscode.FileSystemWatcher;
let compileCommandsWatcher: vscode.FileSystemWatcher;
let mesonWatcher: vscode.FileSystemWatcher;
let controller: vscode.TestController;

export async function activate(ctx: vscode.ExtensionContext) {
  extensionPath = ctx.extensionPath;

  if (!vscode.workspace.workspaceFolders) {
    return;
  }

  const root = vscode.workspace.workspaceFolders[0].uri.fsPath;
  const buildDir = workspaceRelative(extensionConfiguration("buildFolder"));

  activateLinters(root, ctx);
  activateFormatters(ctx);

  explorer = new MesonProjectExplorer(ctx, root, buildDir);

  ctx.subscriptions.push(
    vscode.debug.registerDebugConfigurationProvider('cppdbg',
      new DebugConfigurationProvider(buildDir),
      vscode.DebugConfigurationProviderTriggerKind.Dynamic)
  );

  let updateHasProject = async () => {
    let mesonFiles = await vscode.workspace.findFiles("**/meson.build");
    vscode.commands.executeCommand("setContext", 'mesonbuild.hasProject', mesonFiles.length > 0);
  }
  mesonWatcher = vscode.workspace.createFileSystemWatcher("**/meson.build", false, true, false);
  mesonWatcher.onDidCreate(updateHasProject)
  mesonWatcher.onDidDelete(updateHasProject)
  ctx.subscriptions.push(mesonWatcher);
  await updateHasProject()

  controller = vscode.tests.createTestController('meson-test-controller', 'Meson test controller');
  controller.createRunProfile("Meson debug test", vscode.TestRunProfileKind.Debug, (request, token) => testDebugHandler(controller, request, token), true)
  controller.createRunProfile("Meson run test", vscode.TestRunProfileKind.Run, (request, token) => testRunHandler(controller, request, token), true)
  ctx.subscriptions.push(controller);

  let mesonTasks: Thenable<vscode.Task[]> | undefined = undefined;
  ctx.subscriptions.push(
    vscode.tasks.registerTaskProvider("meson", {
      provideTasks() {
        if (!mesonTasks) {
          mesonTasks = getMesonTasks(buildDir);
        }
        return mesonTasks;
      },
      resolveTask() {
        return undefined;
      }
    })
  );

  let changeHandler = async () => {
    mesonTasks = undefined;
    clearCache();
    await rebuildTests(controller);
    await genEnvFile(buildDir);
    explorer.refresh();
  };
  watcher = vscode.workspace.createFileSystemWatcher(`${buildDir}/build.ninja`, false, false, true);
  watcher.onDidChange(changeHandler);
  watcher.onDidCreate(changeHandler);
  ctx.subscriptions.push(watcher);
  await genEnvFile(buildDir);

  let compileCommandsHandler = async () => {
    await patchCompileCommands(buildDir);
  };
  compileCommandsWatcher = vscode.workspace.createFileSystemWatcher(`${buildDir}/compile_commands.json`, false, false, true);
  compileCommandsWatcher.onDidChange(compileCommandsHandler);
  compileCommandsWatcher.onDidCreate(compileCommandsHandler);
  ctx.subscriptions.push(compileCommandsWatcher);
  await patchCompileCommands(buildDir);

  ctx.subscriptions.push(
    vscode.commands.registerCommand("mesonbuild.openBuildFile", async (node: TargetNode) => {
      let file = node.getTarget().defined_in;
      let uri = vscode.Uri.file(file)
      await vscode.commands.executeCommand('vscode.open', uri);
    })
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand("mesonbuild.configure", async () => {
      await runMesonConfigure(root, buildDir);
    })
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand("mesonbuild.reconfigure", async () => {
      await runMesonReconfigure();
    })
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand("mesonbuild.build", async (name?: string) => {
      pickAndRunTask("build", name)
    })
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand("mesonbuild.install", async () => {
      await runMesonInstall();
    })
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand("mesonbuild.test", async (name?: string) => {
      pickAndRunTask("test", name);
    })
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand("mesonbuild.benchmark", async (name?: string) => {
      pickAndRunTask("benchmark", name);
    })
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand("mesonbuild.clean", async () => {
      await execAsTask(extensionConfiguration("mesonPath"), ["compile", "--clean", "-C", buildDir], {});
    })
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand("mesonbuild.run", async () => {
      pickAndRunTask("run");
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
  }

  async function pickTask(mode: string) {
    const picker = vscode.window.createQuickPick<TaskQuickPickItem>();
    picker.busy = true;
    picker.placeholder = `Select target to ${mode}.`;
    picker.show();

    const runnableTasks = await getTasks(mode);

    picker.busy = false;
    picker.items = runnableTasks.map(task => {
      return {
        label: task.name,
        detail: task.detail,
        picked: false,
        task: task,
      }
    });

    return new Promise<TaskQuickPickItem>((resolve, reject) => {
      picker.onDidAccept(() => {
        const selection = picker.activeItems[0];
        resolve(selection);
        picker.dispose();
      });
      picker.onDidHide(() => reject());
    });
  }

  async function pickAndRunTask(mode: string, name?: string) {
    if (name) {
      const task = await getTask(mode, name);
      runTask(task);
      return;
    }
    let taskItem: TaskQuickPickItem;
    try {
      taskItem = await pickTask(mode);
    } catch (err) {
      // Pick cancelled.
    }
    if (taskItem != null) {
      runTask(taskItem.task);
    }
  }
}
