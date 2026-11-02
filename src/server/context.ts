/**
 * Server configuration and shared runtime state for HTTP route handlers.
 *
 * @packageDocumentation
 */

import { resolve } from "node:path";
import { MendelStore } from "../db";

/**
 * Configuration options for starting a `mendel` HTTP server instance.
 */
export interface ServerOptions {
  /** TCP port to listen on (`0` for an ephemeral OS-assigned port). */
  port?: number;
  /** Bind hostname or IP address. */
  hostname?: string;
  /** Path to the SQLite database file, or `":memory:"`. */
  dbPath?: string;
  /** Directory containing bundled static assets (`index.js`, `index.css`, fonts). */
  distDir?: string;
}

/**
 * Shared runtime state passed to HTTP endpoint handlers.
 */
export interface ServerContext {
  /** SQLite store instance for messages, media, and settings. */
  store: MendelStore;
  /** Directory containing built static assets. */
  distDir: string;
  /** Active Server-Sent Events stream controllers. */
  sseControllers: Set<ReadableStreamDefaultController<Uint8Array>>;
  /** Shared UTF-8 text encoder for SSE frames. */
  encoder: TextEncoder;
  /** Returns the current monotonic state version number. */
  getVersion(): number;
  /** Increments the state version and notifies all connected SSE clients. */
  bumpVersion(): void;
}

/**
 * Initializes the {@link ServerContext} from the provided {@link ServerOptions}.
 *
 * @param options - Server configuration options.
 * @returns Initialized {@link ServerContext}.
 */
export function createServerContext(options: ServerOptions = {}): ServerContext {
  const store = new MendelStore(options.dbPath);
  const distDir =
    options.distDir ?? resolve(import.meta.dir, "..", "..", "dist");
  const sseControllers = new Set<ReadableStreamDefaultController<Uint8Array>>();
  const encoder = new TextEncoder();
  let version = 1;

  function getVersion(): number {
    return version;
  }

  function bumpVersion(): void {
    version += 1;
    const payload = encoder.encode(`event: version\ndata: ${version}\n\n`);
    for (const controller of sseControllers) {
      try {
        controller.enqueue(payload);
      } catch {
        sseControllers.delete(controller);
      }
    }
  }

  return {
    store,
    distDir,
    sseControllers,
    encoder,
    getVersion,
    bumpVersion,
  };
}
