import * as vscode from "vscode";
import { getMesonTasks, getTasks, runTask, runFirstTask } from "./tasks";
import { MesonProjectExplorer } from "./treeview";
import { TargetNode } from "./treeview/nodes/targets";
import {
  extensionConfiguration,
  workspaceRelative,
  extensionConfigurationSet,
  genEnvFile,
  useCompileCommands,
  clearCache,
  checkMesonIsConfigured,
  getOutputChannel,
} from "./utils";
import { DebugConfigurationProvider } from "./configprovider";
import { testDebugHandler, testRunHandler, rebuildTests } from "./tests";
import { activateLinters } from "./linters";
import { activateFormatters } from "./formatters";
import { SettingsKey, TaskQuickPickItem } from "./types";
import { createLanguageServerClient } from "./lsp/common";

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

  explorer = new MesonProjectExplorer(ctx, root, buildDir);

  ctx.subscriptions.push(
    vscode.debug.registerDebugConfigurationProvider(
      "cppdbg",
      new DebugConfigurationProvider(buildDir),
      vscode.DebugConfigurationProviderTriggerKind.Dynamic,
    ),
  );

  const updateHasProject = async () => {
    const mesonFiles = await vscode.workspace.findFiles("**/meson.build");
    vscode.commands.executeCommand("setContext", "mesonbuild.hasProject", mesonFiles.length > 0);
  };
  mesonWatcher = vscode.workspace.createFileSystemWatcher("**/meson.build", false, true, false);
  mesonWatcher.onDidCreate(updateHasProject);
  mesonWatcher.onDidDelete(updateHasProject);
  ctx.subscriptions.push(mesonWatcher);
  await updateHasProject();

  controller = vscode.tests.createTestController("meson-test-controller", "Meson test controller");
  controller.createRunProfile(
    "Meson debug test",
    vscode.TestRunProfileKind.Debug,
    (request, token) => testDebugHandler(controller, request, token),
    true,
  );
  controller.createRunProfile(
    "Meson run test",
    vscode.TestRunProfileKind.Run,
    (request, token) => testRunHandler(controller, request, token),
    true,
  );
  ctx.subscriptions.push(controller);

  let mesonTasks: Thenable<vscode.Task[]> | null = null;
  ctx.subscriptions.push(
    vscode.tasks.registerTaskProvider("meson", {
      provideTasks() {
        mesonTasks ??= getMesonTasks(buildDir);
        return mesonTasks;
      },
      resolveTask() {
        return null;
      },
    }),
  );

  const changeHandler = async () => {
    mesonTasks = null;
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

  // Refresh if the extension configuration is changed.
  ctx.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e: vscode.ConfigurationChangeEvent) => {
      if (e.affectsConfiguration("mesonbuild.buildFolder")) {
        // buildFolder is rather ingrained right now, so changes there require a full reload.
        vscode.commands.executeCommand("workbench.action.reloadWindow");
      } else if (e.affectsConfiguration("mesonbuild")) {
        changeHandler();
      }
    }),
  );

  const compileCommandsHandler = async () => {
    await useCompileCommands(buildDir);
  };
  compileCommandsWatcher = vscode.workspace.createFileSystemWatcher(
    `${buildDir}/compile_commands.json`,
    false,
    false,
    true,
  );
  compileCommandsWatcher.onDidChange(compileCommandsHandler);
  compileCommandsWatcher.onDidCreate(compileCommandsHandler);
  ctx.subscriptions.push(compileCommandsWatcher);
  await useCompileCommands(buildDir);

  ctx.subscriptions.push(
    vscode.commands.registerCommand("mesonbuild.openBuildFile", async (node: TargetNode) => {
      const file = node.getTarget().defined_in;
      const uri = vscode.Uri.file(file);
      await vscode.commands.executeCommand("vscode.open", uri);
    }),
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand("mesonbuild.reconfigure", async () => {
      runFirstTask("reconfigure");
    }),
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand("mesonbuild.build", async (name?: string) => {
      pickAndRunTask("build", name);
    }),
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand("mesonbuild.install", async () => {
      runFirstTask("install");
    }),
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand("mesonbuild.test", async (name?: string) => {
      pickAndRunTask("test", name);
    }),
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand("mesonbuild.benchmark", async (name?: string) => {
      pickAndRunTask("benchmark", name);
    }),
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand("mesonbuild.clean", async () => {
      runFirstTask("clean");
    }),
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand("mesonbuild.run", async () => {
      pickAndRunTask("run");
    }),
  );

  if (!checkMesonIsConfigured(buildDir)) {
    let configureOnOpen = extensionConfiguration(SettingsKey.configureOnOpen);
    if (configureOnOpen === "ask") {
      enum Options {
        yes = "Yes",
        always = "Always",
        no = "No",
        never = "Never",
      }

      const response = await vscode.window.showInformationMessage(
        "Meson project detected in this workspace but does not seems to be configured. Would you like VS Code to configure it?",
        ...Object.values(Options),
      );

      switch (response) {
        case Options.no:
          break;

        case Options.never:
          extensionConfigurationSet(SettingsKey.configureOnOpen, false, vscode.ConfigurationTarget.Workspace);
          break;

        case Options.yes:
          configureOnOpen = true;
          break;

        case Options.always:
          extensionConfigurationSet(SettingsKey.configureOnOpen, true, vscode.ConfigurationTarget.Workspace);
          configureOnOpen = true;
          break;
      }
    }
  } else {
    await rebuildTests(controller);
  }

  const downloadLanguageServer = extensionConfiguration(SettingsKey.downloadLanguageServer);
  const server = extensionConfiguration(SettingsKey.languageServer);
  const shouldDownload = async (downloadLanguageServer: boolean | "ask"): Promise<boolean> => {
    if (typeof downloadLanguageServer === "boolean") return downloadLanguageServer;

    enum Options {
      yes = "Yes",
      no = "Not this time",
      never = "Never",
    }

    const response = await vscode.window.showInformationMessage(
      "Should the extension try to download the language server?",
      ...Object.values(Options),
    );

    switch (response) {
      case Options.yes:
        extensionConfigurationSet(SettingsKey.downloadLanguageServer, true, vscode.ConfigurationTarget.Global);
        return true;

      case Options.never:
        extensionConfigurationSet(SettingsKey.downloadLanguageServer, false, vscode.ConfigurationTarget.Global);
        return false;

      case Options.no:
        extensionConfigurationSet(SettingsKey.downloadLanguageServer, "ask", vscode.ConfigurationTarget.Global);
        return false;
    }

    return false;
  };

  let client = await createLanguageServerClient(server, await shouldDownload(downloadLanguageServer), ctx);
  if (client !== null && server == "Swift-MesonLSP") {
    ctx.subscriptions.push(client);
    client.start();

    getOutputChannel().appendLine("Not enabling the muon linter/formatter because Swift-MesonLSP is active.");
  } else {
    activateLinters(root, ctx);
    activateFormatters(ctx);
  }

  ctx.subscriptions.push(
    vscode.commands.registerCommand("mesonbuild.restartLanguageServer", async () => {
      if (client === null) {
        client = await createLanguageServerClient(server, await shouldDownload(downloadLanguageServer), ctx);
        if (client !== null) {
          ctx.subscriptions.push(client);
          client.start();
          // TODO: The output line from above about not enabling muon would be good to have here.
        }
      } else {
        client.restart();
      }
    }),
  );

  async function pickTask(mode: string) {
    const picker = vscode.window.createQuickPick<TaskQuickPickItem>();
    picker.busy = true;
    picker.placeholder = `Select target to ${mode}.`;
    picker.show();

    const runnableTasks = await getTasks(mode);

    picker.busy = false;
    picker.items = runnableTasks.map((task) => {
      return {
        label: task.name,
        detail: task.detail,
        picked: false,
        task: task,
      };
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
      runFirstTask(mode, name);
      return;
    }
    let taskItem;
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
