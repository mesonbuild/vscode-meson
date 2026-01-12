import * as vscode from "vscode";
import { LanguageServerClient } from "./index.js";
import { LanguageServer, SettingsKey } from "../types.js";
import { MesonLSPLanguageClient } from "./mesonlsp.js";
import { MuonLanguageClient } from "./muon.js";
import { Uri } from "vscode";
import { extensionConfiguration } from "../utils.js";

export function serverToClass(server: LanguageServer): any {
  switch (server) {
    case "Swift-MesonLSP":
    case "mesonlsp":
      return MesonLSPLanguageClient;
    case "muon":
      return MuonLanguageClient;
    default:
      return null;
  }
}

export async function createLanguageServerClient(
  download: boolean,
  context: vscode.ExtensionContext,
): Promise<LanguageServerClient | null> {
  const server = extensionConfiguration(SettingsKey.languageServer);

  const klass = serverToClass(server);
  if (klass == null) {
    return null;
  }
  if (!klass.supportsSystem()) {
    vscode.window.showErrorMessage("The configured language server does not support the current system.");
    return null;
  }

  let [languageServerPath, args] = LanguageServerClient.resolveLanguageServerPath(server, context);
  if (languageServerPath === null) {
    if (klass.artifact() == null) {
      enum Options {
        open = "Open documentation in browser",
      }
      const response = await vscode.window.showErrorMessage(
        "This language server supports your systen, but provides no artifacts for automatic setup",
        ...Object.values(Options),
      );
      if (response == Options.open) {
        vscode.env.openExternal(Uri.parse(klass.setupURL));
      }
      return null;
    }
    if (download) {
      languageServerPath = await klass.download(server, klass.version, context);
      if (languageServerPath === null) {
        vscode.window.showErrorMessage("Failed to download the language server.");
        return null;
      }
    } else {
      vscode.window.showErrorMessage("Failed to find a language server on the system.");
      return null;
    }
  }

  return new klass(languageServerPath, args, context, klass.version);
}
