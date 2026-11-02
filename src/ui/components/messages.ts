/**
 * Chat message bubble, webhook status indicator, and scrollable message feed
 * UI components.
 *
 * @packageDocumentation
 */

import type { TFunction } from "i18next";
import type { ChatMessage, MendelSettings } from "../../db";
import { getTranslator } from "../../i18n";
import { renderInteractive } from "./interactive";
import { renderMedia } from "./media";

/**
 * Formats a Unix epoch timestamp (in seconds) into a localized 24-hour
 * `HH:MM` time string.
 *
 * @param timestampSec - Unix timestamp in seconds.
 * @param locale - BCP 47 locale tag (e.g. `"en-US"`, `"pt-BR"`, `"fr-FR"`).
 * @returns Formatted `HH:MM` string.
 */
function formatTime(timestampSec: number, locale: string): string {
  const date = new Date(timestampSec * 1000);
  return date.toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * Renders the empty-chat placeholder displayed when no messages exist in the
 * database.
 *
 * @param settings - Current application settings.
 * @param t - Fixed locale translator function.
 * @returns HTML markup for the `.empty-state` card.
 */
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

/**
 * Renders the outbound webhook delivery status icon and retry button for an
 * outgoing message bubble.
 *
 * @param msg - Chat message record.
 * @param t - Fixed locale translator function.
 * @returns HTML markup for the status icon/retry button, or empty string for incoming messages.
 */
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

/**
 * Renders a single `.message-row` chat bubble including sender label, media
 * attachment, text content, interactive controls, timestamp, and delivery
 * status.
 *
 * @param msg - Chat message record to render.
 * @param settings - Current application settings.
 * @param t - Fixed locale translator function.
 * @returns HTML markup for the message row.
 */
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

/**
 * Renders the inner content of `#chat-messages` (either the empty state or the
 * list of rendered message bubbles).
 *
 * @param messages - Chronological array of chat messages.
 * @param settings - Current application settings.
 * @param t - Fixed locale translator function.
 * @returns HTML fragment for `#chat-messages`.
 */
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

/**
 * Renders the scrollable `<main class="chat-scroll">` container and its
 * HTMX-bound `#chat-messages` region.
 *
 * @param messages - Chronological array of chat messages.
 * @param settings - Current application settings.
 * @param t - Fixed locale translator function.
 * @returns HTML markup for the main chat feed.
 */
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
