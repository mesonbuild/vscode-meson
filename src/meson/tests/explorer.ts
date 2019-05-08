import * as vscode from "vscode";
import { MesonTestsDataProvider } from "./provider";
import { BaseNode } from "../basenode";

export class MesonTestsExplorer {
  private viewer: vscode.TreeView<BaseNode>;

  constructor(ctx: vscode.ExtensionContext, build: string) {
    const treeDataProvider = new MesonTestsDataProvider(build);
    this.viewer = vscode.window.createTreeView("meson-tests", {
      treeDataProvider
    });
  }
  public refresh() {
    vscode.commands.executeCommand("mesonbuild.tests-refresh");
  }
}
