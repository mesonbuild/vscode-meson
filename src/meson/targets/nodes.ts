import * as vscode from "vscode";
import { Target, TargetSource } from "../types";
import { extensionRelative } from "../../utils";
import { BaseNode } from "../basenode";

export class TargetNode extends BaseNode {
  constructor(private readonly target: Target) {
    super(target.id);
  }

  getChildren() {
    if (!this.target.target_sources) return [];
    else {
      return this.target.target_sources.map(s => new TargetSourceNode(s));
    }
  }
  getTreeItem() {
    const item = super.getTreeItem();
    item.iconPath = extensionRelative(this.getIconPath());
    item.label = this.target.name;
    item.command = {
      title: `Build ${this.target.name}`,
      command: "mesonbuild.build",
      arguments: [this.target.name]
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

export class TargetSourceNode extends BaseNode {
  constructor(private readonly source: TargetSource) {
    super(source.generated_sources.join(";"));
  }

  getChildren() {
    if (!this.source.sources) return [];
    else this.source.sources.map(s => new TargetSourceSourceNode(s));
  }

  getTreeItem() {
    const item = super.getTreeItem();
    item.label = `${this.source.language} sources (${this.source.compiler})`;
    item.iconPath = "res/meson-symbolic.svg";
    return item;
  }
}

export class TargetSourceSourceNode extends BaseNode {
  constructor(private readonly source: string) {
    super(source);
  }

  getChildren() {
    return [];
  }
  getTreeItem() {
    const item = super.getTreeItem();
    item.resourceUri = vscode.Uri.file(this.source);
    item.contextValue = "nodeType=file";
    item.command = {
      title: "Open file",
      command: "vscode.open",
      arguments: [item.resourceUri]
    };
    return item;
  }
}
