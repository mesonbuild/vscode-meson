import * as vscode from "vscode";

import { hash } from "../../utils";

export abstract class BaseNode {
  constructor(protected readonly id: string) { }

  getChildren(): vscode.ProviderResult<BaseNode[]> {
    return [];
  }

  getTreeItem(): vscode.ProviderResult<vscode.TreeItem> {
    // All derived getTreeItem()s set an appropriate label.
    const item = new vscode.TreeItem("");

    item.id = hash(this.id);

    return item;
  }
}

// A node in the meson tree view that can be built.
export interface IBuildableNode {
  build(): Promise<any>;

  getName(): string;
}

// A node in the meson tree view that can be debugged.
export interface IDebuggableNode {
  debug(): Promise<any>;
}

// A node in the meson tree view that can be run.
export interface IRunnableNode {
  run(): Thenable<any>;
}
