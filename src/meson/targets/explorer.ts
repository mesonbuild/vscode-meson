import * as vscode from "vscode";
import { MesonTargetsDataProvider } from "./provider";
import { BaseNode } from "../basenode";

export class MesonTargetsExplorer {
  private viewer: vscode.TreeView<BaseNode>;

  constructor(ctx: vscode.ExtensionContext, build: string) {
    const treeDataProvider = new MesonTargetsDataProvider(build);
    this.viewer = vscode.window.createTreeView("meson-targets", {
      treeDataProvider
    });
  }
  public refresh() {
    vscode.commands.executeCommand("mesonbuild.targets-refresh");
  }
}
