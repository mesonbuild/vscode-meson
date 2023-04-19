import * as path from "path";
import * as vscode from "vscode";

import { BaseNode } from "../basenode";
import { Target, Targets } from "../../types";
import { TargetSourcesRootNode, TargetGeneratedSourcesRootNode } from "./sources";
import { extensionRelative, getTargetName } from "../../utils";
import { BaseDirectoryNode } from "./base";

export class TargetDirectoryNode extends BaseDirectoryNode<Target> {
  constructor(parentId, folder: string, targets: Targets) {
    super(`${parentId}-${path.basename(folder)}`, folder, targets);
  }

  getTreeItem() {
    const item = super.getTreeItem();

    if (this.folder === ".") {
      item.label = "Targets";
      item.iconPath = extensionRelative("res/meson_32.svg");
    } else {
      // With vscode-icons installed, this will do the right thing with expansion state.
      item.iconPath = vscode.ThemeIcon.Folder;
    }

    return item;
  }

  async getChildren() {
    return Array.from((await this.subfolders).entries())
      .map(([folder, targets]) => {
        if (folder === ".") {
          return targets.map(tgt => new TargetNode(this.id, tgt));
        } else {
          return new TargetDirectoryNode(this.id, folder, targets);
        }
      })
      .flat(1);
  }

  async buildFileTree(targets: Targets) {
    const folders = new Map<string, Targets>();
    folders.set(".", new Array());

    for (const target of targets) {
      let targetName = await getTargetName(target);
      if (target.subproject) {
        // Remove "subprojects/foo/" prefix. getTargetName() always return
        // posix path.
        let parts = targetName.split(path.posix.sep);
        parts.splice(0, 2);
        targetName = parts.join(path.posix.sep);
      }

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

export class TargetNode extends BaseNode {
  constructor(parentId: string, private readonly target: Target) {
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

      const sourceNode = new TargetSourcesRootNode(this.id, path.dirname(this.target.defined_in), sources);
      return (generated_sources.length === 0) ? [sourceNode] : [sourceNode, new TargetGeneratedSourcesRootNode(this.id, generated_sources)];
    }
  }

  async getTreeItem() {
    const item = super.getTreeItem() as vscode.TreeItem;

    item.label = this.target.name;
    item.tooltip = this.target.type;
    item.iconPath = extensionRelative(this.getIconPath());
    item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
    item.contextValue = "meson-target";

    const targetName = await getTargetName(this.target);

    item.command = {
      title: `Build ${this.target.name}`,
      command: "mesonbuild.build",
      arguments: [targetName]
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
        return "res/icon-shared-library.svg";

      case "static library":
      case "shared module":
        return "res/icon-library.svg";

      default:
        return "res/meson_32.svg";
    }
  }
}
