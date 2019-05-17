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
import { getMesonTargets } from "./meson/introspection";

let explorer: MesonProjectExplorer;

export function activate(ctx: vscode.ExtensionContext): void {
  const root = vscode.workspace.rootPath;
  const buildDir = workspaceRelative(extensionConfiguration("buildFolder"));
  if (!root) return;

  explorer = new MesonProjectExplorer(ctx, buildDir);

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
          await new Promise((resolve, reject) => {
            if (name) {
              return resolve(name);
            }
            const itemsP: Promise<vscode.QuickPickItem[]> = getMesonTargets(
              buildDir
            ).then<vscode.QuickPickItem[]>(tt => [
              {
                label: "all",
                detail: "Build all targets",
                description: "(meta-target)",
                picked: true
              },
              ...tt.map<vscode.QuickPickItem>(t => ({
                label: t.name,
                detail: path.relative(root, path.dirname(t.defined_in)),
                description: t.type,
                picked: false
              }))
            ]);
            const picker = vscode.window.createQuickPick();
            picker.busy = true;
            picker.placeholder =
              "Select target to build. Defaults to all targets";
            picker.show();
            itemsP.then(items => {
              picker.items = items;
              picker.busy = false;
              picker.onDidAccept(() => {
                const active = picker.activeItems[0];
                if (active.label === "all") resolve(undefined);
                else resolve(path.join(active.detail, active.label));
                picker.dispose();
              });
              picker.onDidHide(() => reject());
            });
          })
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

  if (extensionConfiguration("configureOnOpen"))
    vscode.commands
      .executeCommand<boolean>("mesonbuild.configure")
      .then(isFresh => {
        explorer.refresh();
      });
}
