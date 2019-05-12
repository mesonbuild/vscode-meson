import * as path from "path";
import { exec, parseJSONFileIfExists } from "../utils";
import {
  Targets,
  Dependencies,
  BuildOptions,
  Test,
  Tests,
  ProjectInfo
} from "./types";

const MESON_VERSION_REGEX = /^(\d+)\.(\d+)\.(\d+)/g;

export async function getMesonTargets(build: string) {
  let parsed = await parseJSONFileIfExists<Targets>(
    path.join(build, "meson-info/intro-targets.json")
  );
  if (!parsed) {
    const { stdout } = await exec("meson introspect --targets", {
      cwd: build
    });
    parsed = JSON.parse(stdout) as Targets;
  }

  if (getMesonVersion()[1] < 50) {
    return parsed.map(t => {
      if (typeof t.filename === "string") t.filename = [t.filename]; // Old versions would directly pass a string with only 1 filename on the target
      return t;
    });
  }
  return parsed;
}
export async function getMesonBuildOptions(build: string) {
  const parsed = await parseJSONFileIfExists<BuildOptions>(
    path.join(build, "meson-info/intro-buildoptions.json")
  );
  if (parsed) return parsed;

  const { stdout } = await exec("meson introspect --buildoptions", {
    cwd: build
  });
  return JSON.parse(stdout) as BuildOptions;
}

export async function getMesonProjectInfo(build: string) {
  const parsed = await parseJSONFileIfExists<ProjectInfo>(
    path.join(build, "meson-info/intro-projectinfo.json")
  );
  if (parsed) return parsed;
  const { stdout } = await exec("meson introspect --project-info", {
    cwd: build
  });
  return JSON.parse(stdout) as ProjectInfo;
}

export async function getMesonDependencies(build: string) {
  const parsed = parseJSONFileIfExists<Dependencies>(
    path.join(build, "meson-info/intro-dependencies.json")
  );
  if (parsed) return parsed;

  const { stdout } = await exec("meson introspect --dependencies", {
    cwd: build
  });
  return JSON.parse(stdout) as Dependencies;
}
export async function getMesonTests(build: string) {
  const parsed = await parseJSONFileIfExists<Tests>(
    path.join(build, "meson-info/intro-tests.json")
  );
  if (parsed) return parsed;
  const { stdout } = await exec("meson introspect --tests", { cwd: build });
  return JSON.parse(stdout) as Tests;
}
export async function getMesonBenchmarks(build: string) {
  const parsed = await parseJSONFileIfExists<Tests>(
    path.join(build, "meson-info/intro-benchmarks.json")
  );
  if (parsed) return parsed;

  const { stdout } = await exec("meson introspect --benchmarks", {
    cwd: build
  });
  return JSON.parse(stdout) as Tests;
}

export async function getMesonVersion(): Promise<[number, number, number]> {
  const { stdout } = await exec("meson --version", {});
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
