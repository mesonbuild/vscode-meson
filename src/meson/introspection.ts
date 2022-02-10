import * as path from "path";
import { exec, parseJSONFileIfExists } from "../utils";
import {
  Targets,
  Dependencies,
  BuildOptions,
  Tests,
  TestLog,
  TestLogs,
  ProjectInfo
} from "./types";
import * as fs from "fs";

async function introspectMeson<T>(buildDir: string, filename: string, introspectSwitch: string) {
  const parsed = await parseJSONFileIfExists<T>(
    path.join(buildDir, path.join("meson-info", filename))
  );

  if (parsed) {
    return parsed;
  }

  const { stdout } = await exec("meson", ["introspect", introspectSwitch], {
    cwd: buildDir
  });

  return JSON.parse(stdout) as T;
}

export async function getMesonTargets(buildDir: string) {
  const parsed = await introspectMeson<Targets>(buildDir, "intro-targets.json", "--targets");

  if (getMesonVersion()[1] < 50) {
    return parsed.map(t => {
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
  return introspectMeson<ProjectInfo>(buildDir, "intro-projectinfo.json", "--project-info");
}

export async function getMesonDependencies(buildDir: string) {
  return introspectMeson<Dependencies>(buildDir, "intro-dependencies.json", "--dependencies");
}

export async function getMesonTests(buildDir: string) {
  return introspectMeson<Tests>(buildDir, "intro-tests.json", "--tests");
}

export async function getMesonTestLogs(buildDir: string) : Promise<TestLogs> {
  let filename = path.join(buildDir, path.join("meson-logs", "testlog.json"));

  try {
    const data = await fs.promises.readFile(filename);
    return data.toString().split("\n").filter(x => x).map(v => JSON.parse(v) as TestLog)
  }
  catch (err) {
    console.log(err);
    return [];
  }
}

export async function getMesonBenchmarks(buildDir: string) {
  return introspectMeson<Tests>(buildDir, "intro-benchmarks.json", "--benchmarks");
}

export async function getMesonVersion(): Promise<[number, number, number]> {
  const MESON_VERSION_REGEX = /^(\d+)\.(\d+)\.(\d+)/g;

  const { stdout } = await exec("meson", ["--version"]);
  const match = stdout.trim().match(MESON_VERSION_REGEX);
  if (match) {
    return match.slice(1, 3).map(s => Number.parseInt(s)) as [
      number,
      number,
      number
    ];
  } else
    throw new Error(
      "Meson version doesn't match expected output: " + stdout.trim()
    );
}
