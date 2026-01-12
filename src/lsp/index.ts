import Admzip from "adm-zip";
import * as which from "which";
import * as https from "https";
import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import {
  DidChangeConfigurationNotification,
  DidChangeConfigurationParams,
  Executable,
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient/node.js";
import * as storage from "../storage.js";
import { ExtensionConfiguration, LanguageServer } from "../types.js";
import { serverToClass } from "./common.js";
import { extensionConfiguration, resolveCommandAndArgs } from "../utils.js";

export abstract class LanguageServerClient {
  private static readonly clientOptions: LanguageClientOptions = {
    documentSelector: ["meson", { scheme: "file", language: "meson" }],
  };
  private ls: LanguageClient | null = null;
  private readonly context: vscode.ExtensionContext;

  protected languageServerPath: vscode.Uri | null;
  protected extraArgs: string[];
  protected referenceVersion: string;
  readonly server: LanguageServer;

  static readonly repoURL: string;
  static readonly setupURL: string;
  static readonly version: string;

  protected abstract get debugExe(): Executable;
  protected abstract get runExe(): Executable;

  protected constructor(
    server: LanguageServer,
    languageServerPath: vscode.Uri,
    extraArgs: string[],
    context: vscode.ExtensionContext,
    referenceVersion: string,
  ) {
    this.server = server;
    this.languageServerPath = languageServerPath;
    this.extraArgs = extraArgs;
    this.context = context;
    this.referenceVersion = referenceVersion;
  }

  private static cachedLanguageServer(server: LanguageServer, context: vscode.ExtensionContext): vscode.Uri | null {
    const uri = vscode.Uri.joinPath(
      storage.uri(storage.Location.LSP, context),
      `${server}${os.platform() === "win32" ? ".exe" : ""}`,
    );

    return fs.existsSync(uri.fsPath) ? uri : null;
  }

  private static async computeFileHash(filePath: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const hash = crypto.createHash("sha256");
      const stream = fs.createReadStream(filePath);

      stream.on("error", reject);

      stream.on("data", (data) => {
        hash.update(data);
      });

      stream.on("end", () => {
        resolve(hash.digest("hex"));
      });
    });
  }

  private static async fetch(url: string, dest: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(dest);
      const request = https.get(url, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301 || response.statusCode === 302) {
          LanguageServerClient.fetch(response.headers.location!, dest).then(resolve).catch(reject);
        } else {
          response.pipe(file);

          file.on("finish", () => {
            file.close((_) => {
              resolve();
            });
          });

          file.on("error", (err) => {
            vscode.window.showErrorMessage(`Error writing to file: ${err}`);
            reject(err);
          });
        }
      });

      request.on("error", (err) => {
        vscode.window.showErrorMessage(`Request error: ${err}`);
        reject(err);
      });
    });
  }

  static async download(
    server: LanguageServer,
    version: string,
    context: vscode.ExtensionContext,
  ): Promise<vscode.Uri | null> {
    const lspDir = storage.uri(storage.Location.LSP, context).fsPath;
    const artifact = this.artifact();
    if (artifact === null) return null;

    fs.rmSync(lspDir, { recursive: true, force: true });
    fs.mkdirSync(lspDir, { recursive: true });

    let uri: vscode.Uri | null = null;
    const tmpPath = path.join(os.tmpdir(), `vscode-meson-${server}-${Date.now()}.zip`);

    try {
      await LanguageServerClient.fetch(artifact.url, tmpPath);
      let hash = await this.computeFileHash(tmpPath);
      if (hash !== artifact.hash) {
        vscode.window.showErrorMessage(`Invalid hash: Expected ${artifact.hash}, got ${hash}.`);
        fs.unlinkSync(tmpPath);
        return null;
      }

      const zip = new Admzip(tmpPath);
      zip.extractAllTo(lspDir);
      const binary = path.join(lspDir, server!);
      if (os.platform() != "win32") fs.chmodSync(binary, 0o755);
      const versionFile = path.join(lspDir, "version");
      fs.writeFileSync(versionFile, version);

      vscode.window.showInformationMessage("Language server was downloaded.");
      uri = vscode.Uri.from({ scheme: "file", path: binary });
      fs.unlinkSync(tmpPath);
      return uri;
    } catch (err) {
      vscode.window.showErrorMessage(JSON.stringify(err));
      fs.unlinkSync(tmpPath);
    }
    return uri;
  }

  static resolveLanguageServerPath(
    server: LanguageServer,
    context: vscode.ExtensionContext,
  ): [vscode.Uri | null, string[]] {
    const [configLanguageServerPath, args] = resolveCommandAndArgs(extensionConfiguration("languageServerPath"));
    if (configLanguageServerPath !== null && configLanguageServerPath !== "") {
      if (!path.isAbsolute(configLanguageServerPath)) {
        const binary = which.sync(configLanguageServerPath, { nothrow: true });
        if (binary !== null) return [vscode.Uri.from({ scheme: "file", path: binary }), args];
      }
      return [vscode.Uri.from({ scheme: "file", path: configLanguageServerPath }), args];
    }

    const cached = LanguageServerClient.cachedLanguageServer(server, context);
    if (cached !== null) return [cached, args];

    const binary = which.sync(server!, { nothrow: true });
    if (binary !== null) return [vscode.Uri.from({ scheme: "file", path: binary }), args];

    return [null, args];
  }

  protected static supportsSystem(): boolean {
    return true;
  }

  protected static artifact(): { url: string; hash: string } | null {
    return null;
  }

  async dispose(): Promise<void> {
    if (this.ls !== null) {
      await this.ls.stop();
      this.ls = null;
    }
  }

  async restart(): Promise<void> {
    await this.dispose();
    [this.languageServerPath, this.extraArgs] = LanguageServerClient.resolveLanguageServerPath(
      this.server,
      this.context,
    );
    if (this.languageServerPath === null) {
      vscode.window.showErrorMessage(
        "Failed to restart the language server because a binary was not found and could not be downloaded",
      );
    } else {
      this.start();
    }
  }

  start(): void {
    const serverOptions: ServerOptions = {
      run: this.runExe,
      debug: this.debugExe,
      transport: TransportKind.stdio,
    };
    const options = LanguageServerClient.clientOptions;
    options.initializationOptions = extensionConfiguration(`mesonbuild.${this.server}` as keyof ExtensionConfiguration);
    this.ls = new LanguageClient(
      "mesonbuild",
      `Meson Language Server (${this.server})`,
      serverOptions,
      LanguageServerClient.clientOptions,
      true,
    );
    this.ls.start();
  }

  async reloadConfig(): Promise<void> {
    const config = extensionConfiguration(`mesonbuild.${this.server}` as keyof ExtensionConfiguration);
    const params: DidChangeConfigurationParams = {
      settings: config,
    };
    await this.ls!.sendNotification(DidChangeConfigurationNotification.type, params);
  }

  async update(context: vscode.ExtensionContext): Promise<void> {
    const lspDir = storage.uri(storage.Location.LSP, context).fsPath;
    const versionFile = path.join(lspDir, "version");
    if (!fs.existsSync(versionFile)) return; // Either we use binaries from PATH or something is broken.

    const currentVersion = fs.readFileSync(versionFile, { encoding: "utf-8" });
    if (currentVersion == this.referenceVersion) return;

    vscode.window.showInformationMessage(`Updating language server to ${this.referenceVersion}`);
    this.dispose();
    await serverToClass(this.server).download(this.server, this.referenceVersion, context);
    await this.restart();
  }
}
