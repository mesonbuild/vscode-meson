import * as vscode from "vscode";
import { BaseNode } from "../basenode";
import { TargetNode } from "./nodes";
import { getMesonTargets } from "../introspection";

export class MesonTargetsDataProvider
  implements vscode.TreeDataProvider<BaseNode> {
  private _onDataChangeEmitter = new vscode.EventEmitter<BaseNode>();
  readonly onDidChangeTreeData = this._onDataChangeEmitter.event;

  constructor(private buildDir: string) {
    vscode.commands.registerCommand("mesonbuild.targets-refresh", () =>
      this.refresh()
    );
  }

  refresh() {
    this._onDataChangeEmitter.fire();
  }

  getTreeItem(element: BaseNode): vscode.ProviderResult<vscode.TreeItem> {
    return element.getTreeItem();
  }

  getChildren(element?: BaseNode): vscode.ProviderResult<BaseNode[]> {
    if (element) return element.getChildren();
    else
      return getMesonTargets(this.buildDir).then(t =>
        t.map(tt => new TargetNode(tt))
      );
  }
}
