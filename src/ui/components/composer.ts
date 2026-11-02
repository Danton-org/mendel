import type { TFunction } from "i18next";
import { getTranslator } from "../../i18n";

export function renderMediaPreviewBar(t: TFunction): string {
  return `
    <div id="media-preview-bar" class="media-preview-bar">
      <img
        id="media-preview-thumb"
        class="media-preview-thumb"
        alt="${Bun.escapeHTML(t("previewAlt"))}"
        style="display: none;"
      >
      <i id="media-preview-icon">attach_file</i>
      <span id="media-preview-name" class="max small-text"></span>
      <button
        type="button"
        class="circle transparent small"
        onclick="window.clearMediaSelection()"
        title="${Bun.escapeHTML(t("removeAttachment"))}"
      >
        <i>close</i>
      </button>
    </div>
  `;
}

export function renderComposerForm(t: TFunction): string {
  return `
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
        title="${Bun.escapeHTML(t("attachMedia"))}"
      >
        <i>attach_file</i>
      </button>
      <div class="field border round fill small composer-input-field">
        <input
          type="text"
          id="message-text-input"
          name="text"
          placeholder="${Bun.escapeHTML(t("messagePlaceholder"))}"
          autocomplete="off"
        >
      </div>
      <button
        type="submit"
        class="circle primary"
        title="${Bun.escapeHTML(t("sendMessage"))}"
      >
        <i>send</i>
      </button>
    </form>
  `;
}

export function renderComposer(t: TFunction = getTranslator()): string {
  return `
    <footer class="chat-composer">
      ${renderMediaPreviewBar(t)}
      ${renderComposerForm(t)}
    </footer>
  `;
}
