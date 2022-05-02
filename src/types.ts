import * as vscode from "vscode";

export type ToolCheckFunc = () => Promise<string>

export type LinterConfiguration = {
  enabled: boolean,
}

export interface ExtensionConfiguration {
  configureOnOpen: boolean | "ask";
  configureOptions: string[];
  buildFolder: string;
  mesonPath: string;
  muonPath: string;
  linting: { enabled: boolean };
  linter: {
    muon: LinterConfiguration
  };
}
