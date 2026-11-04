/**
 * Evolution API-compatible message and chat endpoint handlers (`sendText`,
 * `sendMedia`, `sendWhatsAppAudio`, `sendPtv`, `sendSticker`, `updateMessage`,
 * `sendButtons`, `sendList`, and `sendPoll`).
 *
 * @packageDocumentation
 */

import { formatJid, type InteractivePayload, type MediaType } from "../../db";
import type { ServerContext } from "../context";
import {
  defaultMimetypeFor,
  inferMediaType,
  parseMediaString,
} from "../helpers";

/**
 * Safely parses a JSON request body as a key-value object, returning an empty
 * object when parsing fails.
 *
 * @param req - Incoming HTTP request.
 * @returns Parsed JSON object or `{}`.
 */
export async function parseJsonBody(
  req: Request
): Promise<Record<string, unknown>> {
  try {
    const parsed = await req.json();
    if (typeof parsed === "object" && parsed !== null) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

/**
 * Normalizes a raw Evolution API button object into an `{ id, text }` pair.
 *
 * @param rawButton - Raw button entry from `body.buttons`.
 * @param idx - Zero-based index of the button.
 * @returns Normalized button `{ id, text }`.
 */
function normalizeButtonItem(
  rawButton: unknown,
  idx: number
): { id: string; text: string } {
  const btn =
    typeof rawButton === "object" && rawButton !== null
      ? (rawButton as Record<string, unknown>)
      : {};
  const bt =
    typeof btn.buttonText === "object" && btn.buttonText !== null
      ? (btn.buttonText as Record<string, unknown>)
      : {};
  const id = String(btn.buttonId ?? btn.id ?? `btn_${idx + 1}`);
  const text = String(bt.displayText ?? btn.displayText ?? id);
  return { id, text };
}

/**
 * Handles incoming Evolution API media endpoints (`sendMedia`,
 * `sendWhatsAppAudio`, `sendPtv`, `sendSticker`) supporting both
 * `multipart/form-data` and `application/json` payloads.
 *
 * @param ctx - Shared server context.
 * @param req - Incoming HTTP request.
 * @param instance - Evolution API instance name from the route parameter.
 * @param forcedType - Optional media type override for specialized endpoints.
 * @returns Evolution API `201 Created` JSON response.
 */
export async function handleSendMediaEndpoint(
  ctx: ServerContext,
  req: Request,
  instance: string,
  forcedType?: MediaType
): Promise<Response> {
  const settings = ctx.store.getSettings();
  const contentType = req.headers.get("content-type") || "";

  let recipient = settings.senderNumber;
  let caption = "";
  let filename: string | null = null;
  let mediaType: MediaType = forcedType ?? "image";
  let mimetype = defaultMimetypeFor(mediaType);
  let mediaData: Uint8Array | null = null;
  let mediaUrl: string | null = null;

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    recipient = String(form.get("number") || settings.senderNumber);
    caption = String(form.get("caption") || "");
    const rawMediatype = form.get("mediatype")
      ? String(form.get("mediatype"))
      : forcedType;
    const rawMimetype = form.get("mimetype")
      ? String(form.get("mimetype"))
      : null;
    const fileEntry = form.get("file") ?? form.get("media");

    if (fileEntry instanceof File) {
      mediaData = new Uint8Array(await fileEntry.arrayBuffer());
      filename =
        (form.get("fileName") ? String(form.get("fileName")) : null) ||
        fileEntry.name ||
        null;
      mimetype =
        rawMimetype || fileEntry.type || defaultMimetypeFor(mediaType);
      mediaType = inferMediaType(rawMediatype, mimetype, filename);
    } else if (typeof fileEntry === "string" && fileEntry.trim()) {
      filename = form.get("fileName") ? String(form.get("fileName")) : null;
      mediaType = inferMediaType(rawMediatype, rawMimetype, filename);
      mimetype = rawMimetype || defaultMimetypeFor(mediaType);
      const parsed = parseMediaString(fileEntry, mimetype);
      mediaData = parsed.data;
      mimetype = parsed.mimetype;
      mediaUrl = parsed.mediaUrl;
    }
  } else {
    const body = await parseJsonBody(req);
    recipient = String(body.number || settings.senderNumber);
    caption = String(body.caption || "");
    filename = typeof body.fileName === "string" ? body.fileName : null;
    const rawMediatype =
      typeof body.mediatype === "string" ? body.mediatype : forcedType;
    const rawMimetype =
      typeof body.mimetype === "string" ? body.mimetype : null;
    mediaType = inferMediaType(rawMediatype, rawMimetype, filename);
    mimetype = rawMimetype || defaultMimetypeFor(mediaType);

    const rawMedia =
      typeof body.media === "string"
        ? body.media
        : typeof body.audio === "string"
          ? body.audio
          : typeof body.video === "string"
            ? body.video
            : typeof body.sticker === "string"
              ? body.sticker
              : "";

    if (rawMedia) {
      const parsed = parseMediaString(rawMedia, mimetype);
      mediaData = parsed.data;
      mimetype = parsed.mimetype;
      mediaUrl = parsed.mediaUrl;
    }
  }

  const msg = ctx.store.insertMessage({
    instance,
    remoteJid: formatJid(recipient),
    direction: "incoming",
    text: caption || null,
    mediaType,
    mediaMimetype: mimetype,
    mediaFilename: filename,
    mediaData,
    mediaUrl,
  });

  ctx.bumpVersion();

  return Response.json(
    {
      key: {
        remoteJid: msg.remoteJid,
        fromMe: true,
        id: msg.id,
      },
      pushName: instance,
      status: "PENDING",
      message: {
        [`${mediaType}Message`]: {
          mimetype: msg.mediaMimetype,
          caption: msg.text ?? "",
          fileName: msg.mediaFilename,
        },
      },
      messageType: `${mediaType}Message`,
      messageTimestamp: msg.timestamp,
      instanceId: instance,
      source: "unknown",
    },
    { status: 201 }
  );
}

/**
 * Handles `POST /message/sendText/:instance`, storing an incoming text message
 * from the Evolution API consumer and broadcasting an SSE update.
 *
 * @param ctx - Shared server context.
 * @param req - Incoming HTTP request with `:instance` route parameter.
 * @returns Evolution API `201 Created` JSON response.
 */
export async function handleSendTextPost(
  ctx: ServerContext,
  req: Bun.BunRequest<"/message/sendText/:instance">
): Promise<Response> {
  const instance = req.params.instance;
  const body = await parseJsonBody(req);
  const settings = ctx.store.getSettings();
  const recipient = String(body.number || settings.senderNumber);
  const text = String(body.text ?? "");

  const msg = ctx.store.insertMessage({
    instance,
    remoteJid: formatJid(recipient),
    direction: "incoming",
    text,
  });

  ctx.bumpVersion();

  return Response.json(
    {
      key: {
        remoteJid: msg.remoteJid,
        fromMe: true,
        id: msg.id,
      },
      pushName: instance,
      status: "PENDING",
      message: {
        conversation: text,
        extendedTextMessage: { text },
      },
      contextInfo: null,
      messageType: "extendedTextMessage",
      messageTimestamp: msg.timestamp,
      instanceId: instance,
      source: "unknown",
    },
    { status: 201 }
  );
}

/**
 * Handles `POST /message/sendMedia/:instance`.
 *
 * @param ctx - Shared server context.
 * @param req - Incoming HTTP request with `:instance` route parameter.
 * @returns Evolution API `201 Created` JSON response.
 */
export function handleSendMediaPost(
  ctx: ServerContext,
  req: Bun.BunRequest<"/message/sendMedia/:instance">
): Promise<Response> {
  return handleSendMediaEndpoint(ctx, req, req.params.instance);
}

/**
 * Handles `POST /message/sendWhatsAppAudio/:instance`.
 *
 * @param ctx - Shared server context.
 * @param req - Incoming HTTP request with `:instance` route parameter.
 * @returns Evolution API `201 Created` JSON response.
 */
export function handleSendWhatsAppAudioPost(
  ctx: ServerContext,
  req: Bun.BunRequest<"/message/sendWhatsAppAudio/:instance">
): Promise<Response> {
  return handleSendMediaEndpoint(ctx, req, req.params.instance, "audio");
}

/**
 * Handles `POST /message/sendPtv/:instance`.
 *
 * @param ctx - Shared server context.
 * @param req - Incoming HTTP request with `:instance` route parameter.
 * @returns Evolution API `201 Created` JSON response.
 */
export function handleSendPtvPost(
  ctx: ServerContext,
  req: Bun.BunRequest<"/message/sendPtv/:instance">
): Promise<Response> {
  return handleSendMediaEndpoint(ctx, req, req.params.instance, "video");
}

/**
 * Handles `POST /message/sendSticker/:instance`.
 *
 * @param ctx - Shared server context.
 * @param req - Incoming HTTP request with `:instance` route parameter.
 * @returns Evolution API `201 Created` JSON response.
 */
export function handleSendStickerPost(
  ctx: ServerContext,
  req: Bun.BunRequest<"/message/sendSticker/:instance">
): Promise<Response> {
  return handleSendMediaEndpoint(ctx, req, req.params.instance, "image");
}

/**
 * Handles `POST` and `PUT` `/chat/updateMessage/:instance`, editing an existing
 * message's text in-place (and updating its timestamp so recycled messages sort
 * after the user reply that triggered them).
 *
 * @param ctx - Shared server context.
 * @param req - Incoming HTTP request with `:instance` route parameter.
 * @returns Evolution API `EDITED` JSON response.
 */
export async function handleUpdateMessage(
  ctx: ServerContext,
  req: Bun.BunRequest<"/chat/updateMessage/:instance">
): Promise<Response> {
  const instance = req.params.instance;
  const body = await parseJsonBody(req);
  const settings = ctx.store.getSettings();
  const keyObj =
    typeof body.key === "object" && body.key !== null
      ? (body.key as Record<string, unknown>)
      : {};
  const messageId =
    typeof keyObj.id === "string" && keyObj.id
      ? keyObj.id
      : Bun.randomUUIDv7();
  const recipient = String(
    body.number || keyObj.remoteJid || settings.senderNumber
  );
  const newText = String(body.text ?? "");

  const msg = ctx.store.updateMessageText(messageId, newText, {
    instance,
    remoteJid: formatJid(recipient),
  });

  ctx.bumpVersion();

  return Response.json({
    key: {
      remoteJid: msg.remoteJid,
      fromMe: true,
      id: msg.id,
    },
    message: {
      conversation: msg.text,
    },
    status: "EDITED",
  });
}

/**
 * Handles `POST /message/sendButtons/:instance`, storing an incoming message
 * with interactive reply buttons.
 *
 * @param ctx - Shared server context.
 * @param req - Incoming HTTP request with `:instance` route parameter.
 * @returns Evolution API `201 Created` JSON response.
 */
export async function handleSendButtonsPost(
  ctx: ServerContext,
  req: Bun.BunRequest<"/message/sendButtons/:instance">
): Promise<Response> {
  const instance = req.params.instance;
  const body = await parseJsonBody(req);
  const settings = ctx.store.getSettings();
  const recipient = String(body.number || settings.senderNumber);
  const title = typeof body.title === "string" ? body.title : "";
  const description =
    typeof body.description === "string" ? body.description : "";
  const footer = typeof body.footer === "string" ? body.footer : "";
  const rawButtons = Array.isArray(body.buttons) ? body.buttons : [];

  const buttons = rawButtons.map(normalizeButtonItem);
  const textParts = [title, description, footer].filter(Boolean);
  const interactive: InteractivePayload = {
    type: "buttons",
    title,
    description,
    footer,
    buttons,
  };

  const msg = ctx.store.insertMessage({
    instance,
    remoteJid: formatJid(recipient),
    direction: "incoming",
    text: textParts.join("\n\n"),
    interactive,
  });

  ctx.bumpVersion();

  return Response.json(
    {
      key: {
        remoteJid: msg.remoteJid,
        fromMe: true,
        id: msg.id,
      },
      status: "PENDING",
      messageTimestamp: msg.timestamp,
    },
    { status: 201 }
  );
}

/**
 * Handles `POST /message/sendList/:instance`, storing an incoming message with
 * interactive list rows.
 *
 * @param ctx - Shared server context.
 * @param req - Incoming HTTP request with `:instance` route parameter.
 * @returns Evolution API `201 Created` JSON response.
 */
export async function handleSendListPost(
  ctx: ServerContext,
  req: Bun.BunRequest<"/message/sendList/:instance">
): Promise<Response> {
  const instance = req.params.instance;
  const body = await parseJsonBody(req);
  const settings = ctx.store.getSettings();
  const recipient = String(body.number || settings.senderNumber);
  const title = typeof body.title === "string" ? body.title : "";
  const description =
    typeof body.description === "string" ? body.description : "";
  const footer = typeof body.footerText === "string" ? body.footerText : "";
  const buttonText =
    typeof body.buttonText === "string" ? body.buttonText : "";
  const sections = Array.isArray(body.sections) ? body.sections : [];

  const rows: Array<{
    id: string;
    title: string;
    description?: string;
  }> = [];
  for (const sec of sections) {
    const secObj =
      typeof sec === "object" && sec !== null
        ? (sec as Record<string, unknown>)
        : {};
    const secRows = Array.isArray(secObj.rows) ? secObj.rows : [];
    for (const r of secRows) {
      const rObj =
        typeof r === "object" && r !== null
          ? (r as Record<string, unknown>)
          : {};
      rows.push({
        id: String(rObj.rowId ?? rObj.id ?? ""),
        title: String(rObj.title ?? ""),
        description:
          typeof rObj.description === "string" ? rObj.description : undefined,
      });
    }
  }

  const textParts = [title, description, footer].filter(Boolean);
  const interactive: InteractivePayload = {
    type: "list",
    title,
    description,
    footer,
    buttonText,
    rows,
  };

  const msg = ctx.store.insertMessage({
    instance,
    remoteJid: formatJid(recipient),
    direction: "incoming",
    text: textParts.join("\n\n"),
    interactive,
  });

  ctx.bumpVersion();

  return Response.json(
    {
      key: {
        remoteJid: msg.remoteJid,
        fromMe: true,
        id: msg.id,
      },
      status: "PENDING",
      messageTimestamp: msg.timestamp,
    },
    { status: 201 }
  );
}

/**
 * Handles `POST /message/sendPoll/:instance`, storing an incoming interactive
 * poll message.
 *
 * @param ctx - Shared server context.
 * @param req - Incoming HTTP request with `:instance` route parameter.
 * @returns Evolution API `201 Created` JSON response.
 */
export async function handleSendPollPost(
  ctx: ServerContext,
  req: Bun.BunRequest<"/message/sendPoll/:instance">
): Promise<Response> {
  const instance = req.params.instance;
  const body = await parseJsonBody(req);
  const settings = ctx.store.getSettings();
  const recipient = String(body.number || settings.senderNumber);
  const question = String(body.name ?? "Poll");
  const selectableCount = Number(body.selectableCount ?? 1);
  const options = Array.isArray(body.values) ? body.values.map(String) : [];

  const interactive: InteractivePayload = {
    type: "poll",
    question,
    selectableCount,
    options,
  };

  const msg = ctx.store.insertMessage({
    instance,
    remoteJid: formatJid(recipient),
    direction: "incoming",
    text: `📊 ${question}`,
    interactive,
  });

  ctx.bumpVersion();

  return Response.json(
    {
      key: {
        remoteJid: msg.remoteJid,
        fromMe: true,
        id: msg.id,
      },
      status: "PENDING",
      messageTimestamp: msg.timestamp,
    },
    { status: 201 }
  );
}

/**
 * Handles `POST /chat/getBase64FromMediaMessage/:instance` (and `/chat/getBase64FromMediaMessage`),
 * extracting a stored media attachment and returning its Base64 string and metadata
 * according to the Evolution API schema.
 *
 * @param ctx - Shared server context.
 * @param req - Incoming HTTP request with `:instance` route parameter.
 * @returns Evolution API `200 OK` JSON response with base64 data, or `404 Not Found`.
 */
export async function handleGetBase64FromMediaMessagePost(
  ctx: ServerContext,
  req: Request
): Promise<Response> {
  const body = await parseJsonBody(req);
  const msgObj =
    typeof body.message === "object" && body.message !== null
      ? (body.message as Record<string, unknown>)
      : {};
  const keyObj =
    typeof msgObj.key === "object" && msgObj.key !== null
      ? (msgObj.key as Record<string, unknown>)
      : typeof body.key === "object" && body.key !== null
        ? (body.key as Record<string, unknown>)
        : {};

  const messageId = String(
    keyObj.id ?? msgObj.id ?? body.id ?? body.messageId ?? ""
  ).trim();

  if (!messageId) {
    return Response.json(
      {
        status: 400,
        error: "Bad Request",
        message: "Message ID is required in message.key.id",
      },
      { status: 400 }
    );
  }

  const msg = ctx.store.getMessage(messageId);
  if (!msg) {
    return Response.json(
      {
        status: 404,
        error: "Not Found",
        message: "Message not found",
      },
      { status: 404 }
    );
  }

  const media = ctx.store.getMessageMedia(messageId);
  if (!media || !media.data) {
    return Response.json(
      {
        status: 404,
        error: "Not Found",
        message: "Media not found for this message",
      },
      { status: 404 }
    );
  }

  const mediaType = msg.mediaType ? `${msg.mediaType}Message` : "audioMessage";
  const fileName =
    msg.mediaFilename ||
    (msg.mediaType === "audio"
      ? "voice-message.ogg"
      : msg.mediaType === "image"
        ? "image.png"
        : msg.mediaType === "video"
          ? "video.mp4"
          : "document");
  const mimetype =
    msg.mediaMimetype || defaultMimetypeFor(msg.mediaType || "audio");

  return Response.json({
    status: 200,
    mediaType,
    fileName,
    caption: msg.text || null,
    size: {
      fileLength: media.data.byteLength,
    },
    mimetype,
    base64: media.data.toBase64(),
  });
}

/**
 * Handles `POST /chat/findMessages/:instance`, returning stored chat messages
 * in the standard Evolution API message list format.
 *
 * @param ctx - Shared server context.
 * @param req - Incoming HTTP request with `:instance` route parameter.
 * @returns Evolution API JSON array of message objects.
 */
export async function handleFindMessagesPost(
  ctx: ServerContext,
  req: Request
): Promise<Response> {
  const instance =
    "params" in req &&
    typeof req.params === "object" &&
    req.params !== null &&
    "instance" in req.params
      ? String((req.params as Record<string, unknown>).instance)
      : ctx.store.getSettings().instanceName;
  const messages = ctx.store.listMessages();
  const settings = ctx.store.getSettings();

  const formatted = messages.map((msg) => {
    const isOutgoing = msg.direction === "outgoing";
    return {
      id: msg.id,
      key: {
        remoteJid: msg.remoteJid,
        fromMe: !isOutgoing,
        id: msg.id,
      },
      pushName: isOutgoing ? settings.pushName : instance,
      messageType: msg.mediaType ? `${msg.mediaType}Message` : "conversation",
      message: {
        conversation: msg.text || "",
        ...(msg.mediaType === "audio"
          ? {
              audioMessage: {
                mimetype: msg.mediaMimetype || "audio/ogg",
                ptt: true,
              },
            }
          : {}),
      },
      messageTimestamp: msg.timestamp,
      status: "DELIVERED",
    };
  });

  return Response.json(formatted);
}
