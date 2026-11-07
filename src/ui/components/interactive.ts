/**
 * Interactive message control components (buttons, lists, and polls).
 *
 * @packageDocumentation
 */

import type { TFunction } from "i18next";
import type { InteractivePayload } from "../../db";
import { getTranslator } from "../../i18n";

/**
 * Renders a single HTMX interactive reply button that posts to
 * `/ui/send-interactive`.
 *
 * @param vals - Key-value pairs serialized into `hx-vals`.
 * @param innerHtml - Escaped inner HTML content of the button.
 * @returns HTML `<button>` string.
 */
function renderInteractiveButton(
  vals: Record<string, string>,
  innerHtml: string
): string {
  const serializedVals = Bun.escapeHTML(JSON.stringify(vals));
  return `<button type="button" class="small border round" hx-post="/ui/send-interactive" hx-target="#chat-messages" hx-swap="innerHTML" hx-vals='${serializedVals}'>${innerHtml}</button>`;
}

/**
 * Renders clickable reply buttons for an Evolution API `sendButtons` message.
 *
 * @param buttons - Array of button definitions (`id` and display `text`).
 * @returns HTML markup for the `.interactive-options` container.
 */
export function renderButtonsInteractive(
  buttons: Array<{ id: string; text: string }>
): string {
  const items = buttons
    .map((btn) =>
      renderInteractiveButton(
        { buttonId: btn.id, text: btn.text },
        Bun.escapeHTML(btn.text)
      )
    )
    .join("");
  return `<div class="interactive-options">${items}</div>`;
}

/**
 * Renders clickable list rows for an Evolution API `sendList` message.
 *
 * @param rows - Array of list row items (`id`, `title`, and optional `description`).
 * @returns HTML markup for the `.interactive-options` container.
 */
export function renderListInteractive(
  rows: Array<{ id: string; title: string; description?: string }>
): string {
  const items = rows
    .map((row) => {
      const label = row.description
        ? `${row.title} — ${row.description}`
        : row.title;
      return renderInteractiveButton(
        { rowId: row.id, text: row.title },
        Bun.escapeHTML(label)
      );
    })
    .join("");
  return `<div class="interactive-options">${items}</div>`;
}

/**
 * Renders interactive voting options for an Evolution API `sendPoll` message,
 * supporting single-choice one-tap buttons and multiple-choice checkbox forms.
 *
 * @param msgId - ID of the poll message being voted on.
 * @param poll - Poll interactive payload containing options and selectable count.
 * @param t - Fixed locale translator function.
 * @returns HTML markup for the poll options container or form.
 */
export function renderPollInteractive(
  msgId: string,
  poll: Extract<InteractivePayload, { type: "poll" }>,
  t: TFunction
): string {
  const isMultiple = poll.selectableCount > 1 || poll.selectableCount === 0;
  const userVotes = new Set(poll.userVotes || []);

  if (isMultiple) {
    const hintText =
      poll.selectableCount > 1
        ? t("selectUpTo", { count: poll.selectableCount })
        : t("selectMultiple");

    const optionsHtml = poll.options
      .map((opt) => {
        const isChecked = userVotes.has(opt);
        return `
        <label class="checkbox poll-checkbox-label ${isChecked ? "voted" : ""}">
          <input
            type="checkbox"
            name="pollOption"
            value="${Bun.escapeHTML(opt)}"
            class="poll-checkbox"
            ${isChecked ? "checked" : ""}
          />
          <span>${Bun.escapeHTML(opt)}</span>
          <i class="poll-check-icon">check</i>
        </label>`;
      })
      .join("");

    return `
      <div class="poll-card" id="poll-${Bun.escapeHTML(msgId)}">
        <div class="poll-hint">
          <i>checklist</i>
          <span>${Bun.escapeHTML(hintText)}</span>
        </div>
        <form class="poll-form" hx-post="/ui/send-interactive" hx-target="#chat-messages" hx-swap="innerHTML">
          <input type="hidden" name="pollMessageId" value="${Bun.escapeHTML(msgId)}" />
          <div class="poll-options" data-poll-selectable="${poll.selectableCount}">
            ${optionsHtml}
          </div>
          <div class="poll-actions">
            <button type="submit" class="small primary round poll-vote-btn" ${userVotes.size > 0 ? "" : "disabled"}>
              <i>how_to_vote</i>
              <span>${Bun.escapeHTML(t("vote"))}</span>
            </button>
          </div>
        </form>
      </div>
    `.trim();
  }

  const items = poll.options
    .map((opt) => {
      const isSelected = userVotes.has(opt);
      const icon = isSelected ? "check_circle" : "radio_button_unchecked";
      const btnClass = `small border round poll-option-btn ${isSelected ? "voted" : ""}`.trim();
      const vals = Bun.escapeHTML(
        JSON.stringify({ pollMessageId: msgId, pollOption: opt })
      );
      return `
        <button
          type="button"
          class="${btnClass}"
          hx-post="/ui/send-interactive"
          hx-target="#chat-messages"
          hx-swap="innerHTML"
          hx-vals='${vals}'
        >
          <i>${icon}</i>
          <span>${Bun.escapeHTML(opt)}</span>
        </button>
      `.trim();
    })
    .join("");

  return `
    <div class="poll-card" id="poll-${Bun.escapeHTML(msgId)}">
      <div class="poll-hint">
        <i>how_to_vote</i>
        <span>${Bun.escapeHTML(t("selectOne"))}</span>
      </div>
      <div class="poll-options-single">
        ${items}
      </div>
    </div>
  `.trim();
}

/**
 * Dispatches rendering of an {@link InteractivePayload} to the appropriate
 * buttons, list, or poll renderer.
 *
 * @param msgId - Message ID owning the interactive payload.
 * @param interactive - Interactive payload metadata.
 * @param t - Optional locale translator function (defaults to `"en-US"`).
 * @returns HTML markup for the interactive controls.
 */
export function renderInteractive(
  msgId: string,
  interactive: InteractivePayload,
  t: TFunction = getTranslator("en-US")
): string {
  switch (interactive.type) {
    case "buttons":
      return renderButtonsInteractive(interactive.buttons);
    case "list":
      return renderListInteractive(interactive.rows);
    case "poll":
      return renderPollInteractive(msgId, interactive, t);
  }
}
