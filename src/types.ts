import * as vscode from "vscode";

export interface ExtensionConfiguration {
  configureOnOpen: string | boolean;
  configureOptions: string[];
  buildFolder: string;
}
