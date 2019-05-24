import * as vscode from "vscode";
import { BaseNode } from "./basenode";
import { getMesonProjectInfo } from "../meson/introspection";
import { ProjectNode } from "./nodes/toplevel";

export class MesonProjectDataProvider
  implements vscode.TreeDataProvider<BaseNode> {
  private _onDataChangeEmitter = new vscode.EventEmitter<BaseNode>();
  readonly onDidChangeTreeData = this._onDataChangeEmitter.event;

  constructor(ctx: vscode.ExtensionContext, private buildDir: string) {
    ctx.subscriptions.push(
      vscode.commands.registerCommand("mesonbuild.view-refresh", () =>
        this.refresh()
      )
    );
  }

  refresh() {
    this._onDataChangeEmitter.fire();
  }

  getTreeItem(element: BaseNode) {
    return element.getTreeItem();
  }
  async getChildren(element?: BaseNode) {
    if (element) return element.getChildren();
    return [
      await getMesonProjectInfo(this.buildDir).then(
        p => new ProjectNode(p, this.buildDir)
      )
    ];
  }
}

export class MesonProjectExplorer {
  private viewer: vscode.TreeView<BaseNode>;

  constructor(ctx: vscode.ExtensionContext, buildDir: string) {
    const treeDataProvider = new MesonProjectDataProvider(ctx, buildDir);
    this.viewer = vscode.window.createTreeView("meson-project", {
      treeDataProvider
    });
  }

  public refresh() {
    vscode.commands.executeCommand("mesonbuild.targets-refresh");
  }
}
