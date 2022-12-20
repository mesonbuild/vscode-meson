import * as path from "path";
import * as vscode from "vscode";

import { extensionRelative, isThenable } from "../../utils";
import { BaseNode } from "./base";

abstract class BaseFileDirectoryNode extends BaseNode {
  subfolders: Thenable<Map<string, string[]>>;

  constructor(id: string, protected readonly workspaceFolder: vscode.WorkspaceFolder, protected readonly folder: string, filePaths: string[])
  {
    super(id);

    const subfolders = this.buildFileTree(filePaths);
    if (isThenable(subfolders)) {
      this.subfolders = subfolders;
    } else {
      this.subfolders = Promise.resolve(subfolders);
    }
  }

  getTreeItem() {
    const item = super.getTreeItem() as vscode.TreeItem;

    item.label = path.basename(this.folder);
    // item.resourceUri = vscode.Uri.file(this.folder);
    item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;

    return item;
  }

  async getChildren() {
    const subfolders = await this.subfolders;

    return Array.from(subfolders.entries())
      .map(([folder, files]) => {
        if (folder === ".") {
          return files.map((file) => new TargetSourceFileNode(this.id, file));
        } else {
          return new TargetSourceDirectoryNode(this.id, this.workspaceFolder, folder, files);
        }
      })
      .flat(1);
  }

  private async buildFileTree(filePaths: string[]): Promise<Map<string, string[]>> {
    const folders = new Map<string, string[]>();
    folders.set(".", new Array());

    for (const f of filePaths) {
      let folderName = path.relative(this.folder, f);
      if (path.dirname(folderName) === ".") {
        folders.get(".").push(f);
        continue;
      }

      while (path.dirname(folderName) !== ".") {
        folderName = path.dirname(folderName);
      }

      const absFolder = path.join(this.folder, folderName);
      if (folders.has(absFolder)) {
        folders.get(absFolder).push(f);
      } else {
        folders.set(absFolder, [f]);
      }
    }

    return folders;
  }
}

export class TargetSourcesRootNode extends BaseFileDirectoryNode {
  constructor(parentId: string, workspaceFolder: vscode.WorkspaceFolder, rootFolder: string, private readonly allFiles: string[]) {
    super(`${parentId}-sources`, workspaceFolder, rootFolder, allFiles);
  }

  getTreeItem() {
    const item = super.getTreeItem() as vscode.TreeItem;

    item.label = `Sources${(this.allFiles.length === 0) ? " (no files)" : ""}`;
    item.iconPath = extensionRelative("res/meson_32.svg");

    return item;
  }
}

export class TargetGeneratedSourcesRootNode extends BaseFileDirectoryNode {
  constructor(parentId: string, workspaceFolder: vscode.WorkspaceFolder, files: string[]) {
    super(`${parentId}-gensources`, workspaceFolder, workspaceFolder.uri.fsPath, files);
  }

  getTreeItem() {
    const item = super.getTreeItem() as vscode.TreeItem;

    item.label = "Sources (generated)";
    item.iconPath = extensionRelative("res/meson_32.svg");

    return item;
  }
}

export class TargetSourceDirectoryNode extends BaseFileDirectoryNode {
  constructor(parentId: string, workspaceFolder: vscode.WorkspaceFolder, folder: string, files: string[]) {
    super(`${parentId}-${path.basename(folder)}`, workspaceFolder, folder, files);
  }

  getTreeItem() {
    const item = super.getTreeItem();

    item.label = path.basename(this.folder);
    item.resourceUri = vscode.Uri.file(this.folder);

    return item;
  }
}

export class TargetSourceFileNode extends BaseNode {
  constructor(parentId: string, private readonly file: string) {
    super(`${parentId}-${path.basename(file)}`);
  }

  getTreeItem() {
    const item = super.getTreeItem() as vscode.TreeItem;

    item.label = path.basename(this.file);
    item.resourceUri = vscode.Uri.file(this.file);
    item.command = {
      command: "vscode.open",
      title: "Open file",
      arguments: [vscode.Uri.file(this.file)]
    };

    // No children currently, so don't display toggle.
    item.collapsibleState = vscode.TreeItemCollapsibleState.None;

    return item;
  }
}
