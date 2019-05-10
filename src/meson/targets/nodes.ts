import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { Target } from "../types";
import { extensionRelative, randomString, getTargetName } from "../../utils";
import { BaseNode } from "../basenode";

export class TargetNode extends BaseNode {
  constructor(private readonly target: Target) {
    super(target.id);
  }

  getChildren() {
    if (!this.target.target_sources) return [];
    else {
      const sources = new Array<string>();
      const generated_sources = new Array<string>();
      for (const s of this.target.target_sources) {
        sources.push(...s.sources);
        sources.push(...s.generated_sources);
      }
      return [
        new TargetSourcesNode(sources),
        generated_sources.length > 0
          ? new TargetGeneratedSourcesNode(generated_sources)
          : void 0
      ];
    }
  }
  getTreeItem() {
    const item = super.getTreeItem();
    item.iconPath = extensionRelative(this.getIconPath());
    item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
    item.label = getTargetName(this.target);
    item.command = {
      title: `Build ${this.target.name}`,
      command: "mesonbuild.build",
      arguments: [getTargetName(this.target)]
    };
    return item;
  }

  private getIconPath() {
    switch (this.target.type) {
      case "executable":
      case "run":
      case "jar":
        return "res/exe.svg";
      case "shared library":
      case "static library":
      case "shared module":
        return "res/lib.svg";
      default:
        return "res/meson_64.svg";
    }
  }
}

class BaseDirectoryNode extends BaseNode {
  readonly subfolders: Map<string, string[]>;

  constructor(readonly folder: string, readonly filepaths: string[]) {
    super(folder + randomString());
    this.subfolders = this.buildFileTree(filepaths);
  }

  getTreeItem() {
    const item = super.getTreeItem();
    item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;

    return item;
  }

  getChildren() {
    return Array.from(this.subfolders.entries())
      .map(([folder, files]) => {
        if (folder === ".") {
          return files.map(f => new TargetSourceFileNode(f));
        } else return new DirectoryNode(folder, files);
      })
      .flat(1);
  }

  private buildFileTree(fpaths: string[]) {
    const folders = new Map<string, string[]>();
    folders.set(".", new Array());
    for (const f of fpaths) {
      let folderName = path.relative(this.folder, f);
      if (path.dirname(folderName) === ".") {
        folders.get(".").push(f);
        continue;
      }
      while (path.dirname(folderName) !== ".")
        folderName = path.dirname(folderName);
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

class TargetSourcesNode extends BaseDirectoryNode {
  constructor(private readonly allFiles: string[]) {
    super(vscode.workspace.rootPath, allFiles);
  }

  getTreeItem() {
    const item = super.getTreeItem();
    item.label = "Sources" + (this.allFiles.length === 0 ? " (no files)" : "");
    item.iconPath = extensionRelative("res/meson_64.svg");
    return item;
  }
}

class TargetGeneratedSourcesNode extends BaseDirectoryNode {
  constructor(files: string[]) {
    super(vscode.workspace.rootPath, files);
  }

  getTreeItem() {
    const item = super.getTreeItem();
    item.label = "Sources (generated)";
    item.iconPath = extensionRelative("res/meson_64.svg");
    return item;
  }
}

class DirectoryNode extends BaseDirectoryNode {
  constructor(folder: string, files: string[]) {
    super(folder, files);
  }

  getTreeItem() {
    const item = super.getTreeItem();
    item.label = path.basename(this.folder);
    item.resourceUri = vscode.Uri.file(this.folder);
    return item;
  }
}

class TargetSourceFileNode extends BaseNode {
  constructor(private readonly file: string) {
    super(file + randomString());
  }

  getTreeItem() {
    const item = super.getTreeItem();
    item.resourceUri = vscode.Uri.file(this.file);
    item.label = path.basename(this.file);
    item.command = {
      command: "vscode.open",
      title: "Open file",
      arguments: [vscode.Uri.file(this.file)]
    };
    return item;
  }
}
