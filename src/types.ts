import * as vscode from "vscode";

export type Tool = { path: string, version: [number, number, number] }
export type ToolCheckFunc = () => Promise<{ tool: Tool, error: string }>

export type LinterConfiguration = {
  enabled: boolean,
}

export interface ExtensionConfiguration {
  configureOnOpen: boolean | "ask";
  configureOptions: string[];
  setupOptions: string[];
  buildFolder: string;
  mesonPath: string;
  muonPath: string;
  linting: { enabled: boolean };
  linter: {
    muon: LinterConfiguration
  };
  formatting: {
    enabled: boolean,
    provider: "muon",
    muonConfig: string | null,
  };
  debugOptions: object;
}
