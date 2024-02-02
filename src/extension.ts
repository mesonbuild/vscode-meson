import * as vscode from "vscode";
import { getMesonTasks, getTasks, runTask, runFirstTask } from "./tasks";
import { MesonProjectExplorer } from "./treeview";
import { TargetNode } from "./treeview/nodes/targets";
import {
  extensionConfiguration,
  genEnvFile,
  clearCache,
  checkMesonIsConfigured,
  getOutputChannel,
  getBuildDirectory,
  whenFileExists,
  mesonRootDirs,
  shouldModifySetting,
} from "./utils";
import { DebugConfigurationProviderCppdbg } from "./debug/cppdbg";
import { DebugConfigurationProviderLldb } from "./debug/lldb";
import { CpptoolsProvider, registerCppToolsProvider } from "./cpptoolsconfigprovider";
import { testDebugHandler, testRunHandler, rebuildTests } from "./tests";
import { activateLinters } from "./linters";
import { activateFormatters } from "./formatters";
import { SettingsKey, TaskQuickPickItem } from "./types";
import { createLanguageServerClient } from "./lsp/common";
import { askShouldDownloadLanguageServer, askConfigureOnOpen, askAndSelectRootDir, selectRootDir } from "./dialogs";

export let extensionPath: string;
export let workspaceState: vscode.Memento;
let explorer: MesonProjectExplorer;
let cpptools: CpptoolsProvider;
let watcher: vscode.FileSystemWatcher;
let controller: vscode.TestController;

export async function activate(ctx: vscode.ExtensionContext) {
  extensionPath = ctx.extensionPath;
  workspaceState = ctx.workspaceState;

  // The workspace could contain multiple Meson projects. Take all root
  // meson.build files we find. Usually that's just one at the root of the
  // workspace.
  const rootDirs = await mesonRootDirs();
  let rootDir: string | undefined = undefined;
  if (rootDirs.length == 1) {
    rootDir = rootDirs[0];
  } else if (rootDirs.length > 1) {
    let savedSourceDir = workspaceState.get<string>("mesonbuild.sourceDir");
    if (savedSourceDir && rootDirs.includes(savedSourceDir)) {
      rootDir = savedSourceDir;
    } else {
      // We have more than one root meson.build file and none has been previously
      // saved. Ask the user to pick one.
      rootDir = await askAndSelectRootDir(rootDirs);
    }
  }

  ctx.subscriptions.push(
    vscode.commands.registerCommand("mesonbuild.selectRootDir", async () => {
      let newRootDir = await selectRootDir(await mesonRootDirs());
      if (newRootDir && newRootDir != rootDir) {
        await workspaceState.update("mesonbuild.sourceDir", newRootDir);
        vscode.commands.executeCommand("workbench.action.reloadWindow");
      }
    }),
  );

  getOutputChannel().appendLine(`Meson project root: ${rootDir}`);
  vscode.commands.executeCommand("setContext", "mesonbuild.hasProject", rootDir !== undefined);
  vscode.commands.executeCommand("setContext", "mesonbuild.hasMultipleProjects", rootDirs.length > 1);
  if (!rootDir) return;

  const sourceDir = rootDir;
  const buildDir = getBuildDirectory(sourceDir);
  workspaceState.update("mesonbuild.buildDir", buildDir);
  workspaceState.update("mesonbuild.sourceDir", sourceDir);
  cpptools = new CpptoolsProvider(buildDir);
  registerCppToolsProvider(ctx, cpptools);

  explorer = new MesonProjectExplorer(ctx, sourceDir, buildDir);

  const providers = [DebugConfigurationProviderCppdbg, DebugConfigurationProviderLldb];
  providers.forEach((provider) => {
    const p = new provider(buildDir);
    ctx.subscriptions.push(
      vscode.debug.registerDebugConfigurationProvider(p.type, p, vscode.DebugConfigurationProviderTriggerKind.Dynamic),
    );
  });

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
        mesonTasks ??= getMesonTasks(buildDir, sourceDir);
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

  const compileCommandsFile = `${buildDir}/compile_commands.json`;
  whenFileExists(ctx, compileCommandsFile, async () => {
    if (shouldModifySetting("ms-vscode.cpptools")) {
      const conf = vscode.workspace.getConfiguration("C_Cpp");
      conf.update("default.compileCommands", compileCommandsFile, vscode.ConfigurationTarget.Workspace);
    }
  });

  const rustProjectFile = `${buildDir}/rust-project.json`;
  whenFileExists(ctx, rustProjectFile, async () => {
    if (shouldModifySetting("rust-lang.rust-analyzer")) {
      const conf = vscode.workspace.getConfiguration("rust-analyzer");
      conf.update("linkedProjects", [rustProjectFile], vscode.ConfigurationTarget.Workspace);
    }
  });

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
    if (await askConfigureOnOpen()) runFirstTask("reconfigure");
  } else {
    await rebuildTests(controller);
  }

  const server = extensionConfiguration(SettingsKey.languageServer);
  let client = await createLanguageServerClient(server, await askShouldDownloadLanguageServer(), ctx);
  if (client !== null && server == "Swift-MesonLSP") {
    ctx.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration(`mesonbuild.${server}`)) {
          client?.reloadConfig();
        }
      }),
    );

    await client.update(ctx);
    ctx.subscriptions.push(client);
    client.start();
    await client.reloadConfig();

    getOutputChannel().appendLine("Not enabling the muon linter/formatter because Swift-MesonLSP is active.");
  } else {
    activateLinters(sourceDir, ctx);
    activateFormatters(sourceDir, ctx);
  }

  ctx.subscriptions.push(
    vscode.commands.registerCommand("mesonbuild.restartLanguageServer", async () => {
      if (client === null) {
        client = await createLanguageServerClient(server, await askShouldDownloadLanguageServer(), ctx);
        if (client !== null) {
          ctx.subscriptions.push(client);
          client.start();
          await client.reloadConfig();
          // TODO: The output line from above about not enabling muon would be good to have here.
        }
      } else {
        await client.restart();
        await client.reloadConfig();
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
