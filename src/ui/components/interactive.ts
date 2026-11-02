import type { InteractivePayload } from "../../db";

function renderInteractiveButton(
  vals: Record<string, string>,
  innerHtml: string
): string {
  const serializedVals = Bun.escapeHTML(JSON.stringify(vals));
  return `<button type="button" class="small border round" hx-post="/ui/send-interactive" hx-target="#chat-messages" hx-swap="innerHTML" hx-vals='${serializedVals}'>${innerHtml}</button>`;
}

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
