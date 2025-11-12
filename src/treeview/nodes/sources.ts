import * as path from "node:path";
import * as vscode from "vscode";

import { extensionRelative } from "../../utils.js";
import { BaseNode } from "../basenode.js";
import { BaseDirectoryNode } from "./base.js";

abstract class BaseFileDirectoryNode extends BaseDirectoryNode<string> {
  override async getChildren() {
    const subfolders = await this.subfolders;

    return Array.from(subfolders.entries())
      .map(([folder, files]) => {
        if (folder === ".") {
          return files.map((file) => new TargetSourceFileNode(this.id, file));
        } else {
          return new TargetSourceDirectoryNode(this.id, folder, files);
        }
      })
      .flat(1);
  }

  buildFileTree(fpaths: string[]) {
    const folders = new Map<string, string[]>();
    folders.set(".", new Array());

    for (const f of fpaths) {
      let folderName = path.relative(this.folder, f);
      if (path.dirname(folderName) === ".") {
        folders.get(".")?.push(f);
        continue;
      }

      while (path.dirname(folderName) !== ".") {
        folderName = path.dirname(folderName);
      }

      const absFolder = path.join(this.folder, folderName);
      if (!folders.get(absFolder)?.push(f)) {
        folders.set(absFolder, [f]);
      }
    }

    return folders;
  }
}

export class TargetSourcesRootNode extends BaseFileDirectoryNode {
  constructor(
    parentId: string,
    rootFolder: string,
    private readonly allFiles: string[],
  ) {
    super(`${parentId}-sources`, rootFolder, allFiles);
  }

  override getTreeItem() {
    const item = super.getTreeItem() as vscode.TreeItem;

    item.label = `Sources${this.allFiles.length === 0 ? " (no files)" : ""}`;
    item.iconPath = extensionRelative("res/meson_32.svg");

    return item;
  }
}

export class TargetGeneratedSourcesRootNode extends BaseFileDirectoryNode {
  constructor(parentId: string, files: string[]) {
    super(`${parentId}-gensources`, vscode.workspace.rootPath!, files);
  }

  override getTreeItem() {
    const item = super.getTreeItem() as vscode.TreeItem;

    item.label = "Sources (generated)";
    item.iconPath = extensionRelative("res/meson_32.svg");

    return item;
  }
}

export class TargetSourceDirectoryNode extends BaseFileDirectoryNode {
  constructor(parentId: string, folder: string, files: string[]) {
    super(`${parentId}-${path.basename(folder)}`, folder, files);
  }

  override getTreeItem() {
    const item = super.getTreeItem();

    item.label = path.basename(this.folder);
    item.resourceUri = vscode.Uri.file(this.folder);

    return item;
  }
}

export class TargetSourceFileNode extends BaseNode {
  constructor(
    parentId: string,
    private readonly file: string,
  ) {
    super(`${parentId}-${path.basename(file)}`);
  }

  override getTreeItem() {
    const item = super.getTreeItem() as vscode.TreeItem;

    item.label = path.basename(this.file);
    item.resourceUri = vscode.Uri.file(this.file);
    item.command = {
      command: "vscode.open",
      title: "Open file",
      arguments: [vscode.Uri.file(this.file)],
    };

    // No children currently, so don't display toggle.
    item.collapsibleState = vscode.TreeItemCollapsibleState.None;

    return item;
  }
}
