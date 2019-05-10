import * as vscode from "vscode";
import { BaseNode } from "../basenode";
import { getMesonTests } from "../introspection";
import { TestNode } from "./nodes";

export class MesonTestsDataProvider
  implements vscode.TreeDataProvider<BaseNode> {
  private _onChangeData = new vscode.EventEmitter<BaseNode>();
  onDidChangeTreeData = this._onChangeData.event;

  constructor(private buildDir: string) {
    vscode.commands.registerCommand("mesonbuild.tests-refresh", () =>
      this.refresh()
    );
  }

  getTreeItem(element: BaseNode): vscode.TreeItem | Thenable<vscode.TreeItem> {
    return element.getTreeItem();
  }

  getChildren(element?: BaseNode): vscode.ProviderResult<BaseNode[]> {
    if (element) return element.getChildren();
    else
      return getMesonTests(this.buildDir).then(tt =>
        tt.map(t => new TestNode(t))
      );
  }

  private refresh() {
    this._onChangeData.fire();
  }
}
