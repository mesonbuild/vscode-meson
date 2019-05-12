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
import { extensionConfiguration, execAsTask, workspaceRelative } from "./utils";

let explorer: MesonProjectExplorer;

export function activate(ctx: vscode.ExtensionContext): void {
  const root = vscode.workspace.rootPath;
  const buildDir = workspaceRelative(extensionConfiguration("buildFolder"));
  if (!root) return;

  explorer = new MesonProjectExplorer(ctx, buildDir);

  const tasksDisposable = vscode.tasks.registerTaskProvider("meson", {
    provideTasks(token) {
      return getMesonTasks(
        workspaceRelative(extensionConfiguration("buildFolder"))
      );
    },
    resolveTask() {
      return undefined;
    }
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
        await runMesonBuild(
          workspaceRelative(extensionConfiguration("buildFolder")),
          name
        );
        explorer.refresh();
      }
    )
  );
  ctx.subscriptions.push(
    vscode.commands.registerCommand(
      "mesonbuild.test",
      async (name?: string) => {
        await runMesonTests(
          workspaceRelative(extensionConfiguration("buildFolder")),
          name
        );
      }
    )
  );
  ctx.subscriptions.push(
    vscode.commands.registerCommand("mesonbuild.clean", async () => {
      await execAsTask("ninja clean", {
        cwd: workspaceRelative(extensionConfiguration("buildFolder"))
      });
    })
  );

  ctx.subscriptions.push(tasksDisposable);

  if (extensionConfiguration("configureOnOpen"))
    vscode.commands
      .executeCommand<boolean>("mesonbuild.configure")
      .then(isFresh => {
        explorer.refresh();
      });
}
