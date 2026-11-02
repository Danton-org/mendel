import type { ChatMessage, InteractivePayload, MendelSettings } from "./db";

function formatTime(timestampSec: number): string {
  const date = new Date(timestampSec * 1000);
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function renderInteractive(msgId: string, interactive: InteractivePayload): string {
  if (interactive.type === "buttons") {
    const btns = interactive.buttons
      .map((btn) => {
        const vals = JSON.stringify({
          buttonId: btn.id,
          text: btn.text,
        });
        return `<button type="button" class="small border round" hx-post="/ui/send-interactive" hx-target="#chat-messages" hx-swap="innerHTML" hx-vals='${Bun.escapeHTML(vals)}'>${Bun.escapeHTML(btn.text)}</button>`;
      })
      .join("");
    return `<div class="interactive-options">${btns}</div>`;
  }

  if (interactive.type === "list") {
    const btns = interactive.rows
      .map((row) => {
        const vals = JSON.stringify({
          rowId: row.id,
          text: row.title,
        });
        const label = row.description
          ? `${row.title} — ${row.description}`
          : row.title;
        return `<button type="button" class="small border round" hx-post="/ui/send-interactive" hx-target="#chat-messages" hx-swap="innerHTML" hx-vals='${Bun.escapeHTML(vals)}'>${Bun.escapeHTML(label)}</button>`;
      })
      .join("");
    return `<div class="interactive-options">${btns}</div>`;
  }

  if (interactive.type === "poll") {
    const btns = interactive.options
      .map((opt) => {
        const vals = JSON.stringify({
          pollMessageId: msgId,
          pollOption: opt,
          text: opt,
        });
        return `<button type="button" class="small border round" hx-post="/ui/send-interactive" hx-target="#chat-messages" hx-swap="innerHTML" hx-vals='${Bun.escapeHTML(vals)}'><i>how_to_vote</i><span>${Bun.escapeHTML(opt)}</span></button>`;
      })
      .join("");
    return `<div class="interactive-options">${btns}</div>`;
  }

  return "";
}

function renderMedia(msg: ChatMessage): string {
  if (!msg.mediaType) return "";
  const src = msg.hasMediaBlob
    ? `/media/${encodeURIComponent(msg.id)}`
    : msg.mediaUrl || "";
  if (!src) return "";

  if (msg.mediaType === "image") {
    return `<img class="message-media" src="${Bun.escapeHTML(src)}" alt="${Bun.escapeHTML(msg.mediaFilename || "Image")}" loading="lazy">`;
  }
  if (msg.mediaType === "video") {
    return `<video class="message-media" src="${Bun.escapeHTML(src)}" controls preload="metadata"></video>`;
  }
  if (msg.mediaType === "audio") {
    return `<audio class="message-media" src="${Bun.escapeHTML(src)}" controls preload="metadata"></audio>`;
  }
  return `<p><a class="button small border round" href="${Bun.escapeHTML(src)}" download="${Bun.escapeHTML(msg.mediaFilename || "file")}"><i>download</i><span>${Bun.escapeHTML(msg.mediaFilename || "Attachment")}</span></a></p>`;
}

export function renderMessages(
  messages: ChatMessage[],
  settings: MendelSettings
): string {
  if (messages.length === 0) {
    return `
      <div class="empty-state">
        <i>chat</i>
        <h6>No messages yet</h6>
        <p class="small-text">
          Messages you send here are forwarded as Evolution API webhooks to
          <code>${Bun.escapeHTML(settings.webhookUrl || "unconfigured")}</code>.
        </p>
      </div>
    `;
  }

  return messages
    .map((msg) => {
      const isOutgoing = msg.direction === "outgoing";
      const senderLabel = isOutgoing
        ? `${settings.pushName} (${msg.remoteJid.split("@")[0]})`
        : msg.instance;

      let statusHtml = "";
      if (isOutgoing) {
        if (msg.webhookStatus === "pending") {
          statusHtml = `<i title="Sending webhook...">schedule</i>`;
        } else if (msg.webhookStatus === "delivered") {
          statusHtml = `<i title="Webhook delivered">done_all</i>`;
        } else if (msg.webhookStatus === "failed") {
          const errTitle = msg.webhookError || "Webhook delivery failed";
          statusHtml = `
            <i class="status-error" title="${Bun.escapeHTML(errTitle)}">error</i>
            <button type="button" class="transparent circle tiny" title="Retry webhook: ${Bun.escapeHTML(errTitle)}" hx-post="/ui/retry/${encodeURIComponent(msg.id)}" hx-target="#chat-messages" hx-swap="innerHTML">
              <i>refresh</i>
            </button>
          `;
        }
      }

      const editedHtml = msg.edited ? `<span>(edited)</span>` : "";
      const mediaHtml = renderMedia(msg);
      const textHtml = msg.text
        ? `<p class="message-text">${Bun.escapeHTML(msg.text)}</p>`
        : "";
      const interactiveHtml = msg.interactive
        ? renderInteractive(msg.id, msg.interactive)
        : "";

      return `
        <div class="message-row ${isOutgoing ? "outgoing" : "incoming"}" id="msg-${Bun.escapeHTML(msg.id)}">
          <div class="message-bubble">
            <div class="message-sender">${Bun.escapeHTML(senderLabel)}</div>
            ${mediaHtml}
            ${textHtml}
            ${interactiveHtml}
            <div class="message-meta">
              ${editedHtml}
              <span>${Bun.escapeHTML(formatTime(msg.timestamp))}</span>
              ${statusHtml}
            </div>
          </div>
        </div>
      `;
    })
    .join("\n");
}

export function renderHeaderStatus(settings: MendelSettings): string {
  return `<span class="status-chip">Instance: <b>${Bun.escapeHTML(settings.instanceName)}</b> &bull; Webhook: <code>${Bun.escapeHTML(settings.webhookUrl || "none")}</code></span>`;
}

export function renderPage(
  messages: ChatMessage[],
  settings: MendelSettings
): string {
  return `<!doctype html>
<html lang="en" class="light">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>mendel — Evolution API Test Chat</title>
    <link rel="stylesheet" href="/assets/index.css">
    <script type="module" src="/assets/index.js"></script>
  </head>
  <body class="light">
    <div class="app-layout">
      <header class="chat-header">
        <nav>
          <i>forum</i>
          <div class="max">
            <h6 class="small no-margin">mendel</h6>
            <div id="header-status">${renderHeaderStatus(settings)}</div>
          </div>
          <button type="button" class="circle transparent" title="Clear conversation" hx-post="/ui/clear" hx-target="#chat-messages" hx-swap="innerHTML">
            <i>delete_sweep</i>
          </button>
          <button type="button" class="circle transparent" title="Toggle theme" onclick="window.toggleTheme()">
            <i id="theme-icon">dark_mode</i>
          </button>
          <button type="button" class="circle transparent" title="Webhook & Instance Settings" data-ui="#settings-dialog">
            <i>settings</i>
          </button>
        </nav>
      </header>

      <main class="chat-scroll" id="chat-scroll">
        <div
          id="chat-messages"
          class="chat-messages"
          hx-get="/ui/messages"
          hx-trigger="mendel:refresh from:body"
          hx-swap="innerHTML"
        >
          ${renderMessages(messages, settings)}
        </div>
      </main>

      <footer class="chat-composer">
        <div id="media-preview-bar" class="media-preview-bar">
          <img id="media-preview-thumb" class="media-preview-thumb" alt="Preview" style="display: none;">
          <i id="media-preview-icon">attach_file</i>
          <span id="media-preview-name" class="max small-text"></span>
          <button type="button" class="circle transparent small" onclick="window.clearMediaSelection()" title="Remove attachment">
            <i>close</i>
          </button>
        </div>

        <form
          id="chat-form"
          class="composer-form"
          hx-post="/ui/send"
          hx-target="#chat-messages"
          hx-swap="innerHTML"
          hx-encoding="multipart/form-data"
        >
          <input
            type="file"
            id="media-input"
            name="media"
            accept="image/*,video/*"
            hidden
          >
          <button
            type="button"
            class="circle transparent"
            onclick="document.getElementById('media-input').click()"
            title="Attach image or video"
          >
            <i>attach_file</i>
          </button>
          <div class="field border round fill small composer-input-field">
            <input
              type="text"
              id="message-text-input"
              name="text"
              placeholder="Type a message or caption..."
              autocomplete="off"
            >
          </div>
          <button type="submit" class="circle primary" title="Send message">
            <i>send</i>
          </button>
        </form>
      </footer>
    </div>

    <dialog id="settings-dialog" class="round medium-width">
      <h5>Configuration</h5>
      <form
        hx-post="/ui/settings"
        hx-target="#header-status"
        hx-swap="innerHTML"
        onsubmit="if (window.ui) window.ui('#settings-dialog');"
      >
        <div class="field label border round">
          <input type="url" name="webhookUrl" value="${Bun.escapeHTML(settings.webhookUrl)}" required>
          <label>Target Webhook URL</label>
          <span class="helper">URL where MESSAGES_UPSERT payloads are sent (e.g. http://dietia:8000/whatsapp)</span>
        </div>
        <div class="field label border round">
          <input type="text" name="instanceName" value="${Bun.escapeHTML(settings.instanceName)}" required>
          <label>Evolution Instance Name</label>
        </div>
        <div class="field label border round">
          <input type="text" name="apiKey" value="${Bun.escapeHTML(settings.apiKey)}">
          <label>API Key (apikey / x-api-key)</label>
        </div>
        <div class="field label border round">
          <input type="text" name="senderNumber" value="${Bun.escapeHTML(settings.senderNumber)}" required>
          <label>Simulated Sender Phone Number</label>
        </div>
        <div class="field label border round">
          <input type="text" name="pushName" value="${Bun.escapeHTML(settings.pushName)}" required>
          <label>Sender Push Name</label>
        </div>
        <nav class="right-align no-space">
          <button type="button" class="transparent link" data-ui="#settings-dialog">Cancel</button>
          <button type="submit" class="primary round">Save</button>
        </nav>
      </form>
    </dialog>
  </body>
</html>`;
}
