import * as vscode from "vscode";
import type { Version } from "./version";

type Dict<T> = { [x: string]: T };

export type Tool = { path: string; version: Version };

export type ToolCheckSuccessResult = {
  tool: Tool;
  error?: undefined;
};
export type ToolCheckErrorResult = {
  tool?: undefined;
  error: string;
};

type ResultImpl = ToolCheckSuccessResult | ToolCheckErrorResult;

export class ToolCheckResult {
  private readonly result: ResultImpl;

  private constructor(result: ResultImpl) {
    this.result = result;
  }

  static newError(error: string) {
    return new ToolCheckResult({ error });
  }

  static newTool(tool: Tool) {
    return new ToolCheckResult({ tool });
  }

  private hasErrorImpl(result: ResultImpl): result is ToolCheckErrorResult {
    return !!result.error;
  }

  isError(): boolean {
    return this.hasErrorImpl(this.result);
  }

  get error(): string {
    if (!this.hasErrorImpl(this.result)) {
      throw new Error("Wrong invocation of getter for 'error', check the state first");
    }
    return this.result.error;
  }

  get tool(): Tool {
    if (this.hasErrorImpl(this.result)) {
      throw new Error("Wrong invocation of getter for 'tool', check the state first");
    }
    return this.result.tool;
  }
}

export type ToolCheckFunc = () => Promise<ToolCheckResult>;

export type LinterConfiguration = {
  enabled: boolean;
};

export type LanguageServer = "Swift-MesonLSP" | "mesonlsp" | null;
export type ModifiableExtension = "ms-vscode.cpptools" | "rust-lang.rust-analyzer";

export type FormattingProvider = "muon" | "meson";

export interface ExtensionConfiguration {
  configureOnOpen: boolean | "ask";
  configureOptions: string[];
  configureEnvironment: { [key: string]: string };
  setupOptions: string[];
  testOptions: string[];
  testEnvironment: { [key: string]: string };
  benchmarkOptions: string[];
  buildFolder: string;
  mesonPath: string;
  muonPath: string;
  linting: { enabled: boolean };
  linter: {
    muon: LinterConfiguration;
  };
  formatting: {
    enabled: boolean;
    provider: FormattingProvider;
    muonConfig: string | null;
    mesonConfig: string | null;
  };
  debugOptions: object;
  languageServer: LanguageServer;
  languageServerPath: string;
  downloadLanguageServer: boolean | "ask";
  selectRootDir: boolean;
  modifySettings: boolean | ModifiableExtension[];
}

export interface TaskQuickPickItem extends vscode.QuickPickItem {
  task: vscode.Task;
}

export type LanguageID = string;

export type TargetType =
  | "executable"
  | "static library"
  | "shared library"
  | "shared module"
  | "custom"
  | "run"
  | "jar";

export type OptionType = "string" | "boolean" | "combo" | "integer" | "array";

export interface OptionTypeMap {
  string: string;
  boolean: boolean;
  combo: string[];
  integer: number;
  array: string[];
}

export type SectionType = "core" | "backend" | "base" | "compiler" | "directory" | "user" | "test";

export interface TargetSource {
  language: LanguageID;
  compiler: string[];
  parameters: string[];
  sources: string[] | null;
  generated_sources: string[] | null;
}

export interface Target {
  name: string;
  id: string;
  type: TargetType;
  defined_in: string;
  subproject: string | null;
  filename: string[];
  build_by_default: boolean;
  target_sources?: TargetSource[];
  installed: boolean;
  install_filename?: string;
}

export interface Subproject {
  name: string;
  version: string;
  descriptive_name: string;
}

export interface ProjectInfo {
  version: string;
  descriptive_name: string;
  subproject_dir: "subprojects";
  subprojects: Subproject[];
}

export interface BuildOption<T extends OptionType> {
  name: string;
  desciption: string;
  type: T;
  value: OptionTypeMap[T];
  machine: OptionTypeMap[T];
}

export interface Dependency {
  name: string;
  required: boolean;
  compile_args: string[];
  conditional: boolean;
  has_fallback: boolean;
}

export interface CompilerDesc {
  id: string;
  exelist: string[];
}

export type Compiler = Record<string, CompilerDesc>;

export interface Test {
  name: string;
  workdir: string | null;
  timeout: string;
  suite: string[];
  is_parallel: boolean;
  cmd: string[];
  env: Dict<string>;
  depends: string[];
}

interface StdDebugEnvironmentConfiguration {
  env: { [key: string]: string };
}
interface CppDebugEnvironmentConfiguration {
  environment: { name: string; value: string }[];
}
export type DebugEnvironmentConfiguration = StdDebugEnvironmentConfiguration | CppDebugEnvironmentConfiguration;

export type Targets = Target[];
export type BuildOptions = BuildOption<any>[];
export type Dependencies = Dependency[];
export type Compilers = Record<string, Compiler>;
export type Tests = Test[];

export enum SettingsKey {
  downloadLanguageServer = "downloadLanguageServer",
  languageServer = "languageServer",
  configureOnOpen = "configureOnOpen",
  selectRootDir = "selectRootDir",
  modifySettings = "modifySettings",
}
