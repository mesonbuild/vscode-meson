import * as vscode from "vscode";

import { BaseNode } from "./nodes/base";
import { WorkspaceRootNode } from "./nodes/workspaceroot";
import { runMesonConfigure } from "../meson/runners";
import { extensionConfiguration } from "../utils";

import { activateLinters } from "../linters"

class MesonProjectDataProvider implements vscode.TreeDataProvider<BaseNode> {
  private readonly _onDataChangeEmitter = new vscode.EventEmitter<BaseNode>();
  private workspaceRootNodes: WorkspaceRootNode[] = [];
  readonly onDidChangeTreeData = this._onDataChangeEmitter.event;

  static readonly commandName = "mesonbuild.view-refresh";

  constructor(private readonly ctx: vscode.ExtensionContext) {
    ctx.subscriptions.push(vscode.commands.registerCommand(MesonProjectDataProvider.commandName, () => this.refresh()));

    ctx.subscriptions.push(
      vscode.commands.registerCommand("mesonbuild.configure", async (node?: WorkspaceRootNode) => {
        let workspaceFolder: vscode.WorkspaceFolder;

        if (!node) {
          // From command palette. Pick root if there are multiple.
          if (this.workspaceRootNodes.length > 1) {
            workspaceFolder = await vscode.window.showWorkspaceFolderPick();
          } else {
            workspaceFolder = this.workspaceRootNodes[0].workspaceFolder;
          }
        } else {
          workspaceFolder = node.workspaceFolder;
        }

        if (!workspaceFolder) {
          return;
        }

        // Pick build directory.
        const buildDir = await vscode.window.showInputBox({ value: extensionConfiguration("buildFolder") });
        if (!buildDir) {
          return;
        }

        // TODO possibly show ...setupOpts, ...configureOpts, though somewhat messy here wrt (re)configure.

        await runMesonConfigure(workspaceFolder.uri.fsPath, buildDir);

        MesonProjectExplorer.refresh();
      })
    );

    this.refresh();
  }

  async refresh() {
    await this.walkDirectories();

    this._onDataChangeEmitter.fire(null);
  }

  getTreeItem(element: BaseNode) {
    return element.getTreeItem();
  }

  async getChildren(element?: BaseNode) {
    if (element) {
      return element.getChildren();
    }

    // TODO why on adding 2nd workspace root is this called before the walk of the build dirs is complete??

    const projectNodes = this.workspaceRootNodes.map((node) => {
      const children =  node.getChildren();

      // If no buildir exists (yet), show the workspaceroot (in the sidebar it will get a configure button). Otherwise show its children (the builddirs).
      // This is less than ideal, but I think the only other option is to introspect meson.build ourselves in order to populate ProjectInfo.
      // I don't think meson can do it; everything requires a builddir.
      return (children.length === 0) ? node : children;
    }).flat(1);

    return projectNodes;
  }

  private async walkDirectories() {
    for (const workspaceRootNode of this.workspaceRootNodes) {
      workspaceRootNode.dispose();
    }
    this.workspaceRootNodes = [];

    for (const workspaceFolder of vscode.workspace.workspaceFolders) {
      const workspaceRootNode = new WorkspaceRootNode(this.ctx, workspaceFolder);
      this.workspaceRootNodes.push(workspaceRootNode);
      this.ctx.subscriptions.push(workspaceRootNode);
      activateLinters(workspaceFolder.uri.fsPath, this.ctx);
    }

    await Promise.all(this.workspaceRootNodes.map((node) => node.readdir()));
    const hasMesonProject = this.workspaceRootNodes.some((workspaceRootNode) => workspaceRootNode.hasMesonProject);
    vscode.commands.executeCommand("setContext", "mesonbuild.hasProject", hasMesonProject);
  }
}

export class MesonProjectExplorer {
  private readonly viewer: vscode.TreeView<BaseNode>;

  constructor(ctx: vscode.ExtensionContext) {
    const treeDataProvider = new MesonProjectDataProvider(ctx);

    this.viewer = vscode.window.createTreeView("meson-project", { treeDataProvider });

    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      // TODO Weird. Docs (1.74.1) say:

      // **Note:** this event will not fire if the first workspace folder is added, removed or changed,
      // because in that case the currently executing extensions (including the one that listens to this
      // event) will be terminated and restarted so that the (deprecated) `rootPath` property is updated
      // to point to the first workspace folder.

      // Adding a 2nd folder also causes the extension to be restarted completely.
      // Adding a 3rd folder doesn't!
      MesonProjectExplorer.refresh();
    });
  }

  public static refresh() {
    vscode.commands.executeCommand(MesonProjectDataProvider.commandName);
  }
}
