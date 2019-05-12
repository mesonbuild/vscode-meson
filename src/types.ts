import * as vscode from "vscode";

export interface ExtensionConfiguration {
  configureOnOpen: boolean;
  configureOptions: string[];
  buildDirectory: string;
}
