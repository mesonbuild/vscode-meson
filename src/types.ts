import * as vscode from "vscode";

export interface ExtensionConfiguration {
  configureOnOpen: boolean | "ask";
  configureOptions: string[];
  buildFolder: string;
  mesonPath: string;
}
