import * as vscode from "vscode";
import { extensionConfiguration, getOutputChannel } from "./utils";
import { ToolCheckFunc, Tool, type FormattingProvider } from "./types";
import * as muon from "./tools/muon";
import * as meson from "./tools/meson";

type FormatterFunc = (tool: Tool, root: string, document: vscode.TextDocument) => Promise<vscode.TextEdit[]>;

type FormatterDefinition = {
  format: FormatterFunc;
  check: ToolCheckFunc;
  priority: number;
};

//NOTE: the highest priority number means it is tested first, the lowest is tested last
const formatters: Record<FormattingProvider, FormatterDefinition> = {
  muon: {
    format: muon.format,
    check: muon.check,
    priority: 0,
  },
  meson: {
    format: meson.format,
    check: meson.check,
    priority: 1,
  },
};

type FormatterError = { provider: FormattingProvider; error: string };

type BestTool = {
  provider: FormattingProvider;
  tool: Tool;
};

type BestFormatterResult = BestTool | FormatterError[];

async function getBestAvailableFormatter(provider: FormattingProvider | "auto"): Promise<BestFormatterResult> {
  if (provider !== "auto") {
    const props = formatters[provider];

    const checkResult = await props.check();
    if (checkResult.isError()) {
      return [{ provider, error: checkResult.error }];
    }

    return { provider, tool: checkResult.tool };
  }

  // sort the available providers by priority
  const providerPriority: FormattingProvider[] = (Object.keys(formatters) as FormattingProvider[]).sort(
    (provider1: FormattingProvider, provider2: FormattingProvider) => {
      return formatters[provider2].priority - formatters[provider1].priority;
    },
  );

  const errors: FormatterError[] = [];

  for (const providerName of providerPriority) {
    const props = formatters[providerName];

    const checkResult = await props.check();
    if (checkResult.isError()) {
      errors.push({ provider: providerName, error: checkResult.error });
      continue;
    }

    return { provider: providerName, tool: checkResult.tool };
  }

  return errors;
}

function isFormaterErrors(input: BestFormatterResult): input is FormatterError[] {
  return Array.isArray(input);
}

async function reloadFormatters(sourceRoot: string, context: vscode.ExtensionContext): Promise<vscode.Disposable[]> {
  let disposables: vscode.Disposable[] = [];

  if (!extensionConfiguration("formatting").enabled) {
    return disposables;
  }

  const providerName = extensionConfiguration("formatting").provider;

  const bestFormatter = await getBestAvailableFormatter(providerName);

  if (isFormaterErrors(bestFormatter)) {
    getOutputChannel().appendLine(`Failed to find an available formatter: The user preference was '${providerName}'`);
    for (const { provider, error } of bestFormatter) {
      getOutputChannel().appendLine(`Failed to enable formatter ${provider}: ${error}`);
    }
    getOutputChannel().show(true);
    return disposables;
  }

  const { tool, provider } = bestFormatter;

  getOutputChannel().appendLine(
    `The best formatter was determined to be ${provider}: The user preference was '${providerName}'`,
  );

  const props = formatters[provider];

  const sub = vscode.languages.registerDocumentFormattingEditProvider("meson", {
    async provideDocumentFormattingEdits(document: vscode.TextDocument): Promise<vscode.TextEdit[]> {
      return await props.format(tool, sourceRoot, document);
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
