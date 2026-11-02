/**
 * Application entrypoint for the `mendel` server.
 *
 * Ensures frontend assets in `dist/` are bundled before starting the HTTP
 * server and listening for incoming connections.
 *
 * @packageDocumentation
 */

import { join, resolve } from "node:path";
import { createMendelServer } from "./server";

const rootDir = resolve(import.meta.dir, "..");
const distDir = join(rootDir, "dist");

if (!(await Bun.file(join(distDir, "index.js")).exists())) {
  await Bun.build({
    entrypoints: [
      join(rootDir, "assets", "js", "index.js"),
      join(rootDir, "assets", "css", "index.css"),
    ],
    outdir: distDir,
    minify: true,
  });
}

const { server } = createMendelServer({ distDir });

console.log(`mendel listening on ${server.url.origin}`);
