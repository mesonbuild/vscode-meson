import * as Admzip from "adm-zip";
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
} from "vscode-languageclient/node";
import * as storage from "../storage";
import { LanguageServer } from "../types";
import { serverToClass } from "./common";

export abstract class LanguageServerClient {
  private static readonly clientOptions: LanguageClientOptions = {
    documentSelector: ["meson", { scheme: "file", language: "meson" }],
  };
  private ls: LanguageClient | null = null;
  private readonly context: vscode.ExtensionContext;

  protected languageServerPath: vscode.Uri | null;
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
    context: vscode.ExtensionContext,
    referenceVersion: string,
  ) {
    this.server = server;
    this.languageServerPath = languageServerPath;
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

  static resolveLanguageServerPath(server: LanguageServer, context: vscode.ExtensionContext): vscode.Uri | null {
    const config = vscode.workspace.getConfiguration("mesonbuild");
    if (config["languageServerPath"] !== null && config["languageServerPath"] != "")
      return vscode.Uri.from({ scheme: "file", path: config["languageServerPath"] });

    const cached = LanguageServerClient.cachedLanguageServer(server, context);
    if (cached !== null) return cached;

    const binary = which.sync(server!, { nothrow: true });
    if (binary !== null) return vscode.Uri.from({ scheme: "file", path: binary });

    return null;
  }

  protected static supportsSystem(): boolean {
    return true;
  }

  protected static artifact(): { url: string; hash: string } | null {
    return null;
  }

  dispose() {
    if (this.ls !== null) {
      this.ls.stop();
      this.ls = null;
    }
  }

  restart(): void {
    this.dispose();
    this.languageServerPath = LanguageServerClient.resolveLanguageServerPath(this.server, this.context);
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
    options.initializationOptions = vscode.workspace.getConfiguration(`mesonbuild.${this.server}`);
    this.ls = new LanguageClient(
      this.server!,
      `Meson Language Server (${this.server})`,
      serverOptions,
      LanguageServerClient.clientOptions,
      true,
    );
    this.ls.start();
  }

  async reloadConfig(): Promise<void> {
    const config = vscode.workspace.getConfiguration(`mesonbuild.${this.server}`);
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
    await serverToClass(this.server).download(this.server, "2.4.4", context);
    this.restart();
  }
}
