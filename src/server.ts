import { resolve, join } from "node:path";
import {
  formatJid,
  type InteractivePayload,
  type MediaType,
  MendelStore,
} from "./db";
import { getTranslator } from "./i18n";
import { renderHeaderStatus, renderMessages, renderPage } from "./ui";
import { dispatchWebhook, type InteractiveReplyMeta } from "./webhook";

export interface ServerOptions {
  port?: number;
  hostname?: string;
  dbPath?: string;
  distDir?: string;
}

function inferMediaType(
  explicitType?: string | null,
  mimetype?: string | null
): MediaType {
  const t = (explicitType || "").toLowerCase();
  if (t === "image" || t === "sticker") return "image";
  if (t === "video" || t === "ptv") return "video";
  if (t === "audio") return "audio";
  if (t === "document") return "document";

  const m = (mimetype || "").toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  return "document";
}

function defaultMimetypeFor(mediaType: MediaType): string {
  switch (mediaType) {
    case "image":
      return "image/png";
    case "video":
      return "video/mp4";
    case "audio":
      return "audio/ogg";
    default:
      return "application/octet-stream";
  }
}

function parseMediaString(
  rawMedia: string,
  fallbackMimetype: string
): {
  data: Uint8Array | null;
  mimetype: string;
  mediaUrl: string | null;
} {
  const trimmed = rawMedia.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return { data: null, mimetype: fallbackMimetype, mediaUrl: trimmed };
  }

  if (trimmed.startsWith("data:")) {
    const commaIdx = trimmed.indexOf(",");
    if (commaIdx !== -1) {
      const header = trimmed.slice(5, commaIdx);
      const b64 = trimmed.slice(commaIdx + 1);
      const mime = header.split(";")[0] || fallbackMimetype;
      return {
        data: Uint8Array.fromBase64(b64.replace(/\s+/g, "")),
        mimetype: mime,
        mediaUrl: null,
      };
    }
  }

  return {
    data: Uint8Array.fromBase64(trimmed.replace(/\s+/g, "")),
    mimetype: fallbackMimetype,
    mediaUrl: null,
  };
}

function htmlResponse(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export function createMendelServer(options: ServerOptions = {}) {
  const store = new MendelStore(options.dbPath);
  const distDir =
    options.distDir ?? resolve(import.meta.dir, "..", "dist");
  const port =
    options.port ??
    Number(Bun.env.PORT || Bun.env.SERVER_PORT || 8080);
  const hostname = options.hostname ?? Bun.env.HOST ?? "0.0.0.0";

  let version = 1;
  const sseControllers = new Set<ReadableStreamDefaultController<Uint8Array>>();
  const encoder = new TextEncoder();

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

  async function handleSendMediaEndpoint(
    req: Request,
    instance: string,
    forcedType?: MediaType
  ): Promise<Response> {
    const settings = store.getSettings();
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
        mediaType = inferMediaType(rawMediatype, mimetype);
      } else if (typeof fileEntry === "string" && fileEntry.trim()) {
        mediaType = inferMediaType(rawMediatype, rawMimetype);
        mimetype = rawMimetype || defaultMimetypeFor(mediaType);
        const parsed = parseMediaString(fileEntry, mimetype);
        mediaData = parsed.data;
        mimetype = parsed.mimetype;
        mediaUrl = parsed.mediaUrl;
        filename = form.get("fileName") ? String(form.get("fileName")) : null;
      }
    } else {
      const body = (await req.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      recipient = String(body.number || settings.senderNumber);
      caption = String(body.caption || "");
      filename = typeof body.fileName === "string" ? body.fileName : null;
      const rawMediatype =
        typeof body.mediatype === "string" ? body.mediatype : forcedType;
      const rawMimetype =
        typeof body.mimetype === "string" ? body.mimetype : null;
      mediaType = inferMediaType(rawMediatype, rawMimetype);
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

    const msg = store.insertMessage({
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

    bumpVersion();

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

  const server = Bun.serve({
    port,
    hostname,
    routes: {
      "/": {
        GET: (req) => {
          const accept = req.headers.get("accept") || "";
          if (
            accept.includes("application/json") &&
            !accept.includes("text/html")
          ) {
            return Response.json({
              status: 200,
              message: "Welcome to the Mendel Evolution API, it is working!",
              version: "2026.11.1",
            });
          }
          return htmlResponse(
            renderPage(
              store.listMessages(),
              store.getSettings(),
              getTranslator(req)
            )
          );
        },
      },

      "/health": {
        GET: () =>
          Response.json({
            status: "ok",
            version: "2026.11.1",
          }),
      },

      "/assets/:filename": {
        GET: (req) => {
          const filename = req.params.filename;
          if (!filename || filename.includes("..") || filename.includes("/")) {
            return new Response("Not Found", { status: 404 });
          }
          const file = Bun.file(join(distDir, filename));
          return new Response(file);
        },
      },

      "/api/events": {
        GET: () => {
          let activeController: ReadableStreamDefaultController<Uint8Array> | null =
            null;
          const stream = new ReadableStream<Uint8Array>({
            start(controller) {
              activeController = controller;
              sseControllers.add(controller);
              controller.enqueue(
                encoder.encode(`event: version\ndata: ${version}\n\n`)
              );
            },
            cancel() {
              if (activeController) {
                sseControllers.delete(activeController);
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
        },
      },

      "/media/:id": {
        GET: (req) => {
          const media = store.getMessageMedia(req.params.id);
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
        },
      },

      "/ui/messages": {
        GET: (req) =>
          htmlResponse(
            renderMessages(
              store.listMessages(),
              store.getSettings(),
              getTranslator(req)
            )
          ),
      },

      "/ui/send": {
        POST: async (req) => {
          const form = await req.formData();
          const text = String(form.get("text") || "").trim();
          const fileEntry = form.get("media");
          const settings = store.getSettings();
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
            return htmlResponse(
              renderMessages(store.listMessages(), settings, t)
            );
          }

          const msg = store.insertMessage({
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

          bumpVersion();

          const origin = new URL(req.url).origin;
          void dispatchWebhook(store, msg.id, origin, bumpVersion);

          return htmlResponse(
            renderMessages(store.listMessages(), settings, t)
          );
        },
      },

      "/ui/send-interactive": {
        POST: async (req) => {
          const form = await req.formData();
          const text = String(form.get("text") || "").trim();
          const buttonId = form.get("buttonId")
            ? String(form.get("buttonId"))
            : undefined;
          const rowId = form.get("rowId")
            ? String(form.get("rowId"))
            : undefined;
          const pollOption = form.get("pollOption")
            ? String(form.get("pollOption"))
            : undefined;
          const pollMessageId = form.get("pollMessageId")
            ? String(form.get("pollMessageId"))
            : undefined;

          const settings = store.getSettings();
          const msg = store.insertMessage({
            instance: settings.instanceName,
            remoteJid: formatJid(settings.senderNumber),
            direction: "outgoing",
            text: text || buttonId || rowId || pollOption || "",
            webhookStatus: "pending",
          });

          bumpVersion();

          const origin = new URL(req.url).origin;
          const replyMeta: InteractiveReplyMeta = {
            buttonId,
            rowId,
            pollOption,
            pollMessageId,
          };
          void dispatchWebhook(store, msg.id, origin, bumpVersion, replyMeta);

          return htmlResponse(
            renderMessages(
              store.listMessages(),
              settings,
              getTranslator(req)
            )
          );
        },
      },

      "/ui/retry/:id": {
        POST: (req) => {
          const id = req.params.id;
          store.updateWebhookStatus(id, "pending", null);
          bumpVersion();

          const origin = new URL(req.url).origin;
          void dispatchWebhook(store, id, origin, bumpVersion);

          return htmlResponse(
            renderMessages(
              store.listMessages(),
              store.getSettings(),
              getTranslator(req)
            )
          );
        },
      },

      "/ui/clear": {
        POST: (req) => {
          store.clearMessages();
          bumpVersion();
          return htmlResponse(
            renderMessages(
              store.listMessages(),
              store.getSettings(),
              getTranslator(req)
            )
          );
        },
      },

      "/ui/settings": {
        POST: async (req) => {
          const form = await req.formData();
          const updated = store.updateSettings({
            webhookUrl: form.has("webhookUrl")
              ? String(form.get("webhookUrl"))
              : undefined,
            instanceName: form.has("instanceName")
              ? String(form.get("instanceName"))
              : undefined,
            apiKey: form.has("apiKey")
              ? String(form.get("apiKey"))
              : undefined,
            senderNumber: form.has("senderNumber")
              ? String(form.get("senderNumber"))
              : undefined,
            pushName: form.has("pushName")
              ? String(form.get("pushName"))
              : undefined,
          });
          bumpVersion();
          return htmlResponse(renderHeaderStatus(updated, getTranslator(req)));
        },
      },

      // --- Evolution API Drop-In Endpoints ---

      "/message/sendText/:instance": {
        POST: async (req) => {
          const instance = req.params.instance;
          const body = (await req.json().catch(() => ({}))) as Record<
            string,
            unknown
          >;
          const settings = store.getSettings();
          const recipient = String(body.number || settings.senderNumber);
          const text = String(body.text ?? "");

          const msg = store.insertMessage({
            instance,
            remoteJid: formatJid(recipient),
            direction: "incoming",
            text,
          });

          bumpVersion();

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
        },
      },

      "/message/sendMedia/:instance": {
        POST: (req) => handleSendMediaEndpoint(req, req.params.instance),
      },

      "/message/sendWhatsAppAudio/:instance": {
        POST: (req) =>
          handleSendMediaEndpoint(req, req.params.instance, "audio"),
      },

      "/message/sendPtv/:instance": {
        POST: (req) =>
          handleSendMediaEndpoint(req, req.params.instance, "video"),
      },

      "/message/sendSticker/:instance": {
        POST: (req) =>
          handleSendMediaEndpoint(req, req.params.instance, "image"),
      },

      "/chat/updateMessage/:instance": {
        POST: async (req) => {
          const instance = req.params.instance;
          const body = (await req.json().catch(() => ({}))) as Record<
            string,
            unknown
          >;
          const settings = store.getSettings();
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

          const msg = store.updateMessageText(messageId, newText, {
            instance,
            remoteJid: formatJid(recipient),
          });

          bumpVersion();

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
        },
        PUT: async (req) => {
          const instance = req.params.instance;
          const body = (await req.json().catch(() => ({}))) as Record<
            string,
            unknown
          >;
          const settings = store.getSettings();
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

          const msg = store.updateMessageText(messageId, newText, {
            instance,
            remoteJid: formatJid(recipient),
          });

          bumpVersion();

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
        },
      },

      "/message/sendButtons/:instance": {
        POST: async (req) => {
          const instance = req.params.instance;
          const body = (await req.json().catch(() => ({}))) as Record<
            string,
            unknown
          >;
          const settings = store.getSettings();
          const recipient = String(body.number || settings.senderNumber);
          const title = typeof body.title === "string" ? body.title : "";
          const description =
            typeof body.description === "string" ? body.description : "";
          const footer = typeof body.footer === "string" ? body.footer : "";
          const rawButtons = Array.isArray(body.buttons) ? body.buttons : [];

          const buttons = rawButtons.map((b: unknown, idx: number) => {
            const btn =
              typeof b === "object" && b !== null
                ? (b as Record<string, unknown>)
                : {};
            const bt =
              typeof btn.buttonText === "object" && btn.buttonText !== null
                ? (btn.buttonText as Record<string, unknown>)
                : {};
            const id = String(btn.buttonId ?? btn.id ?? `btn_${idx + 1}`);
            const text = String(bt.displayText ?? btn.displayText ?? id);
            return { id, text };
          });

          const textParts = [title, description, footer].filter(Boolean);
          const interactive: InteractivePayload = {
            type: "buttons",
            title,
            description,
            footer,
            buttons,
          };

          const msg = store.insertMessage({
            instance,
            remoteJid: formatJid(recipient),
            direction: "incoming",
            text: textParts.join("\n\n"),
            interactive,
          });

          bumpVersion();

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
        },
      },

      "/message/sendList/:instance": {
        POST: async (req) => {
          const instance = req.params.instance;
          const body = (await req.json().catch(() => ({}))) as Record<
            string,
            unknown
          >;
          const settings = store.getSettings();
          const recipient = String(body.number || settings.senderNumber);
          const title = typeof body.title === "string" ? body.title : "";
          const description =
            typeof body.description === "string" ? body.description : "";
          const footer =
            typeof body.footerText === "string" ? body.footerText : "";
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
                  typeof rObj.description === "string"
                    ? rObj.description
                    : undefined,
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

          const msg = store.insertMessage({
            instance,
            remoteJid: formatJid(recipient),
            direction: "incoming",
            text: textParts.join("\n\n"),
            interactive,
          });

          bumpVersion();

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
        },
      },

      "/message/sendPoll/:instance": {
        POST: async (req) => {
          const instance = req.params.instance;
          const body = (await req.json().catch(() => ({}))) as Record<
            string,
            unknown
          >;
          const settings = store.getSettings();
          const recipient = String(body.number || settings.senderNumber);
          const question = String(body.name ?? "Poll");
          const selectableCount = Number(body.selectableCount ?? 1);
          const options = Array.isArray(body.values)
            ? body.values.map((v) => String(v))
            : [];

          const interactive: InteractivePayload = {
            type: "poll",
            question,
            selectableCount,
            options,
          };

          const msg = store.insertMessage({
            instance,
            remoteJid: formatJid(recipient),
            direction: "incoming",
            text: `📊 ${question}`,
            interactive,
          });

          bumpVersion();

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
        },
      },

      "/instance/fetchInstances": {
        GET: () => {
          const settings = store.getSettings();
          return Response.json([
            {
              instance: {
                instanceName: settings.instanceName,
                instanceId: "mendel-instance",
                status: "open",
                state: "open",
              },
            },
          ]);
        },
      },

      "/instance/connectionState/:instance": {
        GET: (req) =>
          Response.json({
            instance: {
              instanceName: req.params.instance,
              state: "open",
            },
          }),
      },

      "/instance/create": {
        POST: async (req) => {
          const body = (await req.json().catch(() => ({}))) as Record<
            string,
            unknown
          >;
          const instanceName =
            typeof body.instanceName === "string"
              ? body.instanceName
              : store.getSettings().instanceName;
          const webhookObj =
            typeof body.webhook === "object" && body.webhook !== null
              ? (body.webhook as Record<string, unknown>)
              : {};
          const webhookUrl =
            typeof webhookObj.url === "string"
              ? webhookObj.url
              : typeof body.webhook === "string"
                ? body.webhook
                : undefined;

          const updated = store.updateSettings({
            instanceName,
            webhookUrl,
          });
          bumpVersion();

          return Response.json(
            {
              instance: {
                instanceName: updated.instanceName,
                instanceId: "mendel-instance",
                status: "open",
              },
              hash: {
                apikey: updated.apiKey,
              },
            },
            { status: 201 }
          );
        },
      },

      "/webhook/set/:instance": {
        POST: async (req) => {
          const instance = req.params.instance;
          const body = (await req.json().catch(() => ({}))) as Record<
            string,
            unknown
          >;
          const nested =
            typeof body.webhook === "object" && body.webhook !== null
              ? (body.webhook as Record<string, unknown>)
              : body;
          const url =
            typeof nested.url === "string"
              ? nested.url
              : store.getSettings().webhookUrl;

          const updated = store.updateSettings({
            instanceName: instance,
            webhookUrl: url,
          });
          bumpVersion();

          return Response.json(
            {
              webhook: {
                instanceName: instance,
                webhook: {
                  url: updated.webhookUrl,
                  enabled: true,
                  webhookBase64: true,
                },
              },
            },
            { status: 201 }
          );
        },
      },

      "/webhook/find/:instance": {
        GET: () => {
          const settings = store.getSettings();
          return Response.json({
            enabled: true,
            url: settings.webhookUrl,
            webhookBase64: true,
            events: ["MESSAGES_UPSERT"],
          });
        },
      },
    },

    fetch() {
      return new Response("Not Found", { status: 404 });
    },
  });

  return {
    server,
    store,
    stop() {
      for (const c of sseControllers) {
        try {
          c.close();
        } catch {
          // ignore
        }
      }
      sseControllers.clear();
      server.stop(true);
      store.close();
    },
  };
}
