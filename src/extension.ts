import * as path from "path";
import * as vscode from "vscode";
import { MesonTargetsExplorer } from "./meson/targets/explorer";
import { MesonTestsExplorer } from "./meson/tests/explorer";
import {
  runMesonConfigure,
  runMesonBuild,
  runMesonTests,
  runMesonReconfigure
} from "./meson/runners";
import { getMesonTasks } from "./tasks";

let targetExplorer: MesonTargetsExplorer | undefined;
let testExplorer: MesonTestsExplorer | undefined;
let taskProvider;

export function activate(ctx: vscode.ExtensionContext): void {
  const root = vscode.workspace.rootPath;
  // TODO: Make build dir configurable
  const buildDir = path.join(root, "build");
  if (!root) return;

  targetExplorer = new MesonTargetsExplorer(ctx, buildDir);
  testExplorer = new MesonTestsExplorer(ctx, buildDir);
  taskProvider = vscode.tasks.registerTaskProvider("meson", {
    provideTasks(token) {
      return getMesonTasks(buildDir);
    },
    resolveTask() {
      return undefined;
    }
  });
  vscode.commands.registerCommand("mesonbuild.configure", async () => {
    await runMesonConfigure(root, buildDir);
    targetExplorer.refresh();
    testExplorer.refresh();
  });
  vscode.commands.registerCommand("mesonbuild.reconfigure", async () => {
    await runMesonReconfigure();
    targetExplorer.refresh();
    testExplorer.refresh();
  });
  vscode.commands.registerCommand("mesonbuild.build", async (name?: string) => {
    await runMesonBuild(name);
    targetExplorer.refresh();
    testExplorer.refresh();
  });
  vscode.commands.registerCommand("mesonbuild.test", async () => {
    await runMesonTests(buildDir);
  });

  // Run command on activation
  vscode.commands
    .executeCommand<boolean>("mesonbuild.configure")
    .then(isFresh => {
      targetExplorer.refresh();
      testExplorer.refresh();
    });
}
