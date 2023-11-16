import * as path from "path";
import * as vscode from "vscode";
import { isThenable } from "../../utils";
import { BaseNode } from "../basenode";

type FolderMap<T> = Map<string, T[]>;

export abstract class BaseDirectoryNode<T> extends BaseNode {
  protected subfolders: Thenable<FolderMap<T>>;

  constructor(
    id: string,
    protected readonly folder: string,
    protected readonly filepaths: T[],
  ) {
    super(id);

    const subs = this.buildFileTree(filepaths);
    this.subfolders = isThenable(subs) ? subs : Promise.resolve(subs);
  }

  override getTreeItem() {
    const item = super.getTreeItem() as vscode.TreeItem;

    item.label = path.basename(this.folder);
    // item.resourceUri = vscode.Uri.file(this.folder);
    item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;

    return item;
  }

  abstract buildFileTree(fpaths: T[]): FolderMap<T> | Thenable<FolderMap<T>>;
}

// A node in the meson tree view that can be built.
export interface IBuildableNode {
  build(): Thenable<any>;
}

// A node in the meson tree view that can be run.
export interface IRunnableNode {
  run(): Thenable<any>;
}
