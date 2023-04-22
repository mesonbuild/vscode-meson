import * as vscode from "vscode";
import { BaseNode } from "./basenode";
import { getMesonProjectInfo } from "../introspection";
import { ProjectNode } from "./nodes/toplevel";

class MesonProjectDataProvider implements vscode.TreeDataProvider<BaseNode> {
  private readonly _onDataChangeEmitter = new vscode.EventEmitter<BaseNode | void>();
  readonly onDidChangeTreeData = this._onDataChangeEmitter.event;

  static readonly commandName = "mesonbuild.view-refresh";

  constructor(ctx: vscode.ExtensionContext, private readonly projectDir: string, private readonly buildDir: string) {
    ctx.subscriptions.push(
      vscode.commands.registerCommand(MesonProjectDataProvider.commandName, () =>
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
    if (element) {
      return element.getChildren();
    }

    const projectInfo = await getMesonProjectInfo(this.buildDir);
    return [new ProjectNode(projectInfo, this.projectDir, this.buildDir)];
  }
}

export class MesonProjectExplorer {
  private readonly viewer: vscode.TreeView<BaseNode>;

  constructor(ctx: vscode.ExtensionContext, projectDir: string, buildDir: string) {
    const treeDataProvider = new MesonProjectDataProvider(ctx, projectDir, buildDir);
    this.viewer = vscode.window.createTreeView("meson-project", {
      treeDataProvider
    });
  }

  public refresh() {
    vscode.commands.executeCommand(MesonProjectDataProvider.commandName);
  }
}
