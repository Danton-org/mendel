/**
 * Core HTTP endpoint handlers for the root page, health check, static assets,
 * Server-Sent Events stream, and media blob delivery.
 *
 * @packageDocumentation
 */

import { join } from "node:path";
import { getTranslator } from "../../i18n";
import { renderPage } from "../../ui";
import type { ServerContext } from "../context";
import { htmlResponse } from "../helpers";

/**
 * Handles `GET /`, returning either a JSON welcome status when requested with
 * `Accept: application/json` or the full HTMX chat interface HTML page.
 *
 * @param ctx - Shared server context.
 * @param req - Incoming HTTP request.
 * @returns HTML page or JSON status response.
 */
export function handleRootGet(
  ctx: ServerContext,
  req: Bun.BunRequest<"/">
): Response {
  const accept = req.headers.get("accept") || "";
  if (accept.includes("application/json") && !accept.includes("text/html")) {
    return Response.json({
      status: 200,
      message: "Welcome to the Mendel Evolution API, it is working!",
      version: "2026.11.4",
    });
  }
  return htmlResponse(
    renderPage(
      ctx.store.listMessages(),
      ctx.store.getSettings(),
      getTranslator(req)
    )
  );
}

/**
 * Handles `GET /health`, returning a JSON liveness payload.
 *
 * @returns JSON `{ status: "ok", version }` response.
 */
export function handleHealthGet(): Response {
  return Response.json({
    status: "ok",
    version: "2026.11.4",
  });
}

/**
 * Handles `GET /assets/:filename`, serving bundled static files from `distDir`
 * with path-traversal protection.
 *
 * @param ctx - Shared server context.
 * @param req - Incoming HTTP request with `:filename` route parameter.
 * @returns Static file response, or `404 Not Found`.
 */
export function handleAssetGet(
  ctx: ServerContext,
  req: Bun.BunRequest<"/assets/:filename">
): Response {
  const filename = req.params.filename;
  if (!filename || filename.includes("..") || filename.includes("/")) {
    return new Response("Not Found", { status: 404 });
  }
  const file = Bun.file(join(ctx.distDir, filename));
  return new Response(file);
}

/**
 * Handles `GET /api/events`, opening a long-lived Server-Sent Events stream
 * that pushes state `version` updates to connected browser clients.
 *
 * @param ctx - Shared server context.
 * @param req - Incoming HTTP request.
 * @param server - Running `Bun.Server` instance used to disable idle timeout.
 * @returns `text/event-stream` HTTP response.
 */
export function handleEventsGet(
  ctx: ServerContext,
  req: Bun.BunRequest<"/api/events">,
  server: Bun.Server<undefined>
): Response {
  server.timeout(req, 0);
  let activeController: ReadableStreamDefaultController<Uint8Array> | null =
    null;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      activeController = controller;
      ctx.sseControllers.add(controller);
      controller.enqueue(
        ctx.encoder.encode(`event: version\ndata: ${ctx.getVersion()}\n\n`)
      );
    },
    cancel() {
      if (activeController) {
        ctx.sseControllers.delete(activeController);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

/**
 * Handles `GET /media/:id`, serving stored binary media attachments with HTTP
 * byte-range (`206 Partial Content`) support for audio/video streaming, or
 * redirecting to an external `mediaUrl`.
 *
 * @param ctx - Shared server context.
 * @param req - Incoming HTTP request with `:id` message parameter.
 * @returns Binary media response, `302` redirect, or `404 Not Found`.
 */
export function handleMediaGet(
  ctx: ServerContext,
  req: Bun.BunRequest<"/media/:id">
): Response {
  const media = ctx.store.getMessageMedia(req.params.id);
  if (!media) {
    return new Response("Not Found", { status: 404 });
  }
  if (!media.data && media.mediaUrl) {
    return Response.redirect(media.mediaUrl, 302);
  }
  if (!media.data) {
    return new Response("Not Found", { status: 404 });
  }

  const total = media.data.byteLength;
  const rangeHeader = req.headers.get("range");
  if (rangeHeader && rangeHeader.startsWith("bytes=")) {
    const [startStr, endStr] = rangeHeader.slice(6).split("-");
    const start = Number.parseInt(startStr || "0", 10);
    const end = endStr
      ? Math.min(Number.parseInt(endStr, 10), total - 1)
      : total - 1;
    if (
      !Number.isNaN(start) &&
      !Number.isNaN(end) &&
      start >= 0 &&
      start <= end &&
      end < total
    ) {
      const chunk = media.data.subarray(start, end + 1);
      return new Response(chunk as Uint8Array<ArrayBuffer>, {
        status: 206,
        headers: {
          "Content-Type": media.mimetype,
          "Content-Length": String(chunk.byteLength),
          "Content-Range": `bytes ${start}-${end}/${total}`,
          "Accept-Ranges": "bytes",
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    }
  }

  return new Response(media.data as Uint8Array<ArrayBuffer>, {
    headers: {
      "Content-Type": media.mimetype,
      "Content-Length": String(total),
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

/**
 * Fallback handler returning a `404 Not Found` response for unmatched routes.
 *
 * @returns `404 Not Found` HTTP response.
 */
export function handleNotFound(): Response {
  return new Response("Not Found", { status: 404 });
}
