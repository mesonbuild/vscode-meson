import * as vscode from "vscode";
import * as path from "path";
import { extensionConfiguration, extensionConfigurationSet } from "./utils";
import { SettingsKey } from "./types";

export async function askConfigureOnOpen(): Promise<boolean> {
  const configureOnOpen = extensionConfiguration(SettingsKey.configureOnOpen);

  if (typeof configureOnOpen === "boolean") return configureOnOpen;

  enum Options {
    yes = "Yes",
    always = "Always",
    no = "No",
    never = "Never",
  }

  const response = await vscode.window.showInformationMessage(
    "Meson project detected in this workspace but does not seems to be configured. Would you like VS Code to configure it?",
    ...Object.values(Options),
  );

  switch (response) {
    case Options.no:
      return false;
    case Options.never:
      extensionConfigurationSet(SettingsKey.configureOnOpen, false, vscode.ConfigurationTarget.Workspace);
      return false;
    case Options.yes:
      return true;
    case Options.always:
      extensionConfigurationSet(SettingsKey.configureOnOpen, true, vscode.ConfigurationTarget.Workspace);
      return true;
  }

  return false;
}

export async function askShouldDownloadLanguageServer(): Promise<boolean> {
  const downloadLanguageServer = extensionConfiguration(SettingsKey.downloadLanguageServer);

  if (typeof downloadLanguageServer === "boolean") return downloadLanguageServer;

  enum Options {
    yes = "Yes",
    no = "Not this time",
    never = "Never",
  }

  const response = await vscode.window.showInformationMessage(
    "Should the extension try to download the language server?",
    ...Object.values(Options),
  );

  switch (response) {
    case Options.yes:
      extensionConfigurationSet(SettingsKey.downloadLanguageServer, true, vscode.ConfigurationTarget.Global);
      return true;
    case Options.never:
      extensionConfigurationSet(SettingsKey.downloadLanguageServer, false, vscode.ConfigurationTarget.Global);
      return false;
    case Options.no:
      return false;
  }

  return false;
}

export async function askSelectRootDir(): Promise<boolean> {
  const selectRootDir = extensionConfiguration(SettingsKey.selectRootDir);

  if (!selectRootDir) return false;

  enum Options {
    yes = "Yes",
    no = "No",
    never = "Never",
  }

  const response = await vscode.window.showInformationMessage(
    "Multiple Meson projects detected, select one?",
    ...Object.values(Options),
  );

  switch (response) {
    case Options.yes:
      return true;
    case Options.no:
      return false;
    case Options.never:
      extensionConfigurationSet(SettingsKey.selectRootDir, false, vscode.ConfigurationTarget.Workspace);
      return false;
  }

  return false;
}

export async function selectRootDir(rootDirs: string[]): Promise<string | undefined> {
  // TODO: What label to use when there is more than one workspace?
  const root = vscode.workspace.rootPath ?? "";
  const items = rootDirs.map((file, index) => ({ index: index, label: path.relative(root, file) }));
  items.sort((a, b) => {
    const aComponents = a.label.split(path.sep).length;
    const bComponents = b.label.split(path.sep).length;
    if (aComponents == bComponents) return a.label.localeCompare(b.label);
    return aComponents - bComponents;
  });
  const selection = await vscode.window.showQuickPick(items, {
    canPickMany: false,
    title: "Select configuration to use.",
    placeHolder: "path/to/meson.build",
  });
  if (selection) return rootDirs[selection.index];
  return undefined;
}

export async function askAndSelectRootDir(rootDirs: string[]): Promise<string | undefined> {
  if (await askSelectRootDir()) return selectRootDir(rootDirs);
  return undefined;
}
