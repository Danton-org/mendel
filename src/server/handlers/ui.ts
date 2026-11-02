/**
 * HTMX web UI endpoint handlers for rendering messages, sending text/media or
 * interactive replies, retrying failed webhooks, clearing chat history, and
 * updating settings.
 *
 * @packageDocumentation
 */

import { formatJid, type MediaType } from "../../db";
import { getTranslator } from "../../i18n";
import { renderHeaderStatus, renderMessages } from "../../ui";
import { dispatchWebhook, type InteractiveReplyMeta } from "../../webhook";
import type { ServerContext } from "../context";
import { htmlResponse, inferMediaType } from "../helpers";

/**
 * Handles `GET /ui/messages`, rendering the `#chat-messages` HTML fragment.
 *
 * @param ctx - Shared server context.
 * @param req - Incoming HTTP request.
 * @returns Rendered HTML fragment of chat messages.
 */
export function handleUiMessagesGet(
  ctx: ServerContext,
  req: Bun.BunRequest<"/ui/messages">
): Response {
  return htmlResponse(
    renderMessages(
      ctx.store.listMessages(),
      ctx.store.getSettings(),
      getTranslator(req)
    )
  );
}

/**
 * Handles `POST /ui/send`, storing an outgoing text/media message from the UI
 * composer and dispatching an Evolution API `messages.upsert` webhook.
 *
 * @param ctx - Shared server context.
 * @param req - Incoming multipart form HTTP request.
 * @returns Updated `#chat-messages` HTML fragment.
 */
export async function handleUiSendPost(
  ctx: ServerContext,
  req: Bun.BunRequest<"/ui/send">
): Promise<Response> {
  const form = await req.formData();
  const text = String(form.get("text") || "").trim();
  const fileEntry = form.get("media");
  const settings = ctx.store.getSettings();
  const t = getTranslator(req);

  let mediaType: MediaType | null = null;
  let mediaMimetype: string | null = null;
  let mediaFilename: string | null = null;
  let mediaData: Uint8Array | null = null;

  if (fileEntry instanceof File && fileEntry.size > 0) {
    mediaData = new Uint8Array(await fileEntry.arrayBuffer());
    mediaMimetype = fileEntry.type || "application/octet-stream";
    mediaFilename = fileEntry.name || "attachment";
    mediaType = inferMediaType(null, mediaMimetype);
  }

  if (!text && !mediaData) {
    return htmlResponse(renderMessages(ctx.store.listMessages(), settings, t));
  }

  const msg = ctx.store.insertMessage({
    instance: settings.instanceName,
    remoteJid: formatJid(settings.senderNumber),
    direction: "outgoing",
    text: text || null,
    mediaType,
    mediaMimetype,
    mediaFilename,
    mediaData,
    webhookStatus: "pending",
  });

  ctx.bumpVersion();

  const origin = new URL(req.url).origin;
  void dispatchWebhook(ctx.store, msg.id, origin, ctx.bumpVersion);

  return htmlResponse(renderMessages(ctx.store.listMessages(), settings, t));
}

/**
 * Handles `POST /ui/send-interactive`, recording an interactive button click,
 * list selection, or poll vote and dispatching the corresponding webhook.
 *
 * @param ctx - Shared server context.
 * @param req - Incoming form HTTP request.
 * @returns Updated `#chat-messages` HTML fragment.
 */
export async function handleUiSendInteractivePost(
  ctx: ServerContext,
  req: Bun.BunRequest<"/ui/send-interactive">
): Promise<Response> {
  const form = await req.formData();
  const text = String(form.get("text") || "").trim();
  const buttonId = form.get("buttonId")
    ? String(form.get("buttonId"))
    : undefined;
  const rowId = form.get("rowId") ? String(form.get("rowId")) : undefined;
  const pollOption = form.get("pollOption")
    ? String(form.get("pollOption"))
    : undefined;
  const pollMessageId = form.get("pollMessageId")
    ? String(form.get("pollMessageId"))
    : undefined;

  const settings = ctx.store.getSettings();
  const msg = ctx.store.insertMessage({
    instance: settings.instanceName,
    remoteJid: formatJid(settings.senderNumber),
    direction: "outgoing",
    text: text || buttonId || rowId || pollOption || "",
    webhookStatus: "pending",
  });

  ctx.bumpVersion();

  const origin = new URL(req.url).origin;
  const replyMeta: InteractiveReplyMeta = {
    buttonId,
    rowId,
    pollOption,
    pollMessageId,
  };
  void dispatchWebhook(ctx.store, msg.id, origin, ctx.bumpVersion, replyMeta);

  return htmlResponse(
    renderMessages(ctx.store.listMessages(), settings, getTranslator(req))
  );
}

/**
 * Handles `POST /ui/retry/:id`, re-dispatching the webhook for a previously
 * failed outgoing message.
 *
 * @param ctx - Shared server context.
 * @param req - Incoming HTTP request with `:id` message parameter.
 * @returns Updated `#chat-messages` HTML fragment.
 */
export function handleUiRetryPost(
  ctx: ServerContext,
  req: Bun.BunRequest<"/ui/retry/:id">
): Response {
  const id = req.params.id;
  ctx.store.updateWebhookStatus(id, "pending", null);
  ctx.bumpVersion();

  const origin = new URL(req.url).origin;
  void dispatchWebhook(ctx.store, id, origin, ctx.bumpVersion);

  return htmlResponse(
    renderMessages(
      ctx.store.listMessages(),
      ctx.store.getSettings(),
      getTranslator(req)
    )
  );
}

/**
 * Handles `POST /ui/clear`, deleting all stored chat messages.
 *
 * @param ctx - Shared server context.
 * @param req - Incoming HTTP request.
 * @returns Empty-state `#chat-messages` HTML fragment.
 */
export function handleUiClearPost(
  ctx: ServerContext,
  req: Bun.BunRequest<"/ui/clear">
): Response {
  ctx.store.clearMessages();
  ctx.bumpVersion();
  return htmlResponse(
    renderMessages(
      ctx.store.listMessages(),
      ctx.store.getSettings(),
      getTranslator(req)
    )
  );
}

/**
 * Handles `POST /ui/settings`, updating webhook and instance configuration in
 * SQLite and returning the refreshed header status fragment.
 *
 * @param ctx - Shared server context.
 * @param req - Incoming form HTTP request.
 * @returns Updated `#header-status` HTML fragment.
 */
export async function handleUiSettingsPost(
  ctx: ServerContext,
  req: Bun.BunRequest<"/ui/settings">
): Promise<Response> {
  const form = await req.formData();
  const updated = ctx.store.updateSettings({
    webhookUrl: form.has("webhookUrl")
      ? String(form.get("webhookUrl"))
      : undefined,
    instanceName: form.has("instanceName")
      ? String(form.get("instanceName"))
      : undefined,
    apiKey: form.has("apiKey") ? String(form.get("apiKey")) : undefined,
    senderNumber: form.has("senderNumber")
      ? String(form.get("senderNumber"))
      : undefined,
    pushName: form.has("pushName") ? String(form.get("pushName")) : undefined,
  });
  ctx.bumpVersion();
  return htmlResponse(renderHeaderStatus(updated, getTranslator(req)));
}
