/**
 * Interactive message control components (buttons, lists, and polls).
 *
 * @packageDocumentation
 */

import type { InteractivePayload } from "../../db";

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
 * Renders clickable voting options for an Evolution API `sendPoll` message.
 *
 * @param msgId - ID of the poll message being voted on.
 * @param options - Poll option strings.
 * @returns HTML markup for the `.interactive-options` container.
 */
export function renderPollInteractive(
  msgId: string,
  options: string[]
): string {
  const items = options
    .map((opt) =>
      renderInteractiveButton(
        { pollMessageId: msgId, pollOption: opt, text: opt },
        `<i>how_to_vote</i><span>${Bun.escapeHTML(opt)}</span>`
      )
    )
    .join("");
  return `<div class="interactive-options">${items}</div>`;
}

/**
 * Dispatches rendering of an {@link InteractivePayload} to the appropriate
 * buttons, list, or poll renderer.
 *
 * @param msgId - Message ID owning the interactive payload.
 * @param interactive - Interactive payload metadata.
 * @returns HTML markup for the interactive controls.
 */
export function renderInteractive(
  msgId: string,
  interactive: InteractivePayload
): string {
  switch (interactive.type) {
    case "buttons":
      return renderButtonsInteractive(interactive.buttons);
    case "list":
      return renderListInteractive(interactive.rows);
    case "poll":
      return renderPollInteractive(msgId, interactive.options);
  }
}
