/**
 * Chat composer UI components including media preview bar and message form with
 * voice note recording support.
 *
 * @packageDocumentation
 */

import type { TFunction } from "i18next";
import { getTranslator } from "../../i18n";

/**
 * Renders the preview bar above the composer showing the currently selected
 * media file (image thumbnail, video/audio icon, filename, and remove button).
 *
 * @param t - Fixed locale translator function.
 * @returns HTML markup for the `#media-preview-bar`.
 */
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

/**
 * Renders the composer form with attachment picker, text input, voice note
 * recorder interface, and dynamic send / microphone action buttons.
 *
 * @param t - Fixed locale translator function.
 * @returns HTML markup for the `#chat-form`.
 */
export function renderComposerForm(t: TFunction): string {
  return `
    <form
      id="chat-form"
      class="composer-form"
      hx-post="/ui/send"
      hx-target="#chat-messages"
      hx-swap="innerHTML"
      hx-encoding="multipart/form-data"
      data-mic-error="${Bun.escapeHTML(t("micPermissionError"))}"
    >
      <input
        type="file"
        id="media-input"
        name="media"
        accept="image/*,video/*,audio/*"
        hidden
      >
      <button
        type="button"
        id="attach-button"
        class="circle transparent"
        onclick="document.getElementById('media-input').click()"
        title="${Bun.escapeHTML(t("attachMedia"))}"
      >
        <i>attach_file</i>
      </button>
      <div id="composer-text-wrapper" class="field border round fill small composer-input-field">
        <input
          type="text"
          id="message-text-input"
          name="text"
          placeholder="${Bun.escapeHTML(t("messagePlaceholder"))}"
          autocomplete="off"
        >
      </div>

      <div id="voice-recording-bar" class="voice-recording-bar" style="display: none;">
        <button
          type="button"
          id="voice-cancel-btn"
          class="circle transparent error-text"
          title="${Bun.escapeHTML(t("cancelRecording"))}"
        >
          <i>delete</i>
        </button>
        <div id="voice-status" class="voice-status">
          <span class="recording-pulse"></span>
          <span id="voice-timer" class="voice-timer">00:00</span>
        </div>
        <audio id="voice-preview-audio" class="voice-preview-audio" controls style="display: none;"></audio>
        <button
          type="button"
          id="voice-stop-btn"
          class="circle transparent"
          title="${Bun.escapeHTML(t("stopRecording"))}"
        >
          <i>pause</i>
        </button>
      </div>

      <button
        type="submit"
        id="send-button"
        class="circle primary"
        title="${Bun.escapeHTML(t("sendMessage"))}"
        style="display: none;"
      >
        <i>send</i>
      </button>
      <button
        type="button"
        id="mic-button"
        class="circle primary"
        title="${Bun.escapeHTML(t("recordAudio"))}"
      >
        <i>mic</i>
      </button>
    </form>
  `;
}

/**
 * Renders the complete `<footer class="chat-composer">` element containing
 * the media preview bar and message composer form.
 *
 * @param t - Fixed locale translator function.
 * @returns HTML markup for the composer footer.
 */
export function renderComposer(t: TFunction = getTranslator()): string {
  return `
    <footer class="chat-composer">
      ${renderMediaPreviewBar(t)}
      ${renderComposerForm(t)}
    </footer>
  `;
}
