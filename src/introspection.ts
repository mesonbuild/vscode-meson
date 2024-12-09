import * as path from "path";
import { exec, extensionConfiguration, parseJSONFileIfExists, getOutputChannel } from "./utils";
import { Targets, Dependencies, BuildOptions, Tests, ProjectInfo, Compilers } from "./types";

export function getIntrospectionFile(buildDir: string, filename: string) {
  return path.join(buildDir, path.join("meson-info", filename));
}

async function introspectMeson<T>(buildDir: string, filename: string, introspectSwitch: string) {
  getOutputChannel().appendLine(`Read introspection file ${filename}`);
  const parsed = await parseJSONFileIfExists<T>(getIntrospectionFile(buildDir, filename));
  if (parsed) {
    return parsed;
  }

  const { stdout } = await exec(extensionConfiguration("mesonPath"), ["introspect", introspectSwitch], undefined, {
    cwd: buildDir,
  });

  return JSON.parse(stdout) as T;
}

export async function getMesonTargets(buildDir: string) {
  const parsed = await introspectMeson<Targets>(buildDir, "intro-targets.json", "--targets");

  if ((await getMesonVersion())[1] < 50) {
    return parsed.map((t) => {
      if (typeof t.filename === "string") t.filename = [t.filename]; // Old versions would directly pass a string with only 1 filename on the target
      return t;
    });
  }
  return parsed;
}

export async function getMesonBuildOptions(buildDir: string) {
  return introspectMeson<BuildOptions>(buildDir, "intro-buildoptions.json", "--buildoptions");
}

export async function getMesonProjectInfo(buildDir: string) {
  return introspectMeson<ProjectInfo>(buildDir, "intro-projectinfo.json", "--projectinfo");
}

export async function getMesonDependencies(buildDir: string) {
  return introspectMeson<Dependencies>(buildDir, "intro-dependencies.json", "--dependencies");
}

export async function getMesonCompilers(buildDir: string) {
  return introspectMeson<Compilers>(buildDir, "intro-compilers.json", "--compilers");
}

export async function getMesonTests(buildDir: string) {
  return introspectMeson<Tests>(buildDir, "intro-tests.json", "--tests");
}

export async function getMesonBenchmarks(buildDir: string) {
  return introspectMeson<Tests>(buildDir, "intro-benchmarks.json", "--benchmarks");
}

export async function getMesonVersion(): Promise<[number, number, number]> {
  const MESON_VERSION_REGEX = /^(\d+)\.(\d+)\.(\d+)/;

  const { stdout } = await exec(extensionConfiguration("mesonPath"), ["--version"]);
  const match = stdout.trim().match(MESON_VERSION_REGEX);
  if (match && match.length >= 4) {
    return match.slice(1, 4).map((s) => Number.parseInt(s)) as [number, number, number];
  } else throw new Error("Meson version doesn't match expected output: " + stdout.trim());
}
