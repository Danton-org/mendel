import type { TFunction } from "i18next";
import type { ChatMessage, MendelSettings } from "../../db";
import { getTranslator } from "../../i18n";
import { renderInteractive } from "./interactive";
import { renderMedia } from "./media";

function formatTime(timestampSec: number, locale: string): string {
  const date = new Date(timestampSec * 1000);
  return date.toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function renderEmptyState(
  settings: MendelSettings,
  t: TFunction
): string {
  const webhookTarget = Bun.escapeHTML(
    settings.webhookUrl || t("unconfigured")
  );
  return `
    <div class="empty-state">
      <i>chat</i>
      <h6>${Bun.escapeHTML(t("emptyTitle"))}</h6>
      <p class="small-text">
        ${Bun.escapeHTML(t("emptyDescription"))}
        <code>${webhookTarget}</code>.
      </p>
    </div>
  `;
}

export function renderWebhookStatus(msg: ChatMessage, t: TFunction): string {
  if (msg.direction !== "outgoing") return "";

  switch (msg.webhookStatus) {
    case "pending":
      return `<i title="${Bun.escapeHTML(t("webhookSending"))}">schedule</i>`;
    case "delivered":
      return `<i title="${Bun.escapeHTML(t("webhookDelivered"))}">done_all</i>`;
    case "failed": {
      const errTitle = Bun.escapeHTML(msg.webhookError || t("webhookFailed"));
      const retryLabel = Bun.escapeHTML(t("retryWebhook"));
      const retryUrl = `/ui/retry/${encodeURIComponent(msg.id)}`;
      return `
        <i class="status-error" title="${errTitle}">error</i>
        <button
          type="button"
          class="transparent circle tiny"
          title="${retryLabel}: ${errTitle}"
          hx-post="${retryUrl}"
          hx-target="#chat-messages"
          hx-swap="innerHTML"
        >
          <i>refresh</i>
        </button>
      `;
    }
    default:
      return "";
  }
}

export function renderMessageItem(
  msg: ChatMessage,
  settings: MendelSettings,
  t: TFunction
): string {
  const isOutgoing = msg.direction === "outgoing";
  const senderLabel = isOutgoing
    ? `${settings.pushName} (${msg.remoteJid.split("@")[0]})`
    : msg.instance;

  const editedHtml = msg.edited
    ? `<span>${Bun.escapeHTML(t("edited"))}</span>`
    : "";
  const mediaHtml = renderMedia(msg, t);
  const textHtml = msg.text
    ? `<p class="message-text">${Bun.escapeHTML(msg.text)}</p>`
    : "";
  const interactiveHtml = msg.interactive
    ? renderInteractive(msg.id, msg.interactive)
    : "";
  const statusHtml = renderWebhookStatus(msg, t);
  const timeHtml = Bun.escapeHTML(formatTime(msg.timestamp, t("lang")));

  return `
    <div class="message-row ${isOutgoing ? "outgoing" : "incoming"}" id="msg-${Bun.escapeHTML(msg.id)}">
      <div class="message-bubble">
        <div class="message-sender">${Bun.escapeHTML(senderLabel)}</div>
        ${mediaHtml}
        ${textHtml}
        ${interactiveHtml}
        <div class="message-meta">
          ${editedHtml}
          <span>${timeHtml}</span>
          ${statusHtml}
        </div>
      </div>
    </div>
  `;
}

export function renderMessages(
  messages: ChatMessage[],
  settings: MendelSettings,
  t: TFunction = getTranslator()
): string {
  if (messages.length === 0) {
    return renderEmptyState(settings, t);
  }
  return messages.map((msg) => renderMessageItem(msg, settings, t)).join("\n");
}

export function renderChatFeed(
  messages: ChatMessage[],
  settings: MendelSettings,
  t: TFunction = getTranslator()
): string {
  return `
    <main class="chat-scroll" id="chat-scroll">
      <div
        id="chat-messages"
        class="chat-messages"
        hx-get="/ui/messages"
        hx-trigger="mendel:refresh from:body"
        hx-swap="innerHTML"
      >
        ${renderMessages(messages, settings, t)}
      </div>
    </main>
  `;
}
