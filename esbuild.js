// this is mostly copied from https://code.visualstudio.com/api/working-with-extensions/bundling-extension#using-esbuild
// no, we can't make it a typescript file, because then tsc complains it's not in the rootDir

import { context } from "esbuild";

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

async function main() {
  const ctx = await context({
    entryPoints: ["src/extension.ts"],
    bundle: true,
    format: "esm",
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: "node",
    outfile: "dist/extension.js",
    // basically required as long as we have CJS dependencies
    // node supports loading mixed ESM and CJS, applying the ESM import optimizations to the ESM subset.
    // We'd lose out on that if we were to bundle everything into CJS
    packages: "external",
    logLevel: "warning",
    plugins: [
      /* add to the end of plugins array */
      esbuildProblemMatcherPlugin,
    ],
  });
  if (watch) {
    await ctx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
  name: "esbuild-problem-matcher",

  setup(build) {
    build.onStart(() => {
      console.log("[watch] build started");
    });
    build.onEnd((result) => {
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ [ERROR] ${text}`);
        if (location == null) return;
        console.error(
          `    ${location.file}:${location.line}:${location.column}:`,
        );
      });
      console.log("[watch] build finished");
    });
  },
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
