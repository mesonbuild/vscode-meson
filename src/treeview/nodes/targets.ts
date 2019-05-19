import * as path from "path";
import * as vscode from "vscode";

import { BaseNode } from "../basenode";
import { Target, Targets } from "../../meson/types";
import { TargetSourcesNode, TargetGeneratedSourcesNode } from "./sources";
import { extensionRelative, getTargetName } from "../../utils";
import { BaseDirectoryNode } from "./base";

export class TargetDirectoryNode extends BaseDirectoryNode<Target> {
  getTreeItem() {
    const item = super.getTreeItem();
    if (this.folder === ".") {
      item.label = "Targets";
      item.iconPath = extensionRelative("res/meson_32.svg");
    } else {
      item.iconPath =
        item.collapsibleState === vscode.TreeItemCollapsibleState.Expanded
          ? extensionRelative("res/icon-folder-open.svg")
          : extensionRelative("res/icon-folder.svg");
    }
    return item;
  }

  async getChildren() {
    return Array.from((await this.subfolders).entries())
      .map(([folder, targets]) => {
        if (folder === ".") return targets.map(tgt => new TargetNode(tgt));
        return new TargetDirectoryNode(folder, targets);
      })
      .flat(1);
  }

  async buildFileTree(targets: Targets) {
    const folders = new Map<string, Targets>();
    folders.set(".", new Array());
    for (const tgt of targets) {
      let folderName = path.relative(this.folder, await getTargetName(tgt));
      if (path.dirname(folderName) === ".") {
        folders.get(".").push(tgt);
        continue;
      }
      while (path.dirname(folderName) !== ".")
        folderName = path.dirname(folderName);
      const absFolder = path.join(this.folder, folderName);
      if (folders.has(absFolder)) {
        folders.get(absFolder).push(tgt);
      } else {
        folders.set(absFolder, [tgt]);
      }
    }
    return folders;
  }
}

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
        new TargetSourcesNode(path.dirname(this.target.defined_in), sources),
        generated_sources.length > 0
          ? new TargetGeneratedSourcesNode(generated_sources)
          : void 0
      ];
    }
  }
  async getTreeItem() {
    const item = super.getTreeItem() as vscode.TreeItem;
    item.iconPath = extensionRelative(this.getIconPath());
    item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
    item.label = await getTargetName(this.target);
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
