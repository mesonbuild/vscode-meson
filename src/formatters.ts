import * as vscode from 'vscode';
import * as fs from 'fs';
import {
  extensionConfiguration,
  getOutputChannel
} from './utils';
import {
  ToolCheckFunc,
  Tool
} from './types'
import * as muon from "./tools/muon";

type FormatterFunc = (
  tool: Tool,
  document: vscode.TextDocument
) => Promise<vscode.TextEdit[]>

type FormatterDefinition = {
  format: FormatterFunc,
  check: ToolCheckFunc,
}

const formatters: Record<string, FormatterDefinition> = {
  muon: {
    format: muon.format,
    check: muon.check,
  }
}

async function reloadFormatters(context: vscode.ExtensionContext): Promise<vscode.Disposable[]> {
  let disposables = [];

  if (!extensionConfiguration("formatting").enabled) {
    return disposables;
  }

  const name = extensionConfiguration("formatting").provider;
  const props = formatters[name];

  const { tool, error } = await props.check();
  if (error) {
    getOutputChannel().appendLine(`Failed to enable formatter ${name}: ${error}`)
    getOutputChannel().show(true);
    return disposables;
  }

  const sub = vscode.languages.registerDocumentFormattingEditProvider('meson', {
    async provideDocumentFormattingEdits(document: vscode.TextDocument): Promise<vscode.TextEdit[]> {
      return await props.format(tool, document);
    }
  })

  context.subscriptions.push(sub);
  disposables.push(sub);

  return disposables;
}

export async function activateFormatters(context: vscode.ExtensionContext) {
  let subscriptions: vscode.Disposable[] = await reloadFormatters(context);

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async () => {
      for (let handler of subscriptions) {
        handler.dispose();
      }

      subscriptions = await reloadFormatters(context);
    })
  );
}
