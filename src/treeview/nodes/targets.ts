import * as path from "path";
import * as vscode from "vscode";

import { BaseNode, IBuildableNode, IDebuggableNode } from "./base";
import { Target, Targets } from "../../meson/types";
import { TargetSourcesRootNode, TargetGeneratedSourcesRootNode } from "./sources";
import { extensionRelative, getTargetName2, isThenable } from "../../utils";
import { runMesonBuild } from "../../meson/runners";

export class TargetDirectoryNode extends BaseNode {
  subfolders: Thenable<Map<string, Targets>>;

  constructor(parentId, private readonly workspaceFolder: vscode.WorkspaceFolder, private readonly buildDir: string, private readonly folder: string, targets: Targets) {
    super(`${parentId}-${path.basename(folder)}`);

    const subfolders = this.buildFileTree(targets);
    if (isThenable(subfolders)) {
      this.subfolders = subfolders;
    } else {
      this.subfolders = Promise.resolve(subfolders);
    }
  }

  getTreeItem() {
    const item = super.getTreeItem() as vscode.TreeItem;

    if (this.folder === ".") {
      item.label = "Targets";
      item.iconPath = extensionRelative("res/meson_32.svg");
    } else {
      item.label = path.basename(this.folder);
      // With vscode-icons installed, this will do the right thing with expansion state.
      item.iconPath = vscode.ThemeIcon.Folder;
    }

    item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;

    return item;
  }

  async getChildren() {
    return Array.from((await this.subfolders).entries())
      .map(([folder, targets]) => {
        if (folder === ".") {
          return targets.map(tgt => new TargetNode(this.id, this.workspaceFolder, this.buildDir, tgt));
        } else {
          return new TargetDirectoryNode(this.id, this.workspaceFolder, this.buildDir, folder, targets);
        }
      })
      .flat(1);
  }

  private async buildFileTree(targets: Targets): Promise<Map<string, Targets>> {
    const folders = new Map<string, Targets>();
    folders.set(".", new Array());

    for (const target of targets) {
      const targetName = await getTargetName2(this.workspaceFolder, this.buildDir, target);

      let folderName = path.relative(this.folder, targetName);
      if (path.dirname(folderName) === ".") {
        folders.get(".").push(target);
        continue;
      }

      while (path.dirname(folderName) !== ".") {
        folderName = path.dirname(folderName);
      }

      const absFolder = path.join(this.folder, folderName);
      if (folders.has(absFolder)) {
        folders.get(absFolder).push(target);
      } else {
        folders.set(absFolder, [target]);
      }
    }

    return folders;
  }
}

export class TargetNode extends BaseNode implements IBuildableNode, IDebuggableNode {
  constructor(parentId: string, private readonly workspaceFolder: vscode.WorkspaceFolder, private readonly buildDir: string, private readonly target: Target) {
    super(`${parentId}-${target.id}`);
  }

  getTarget() {
    return this.target;
  }

  getChildren() {
    if (!this.target.target_sources) {
      return [];
    }
    else {
      const sources = new Array<string>();
      const generated_sources = new Array<string>();
      for (const s of this.target.target_sources) {
        sources.push(...s.sources);
        sources.push(...s.generated_sources);
      }

      const sourceNode = new TargetSourcesRootNode(this.id, this.workspaceFolder, path.dirname(this.target.defined_in), sources);
      return (generated_sources.length === 0) ? [sourceNode] : [sourceNode, new TargetGeneratedSourcesRootNode(this.id, this.workspaceFolder, generated_sources)];
    }
  }

  async getTreeItem() {
    const item = super.getTreeItem() as vscode.TreeItem;

    item.label = this.target.name;
    item.iconPath = extensionRelative(this.getIconPath());
    item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;

    // To key in to "when": "view == meson-project && viewItem == meson-target" in package.json.
    item.contextValue = "meson-target";

    // Command to execute when clicked.
    item.command = {
      title: `Build ${this.target.name}`,
      command: "mesonbuild.node.build",
      arguments: [this]
    };

    return item;
  }

  getName() {
    return this.target.name;
  }

  async build() {
    // meson doesn't seem to require path/to/target now. Name is sufficient.
    // TODO check that, what version?
    // Was: await getTargetName(this.target)
    return runMesonBuild(this.buildDir, this.getName(), this.getName());
  }

  async debug() {
    // Note this is not specifying "preLaunchTask".
	// Maybe a better approach is to register a task for building each target, rather than the on-demand temp thing.
	// Then preLaunchTask as below will work.
    // TODO how to actually wait for build to finish?
    // TODO filter through launchConfig finding something similar and copy it?
    // const launchConfigs = vscode.workspace.getConfiguration("launch", this.workspaceFolder);

    const debugConfig: vscode.DebugConfiguration = {
      type: 'cppdbg',
      name: this.target.name,
      request: "launch",
      cwd: this.workspaceFolder.uri.fsPath,
      program: this.target.filename[0],
      // preLaunchTask: makeTaskTitle("build", this.buildDir, this.getName())
    };

    vscode.debug.startDebugging(this.workspaceFolder, debugConfig);
  }

  private getIconPath() {
    switch (this.target.type) {
      case "executable":
      case "run":
        return "res/icon-executable.svg";

      case "jar":
        return "res/icon-run-java.svg";

      case "shared library":
      case "static library":
      case "shared module":
        return "res/icon-library.svg";

      default:
        return "res/meson_32.svg";
    }
  }
}
