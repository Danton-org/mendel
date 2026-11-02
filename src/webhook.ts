/**
 * Outbound webhook construction and HTTP dispatch for Evolution API
 * `messages.upsert` events.
 *
 * @packageDocumentation
 */

import type { ChatMessage, MendelSettings, MendelStore } from "./db";

/**
 * Optional metadata describing an interactive button, list row, or poll vote
 * selected by the user in the chat interface.
 */
export interface InteractiveReplyMeta {
  /** Selected button ID when replying to a buttons message. */
  buttonId?: string;
  /** Selected row ID when replying to a list message. */
  rowId?: string;
  /** Selected option text when voting on a poll message. */
  pollOption?: string;
  /** Original poll message ID being voted on. */
  pollMessageId?: string;
}

/**
 * Builds an Evolution API-compatible `messages.upsert` webhook payload from a
 * stored {@link ChatMessage}.
 *
 * @param msg - Outgoing chat message record.
 * @param settings - Current webhook and instance configuration.
 * @param serverUrl - Origin URL of the `mendel` server (e.g. `"http://localhost:8080"`).
 * @param mediaBytes - Optional raw media bytes to encode as base64 in `data.message.base64`.
 * @param replyMeta - Optional interactive reply metadata (button, list row, or poll vote).
 * @returns Serializable Evolution API webhook payload object.
 */
export function buildWebhookPayload(
  msg: ChatMessage,
  settings: MendelSettings,
  serverUrl: string,
  mediaBytes?: Uint8Array | null,
  replyMeta?: InteractiveReplyMeta
): Record<string, unknown> {
  const messageObj: Record<string, unknown> = {};
  let messageType = "conversation";

  if (msg.mediaType === "image") {
    messageType = "imageMessage";
    messageObj.imageMessage = {
      mimetype: msg.mediaMimetype || "image/jpeg",
      caption: msg.text || "",
      url: `${serverUrl}/media/${msg.id}`,
    };
    if (mediaBytes) {
      messageObj.base64 = mediaBytes.toBase64();
    }
  } else if (msg.mediaType === "video") {
    messageType = "videoMessage";
    messageObj.videoMessage = {
      mimetype: msg.mediaMimetype || "video/mp4",
      caption: msg.text || "",
      url: `${serverUrl}/media/${msg.id}`,
    };
    if (mediaBytes) {
      messageObj.base64 = mediaBytes.toBase64();
    }
  } else if (msg.mediaType === "audio") {
    messageType = "audioMessage";
    messageObj.audioMessage = {
      mimetype: msg.mediaMimetype || "audio/ogg; codecs=opus",
      url: `${serverUrl}/media/${msg.id}`,
    };
    if (mediaBytes) {
      messageObj.base64 = mediaBytes.toBase64();
    }
  } else if (msg.mediaType === "document") {
    messageType = "documentMessage";
    messageObj.documentMessage = {
      mimetype: msg.mediaMimetype || "application/octet-stream",
      caption: msg.text || "",
      fileName: msg.mediaFilename || "document",
      url: `${serverUrl}/media/${msg.id}`,
    };
    if (mediaBytes) {
      messageObj.base64 = mediaBytes.toBase64();
    }
  } else if (replyMeta?.buttonId) {
    messageType = "buttonsResponseMessage";
    messageObj.buttonsResponseMessage = {
      selectedButtonId: replyMeta.buttonId,
      selectedDisplayText: msg.text || replyMeta.buttonId,
    };
  } else if (replyMeta?.rowId) {
    messageType = "listResponseMessage";
    messageObj.listResponseMessage = {
      title: msg.text || replyMeta.rowId,
      singleSelectReply: {
        selectedRowId: replyMeta.rowId,
      },
    };
  } else if (replyMeta?.pollOption) {
    messageType = "pollUpdateMessage";
    messageObj.pollUpdateMessage = {
      pollCreationMessageKey: {
        id: replyMeta.pollMessageId || "",
      },
      vote: {
        selectedOptions: [replyMeta.pollOption],
      },
    };
  } else {
    messageType = "conversation";
    messageObj.conversation = msg.text || "";
  }

  return {
    event: "messages.upsert",
    instance: settings.instanceName,
    data: {
      key: {
        remoteJid: msg.remoteJid,
        fromMe: false,
        id: msg.id,
      },
      pushName: settings.pushName,
      message: messageObj,
      messageType,
      messageTimestamp: msg.timestamp,
      instanceId: settings.instanceName,
      source: "web",
    },
    destination: settings.webhookUrl,
    date_time: new Date(msg.timestamp * 1000).toISOString(),
    sender: msg.remoteJid,
    server_url: serverUrl,
    apikey: settings.apiKey,
  };
}

/**
 * Reads `/proc/net/route` on Linux to discover Docker bridge gateway IPs
 * (e.g. `172.21.0.1`) in addition to `host.docker.internal`.
 *
 * @returns Array of candidate hostnames/IPs representing the Docker host.
 */
async function getDockerHostCandidates(): Promise<string[]> {
  const candidates = new Set<string>();
  try {
    const routeText = await Bun.file("/proc/net/route").text();
    for (const line of routeText.split("\n").slice(1)) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 3) continue;
      const destHex = parts[1]!;
      const gwHex = parts[2]!;
      if (gwHex !== "00000000" && gwHex.length === 8) {
        const b0 = Number.parseInt(gwHex.slice(6, 8), 16);
        const b1 = Number.parseInt(gwHex.slice(4, 6), 16);
        const b2 = Number.parseInt(gwHex.slice(2, 4), 16);
        const b3 = Number.parseInt(gwHex.slice(0, 2), 16);
        if (![b0, b1, b2, b3].some(Number.isNaN)) {
          candidates.add(`${b0}.${b1}.${b2}.${b3}`);
        }
      } else if (destHex !== "00000000" && destHex.length === 8) {
        const b0 = Number.parseInt(destHex.slice(6, 8), 16);
        const b1 = Number.parseInt(destHex.slice(4, 6), 16);
        const b2 = Number.parseInt(destHex.slice(2, 4), 16);
        if (![b0, b1, b2].some(Number.isNaN)) {
          candidates.add(`${b0}.${b1}.${b2}.1`);
        }
      }
    }
  } catch {
    // Ignore when not on Linux
  }
  candidates.add("host.docker.internal");
  return Array.from(candidates);
}

/**
 * Sends a webhook POST request, automatically falling back to Docker bridge
 * gateway IPs and `host.docker.internal` if `localhost` or `127.0.0.1` refuses
 * the connection inside a container.
 *
 * @param webhookUrl - Target webhook URL.
 * @param init - Fetch request options.
 * @returns HTTP {@link Response} from the target service.
 */
async function postWithDockerFallback(
  webhookUrl: string,
  init: RequestInit
): Promise<Response> {
  try {
    return await fetch(webhookUrl, init);
  } catch (err) {
    try {
      const parsed = new URL(webhookUrl);
      if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
        const candidates = await getDockerHostCandidates();
        return await Promise.any(
          candidates.map((host) => {
            const alt = new URL(webhookUrl);
            alt.hostname = host;
            return fetch(alt.toString(), init);
          })
        );
      }
    } catch {
      // Fall through and rethrow original error
    }
    throw err;
  }
}

/**
 * Dispatches a `messages.upsert` webhook POST request for the specified message
 * and updates its delivery status in {@link MendelStore}.
 *
 * @param store - Database store instance.
 * @param messageId - ID of the outgoing message to dispatch.
 * @param serverUrl - Origin URL of the `mendel` server.
 * @param onStatusChange - Optional callback invoked after delivery status changes.
 * @param replyMeta - Optional interactive reply metadata.
 * @returns Result object indicating whether webhook delivery succeeded.
 */
export async function dispatchWebhook(
  store: MendelStore,
  messageId: string,
  serverUrl: string,
  onStatusChange?: () => void,
  replyMeta?: InteractiveReplyMeta
): Promise<{ ok: boolean; status?: number; error?: string }> {
  const msg = store.getMessage(messageId);
  if (!msg) {
    return { ok: false, error: "Message not found" };
  }

  const settings = store.getSettings();
  if (!settings.webhookUrl) {
    store.updateWebhookStatus(messageId, "failed", "No webhook URL configured");
    onStatusChange?.();
    return { ok: false, error: "No webhook URL configured" };
  }

  const mediaRecord = msg.mediaType ? store.getMessageMedia(messageId) : null;
  const payload = buildWebhookPayload(
    msg,
    settings,
    serverUrl,
    mediaRecord?.data,
    replyMeta
  );

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (settings.apiKey) {
    headers["apikey"] = settings.apiKey;
    headers["x-api-key"] = settings.apiKey;
  }

  try {
    const response = await postWithDockerFallback(settings.webhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      store.updateWebhookStatus(messageId, "delivered", null);
      onStatusChange?.();
      return { ok: true, status: response.status };
    }

    const errText = (await response.text().catch(() => "")).slice(0, 200);
    const errMsg = `HTTP ${response.status}${errText ? `: ${errText}` : ""}`;
    store.updateWebhookStatus(messageId, "failed", errMsg);
    onStatusChange?.();
    return { ok: false, status: response.status, error: errMsg };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    store.updateWebhookStatus(messageId, "failed", errMsg);
    onStatusChange?.();
    return { ok: false, error: errMsg };
  }
}
