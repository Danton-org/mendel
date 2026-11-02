import type { ChatMessage, MendelSettings, MendelStore } from "./db";

export interface InteractiveReplyMeta {
  buttonId?: string;
  rowId?: string;
  pollOption?: string;
  pollMessageId?: string;
}

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
    const response = await fetch(settings.webhookUrl, {
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
