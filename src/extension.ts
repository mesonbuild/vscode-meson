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
import { extensionConfiguration } from "./utils";

let explorer: MesonProjectExplorer;

export function activate(ctx: vscode.ExtensionContext): void {
  const root = vscode.workspace.rootPath;
  // TODO: Make build dir configurable
  const buildDir = path.join(root, extensionConfiguration("buildFolder"));
  if (!root) return;

  explorer = new MesonProjectExplorer(ctx, buildDir);

  const tasksDisposable = vscode.tasks.registerTaskProvider("meson", {
    provideTasks(token) {
      return getMesonTasks(buildDir);
    },
    resolveTask() {
      return undefined;
    }
  });

  ctx.subscriptions.push(
    vscode.commands.registerCommand("mesonbuild.configure", async () => {
      await runMesonConfigure(root, buildDir);
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
        await runMesonBuild(name);
        explorer.refresh();
      }
    )
  );
  ctx.subscriptions.push(
    vscode.commands.registerCommand(
      "mesonbuild.test",
      async (name?: string) => {
        await runMesonTests(buildDir, name);
      }
    )
  );

  ctx.subscriptions.push(tasksDisposable);

  if (extensionConfiguration("configureOnOpen"))
    vscode.commands
      .executeCommand<boolean>("mesonbuild.configure")
      .then(isFresh => {
        explorer.refresh();
      });
}
