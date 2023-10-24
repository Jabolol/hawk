/// <reference lib="deno.ns" />

import * as esbuild from "https://deno.land/x/esbuild@v0.19.2/wasm.js";
import { denoPlugins } from "https://deno.land/x/esbuild_deno_loader@0.8.2/mod.ts";

const result = await esbuild.build({
  plugins: [...denoPlugins()],
  entryPoints: [`${Deno.cwd()}/main.ts`],
  outfile: `${Deno.cwd()}/main.js`,
  bundle: true,
  minify: true,
  format: "esm",
});

const banner = new TextEncoder().encode("// deno-lint-ignore-file\n");

result.outputFiles?.forEach(({ path, contents }) =>
  Deno.writeFile(path, new Uint8Array([...banner, ...contents]))
);

esbuild.stop();
