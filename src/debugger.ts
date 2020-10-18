import * as path from "path";

export type ExecutableTarget = {
  path: string;
  name: string;
};

export interface Configuration {
  type: string;
  name: string;
  request: string;
  program: string;
  MIMode: string;
  [key: string]: any;
}

export async function createDebugConfiguration(
  target: ExecutableTarget
): Promise<Configuration> {
  return {
    type: "cppdbg",
    name: `Debug ${target.name}`,
    request: "launch",
    program: target.path,
    cwd: path.dirname(target.path),
    MIMode: "gdb",
    args: [],
    setupCommands: [
      {
        description: "Enable pretty-printing for gdb",
        text: "-enable-pretty-printing",
        ignoreFailures: true,
      },
    ],
  };
}
