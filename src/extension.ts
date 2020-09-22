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
        workspaceRelative(extensionConfiguration("sourceFolder")),
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
        const resolvedName = await new Promise<string>((resolve, reject) => {
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
            picker.onDidAccept(async () => {
              const active = picker.activeItems[0];
              if (active.label === "all") resolve(undefined);
              else
                resolve(
                  getTargetName(
                    (await getMesonTargets(buildDir)).filter(
                      t => t.name === active.label
                    )[0]
                  )
                );
              picker.dispose();
            });
            picker.onDidHide(() => reject());
          });
        }).catch<null>(() => null);
        if (resolvedName !== null)
          await runMesonBuild(
            workspaceRelative(extensionConfiguration("buildFolder")),
            resolvedName
          );
        explorer.refresh();
      }
    )
  );
  ctx.subscriptions.push(
    vscode.commands.registerCommand(
      "mesonbuild.test",
      async (name?: string) => {
        const resolvedName = await new Promise<string>((resolve, reject) => {
          if (name) return resolve(name);
          const picker = vscode.window.createQuickPick();
          picker.busy = true;
          picker.onDidAccept(() => {
            const active = picker.activeItems[0];
            if (active.label === "all") resolve(undefined);
            else resolve(active.label);
            picker.dispose();
          });
          picker.onDidHide(() => reject());
          Promise.all([getMesonTests(buildDir), getMesonBenchmarks(buildDir)])
            .then<vscode.QuickPickItem[]>(([tests, benchmarks]) => [
              {
                label: "all",
                detail: "Run all tests",
                description: "(meta-target)",
                picked: true
              },
              ...tests.map<vscode.QuickPickItem>(t => ({
                label: t.name,
                detail: `Test timeout: ${t.timeout}s, ${
                  t.is_parallel ? "Run in parallel" : "Run serially"
                }`,
                description: t.suite.join(","),
                picked: false
              })),
              ...benchmarks.map<vscode.QuickPickItem>(b => ({
                label: b.name,
                detail: `Benchmark timeout: ${
                  b.timeout
                }s, benchmarks always run serially`,
                description: b.suite.join(","),
                picked: false
              }))
            ])
            .then(items => {
              picker.busy = false;
              picker.items = items;
            });
          picker.show();
        }).catch<null>(() => null);
        if (resolvedName != null)
          await runMesonTests(
            workspaceRelative(extensionConfiguration("buildFolder")),
            resolvedName
          );
        explorer.refresh();
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
  else {
    vscode.window
      .showInformationMessage(
        "Meson project detected, would you like VS Code to configure it?",
        "No",
        "This workspace",
        "Yes"
      )
      .then(response => {
        switch (response) {
          case "Yes":
            extensionConfigurationSet(
              "configureOnOpen",
              true,
              vscode.ConfigurationTarget.Global
            );
            break;
          case "This workspace":
            extensionConfigurationSet(
              "configureOnOpen",
              true,
              vscode.ConfigurationTarget.Workspace
            );
            break;
          default:
            extensionConfigurationSet(
              "configureOnOpen",
              false,
              vscode.ConfigurationTarget.Global
            );
        }
        if (response !== "No") {
          vscode.commands
            .executeCommand("mesonbuild.configure")
            .then(() => explorer.refresh());
        }
      });
  }
}
