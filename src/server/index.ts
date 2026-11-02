/**
 * HTTP server module built on `Bun.serve`.
 *
 * Exposes the HTMX web chat interface, Server-Sent Events stream, binary media
 * delivery endpoint, and Evolution API-compatible endpoints.
 *
 * @packageDocumentation
 */

import {
  createServerContext,
  type ServerContext,
  type ServerOptions,
} from "./context";
import {
  handleConnectionStateGet,
  handleFetchInstancesGet,
  handleInstanceCreatePost,
  handleWebhookFindGet,
  handleWebhookSetPost,
} from "./handlers/instances";
import {
  handleSendButtonsPost,
  handleSendListPost,
  handleSendMediaEndpoint,
  handleSendMediaPost,
  handleSendPollPost,
  handleSendPtvPost,
  handleSendStickerPost,
  handleSendTextPost,
  handleSendWhatsAppAudioPost,
  handleUpdateMessage,
  parseJsonBody,
} from "./handlers/messages";
import {
  handleAssetGet,
  handleEventsGet,
  handleHealthGet,
  handleMediaGet,
  handleNotFound,
  handleRootGet,
} from "./handlers/system";
import {
  handleUiClearPost,
  handleUiMessagesGet,
  handleUiRetryPost,
  handleUiSendInteractivePost,
  handleUiSendPost,
  handleUiSettingsPost,
} from "./handlers/ui";
import {
  defaultMimetypeFor,
  htmlResponse,
  inferMediaType,
  type ParsedMediaResult,
  parseMediaString,
} from "./helpers";

export {
  createServerContext,
  defaultMimetypeFor,
  handleAssetGet,
  handleConnectionStateGet,
  handleEventsGet,
  handleFetchInstancesGet,
  handleHealthGet,
  handleInstanceCreatePost,
  handleMediaGet,
  handleNotFound,
  handleRootGet,
  handleSendButtonsPost,
  handleSendListPost,
  handleSendMediaEndpoint,
  handleSendMediaPost,
  handleSendPollPost,
  handleSendPtvPost,
  handleSendStickerPost,
  handleSendTextPost,
  handleSendWhatsAppAudioPost,
  handleUiClearPost,
  handleUiMessagesGet,
  handleUiRetryPost,
  handleUiSendInteractivePost,
  handleUiSendPost,
  handleUiSettingsPost,
  handleUpdateMessage,
  handleWebhookFindGet,
  handleWebhookSetPost,
  htmlResponse,
  inferMediaType,
  type ParsedMediaResult,
  parseJsonBody,
  parseMediaString,
  type ServerContext,
  type ServerOptions,
};

/**
 * Creates and starts a `mendel` HTTP server and SQLite store.
 *
 * @param options - Optional server, database, and static asset configuration.
 * @returns Object containing the running `Bun.Server`, {@link MendelStore}, and `stop()` cleanup method.
 */
export function createMendelServer(options: ServerOptions = {}) {
  const ctx = createServerContext(options);
  const port =
    options.port ??
    Number(Bun.env.PORT || Bun.env.SERVER_PORT || 8080);
  const hostname = options.hostname ?? Bun.env.HOST ?? "0.0.0.0";

  const server = Bun.serve({
    port,
    hostname,
    routes: {
      "/": {
        GET: handleRootGet.bind(null, ctx),
      },
      "/health": {
        GET: handleHealthGet,
      },
      "/assets/:filename": {
        GET: handleAssetGet.bind(null, ctx),
      },
      "/api/events": {
        GET: handleEventsGet.bind(null, ctx),
      },
      "/media/:id": {
        GET: handleMediaGet.bind(null, ctx),
      },
      "/ui/messages": {
        GET: handleUiMessagesGet.bind(null, ctx),
      },
      "/ui/send": {
        POST: handleUiSendPost.bind(null, ctx),
      },
      "/ui/send-interactive": {
        POST: handleUiSendInteractivePost.bind(null, ctx),
      },
      "/ui/retry/:id": {
        POST: handleUiRetryPost.bind(null, ctx),
      },
      "/ui/clear": {
        POST: handleUiClearPost.bind(null, ctx),
      },
      "/ui/settings": {
        POST: handleUiSettingsPost.bind(null, ctx),
      },
      "/message/sendText/:instance": {
        POST: handleSendTextPost.bind(null, ctx),
      },
      "/message/sendMedia/:instance": {
        POST: handleSendMediaPost.bind(null, ctx),
      },
      "/message/sendWhatsAppAudio/:instance": {
        POST: handleSendWhatsAppAudioPost.bind(null, ctx),
      },
      "/message/sendPtv/:instance": {
        POST: handleSendPtvPost.bind(null, ctx),
      },
      "/message/sendSticker/:instance": {
        POST: handleSendStickerPost.bind(null, ctx),
      },
      "/chat/updateMessage/:instance": {
        POST: handleUpdateMessage.bind(null, ctx),
        PUT: handleUpdateMessage.bind(null, ctx),
      },
      "/message/sendButtons/:instance": {
        POST: handleSendButtonsPost.bind(null, ctx),
      },
      "/message/sendList/:instance": {
        POST: handleSendListPost.bind(null, ctx),
      },
      "/message/sendPoll/:instance": {
        POST: handleSendPollPost.bind(null, ctx),
      },
      "/instance/fetchInstances": {
        GET: handleFetchInstancesGet.bind(null, ctx),
      },
      "/instance/connectionState/:instance": {
        GET: handleConnectionStateGet,
      },
      "/instance/create": {
        POST: handleInstanceCreatePost.bind(null, ctx),
      },
      "/webhook/set/:instance": {
        POST: handleWebhookSetPost.bind(null, ctx),
      },
      "/webhook/find/:instance": {
        GET: handleWebhookFindGet.bind(null, ctx),
      },
    },
    fetch: handleNotFound,
  });

  /**
   * Closes all active SSE streams, stops the HTTP server, and closes the
   * SQLite database connection.
   */
  function stop(): void {
    for (const c of ctx.sseControllers) {
      try {
        c.close();
      } catch {
        // ignore
      }
    }
    ctx.sseControllers.clear();
    server.stop(true);
    ctx.store.close();
  }

  return {
    server,
    store: ctx.store,
    stop,
  };
}
