import * as vscode from "vscode";
import { extensionConfiguration, getOutputChannel } from "./utils";
import { ToolCheckFunc, Tool, type FormattingProvider } from "./types";
import * as muon from "./tools/muon";
import * as meson from "./tools/meson";

type FormatterFunc = (tool: Tool, root: string, document: vscode.TextDocument) => Promise<vscode.TextEdit[]>;

type FormatterDefinition = {
  format: FormatterFunc;
  check: ToolCheckFunc;
};

const formatters: Record<FormattingProvider, FormatterDefinition> = {
  muon: {
    format: muon.format,
    check: muon.check,
  },
  meson: {
    format: meson.format,
    check: meson.check,
  },
};

async function reloadFormatters(sourceRoot: string, context: vscode.ExtensionContext): Promise<vscode.Disposable[]> {
  let disposables: vscode.Disposable[] = [];

  if (!extensionConfiguration("formatting").enabled) {
    return disposables;
  }

  const name = extensionConfiguration("formatting").provider;
  const props = formatters[name];

  const checkResult = await props.check();
  if (checkResult.isError()) {
    getOutputChannel().appendLine(`Failed to enable formatter ${name}: ${checkResult.error}`);
    getOutputChannel().show(true);
    return disposables;
  }

  const sub = vscode.languages.registerDocumentFormattingEditProvider("meson", {
    async provideDocumentFormattingEdits(document: vscode.TextDocument): Promise<vscode.TextEdit[]> {
      return await props.format(checkResult.tool, sourceRoot, document);
    },
  });

  context.subscriptions.push(sub);
  disposables.push(sub);

  return disposables;
}

export async function activateFormatters(sourceRoot: string, context: vscode.ExtensionContext) {
  let subscriptions: vscode.Disposable[] = await reloadFormatters(sourceRoot, context);

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async () => {
      for (let handler of subscriptions) {
        handler.dispose();
      }

      subscriptions = await reloadFormatters(sourceRoot, context);
    }),
  );
}
