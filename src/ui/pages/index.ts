/**
 * Full-page HTML layout renderer for the `mendel` chat interface.
 *
 * @packageDocumentation
 */

import type { TFunction } from "i18next";
import type { ChatMessage, MendelSettings } from "../../db";
import { getTranslator } from "../../i18n";
import { renderComposer } from "../components/composer";
import { renderHeader } from "../components/header";
import { renderChatFeed } from "../components/messages";
import { renderSettingsDialog } from "../components/settings-dialog";

/**
 * Renders the document `<head>` element linking the bundled stylesheet and
 * script assets.
 *
 * @param t - Fixed locale translator function.
 * @returns HTML markup for the `<head>` element.
 */
export function renderHead(t: TFunction): string {
  return `
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>${Bun.escapeHTML(t("pageTitle"))}</title>
      <link rel="stylesheet" href="/assets/index.css">
      <script type="module" src="/assets/index.js"></script>
    </head>
  `;
}

/**
 * Renders the complete HTML5 document for the `mendel` web chat interface by
 * composing the head, header, scrollable message feed, composer footer, and
 * settings dialog.
 *
 * @param messages - Chronological array of chat messages.
 * @param settings - Current application settings.
 * @param t - Fixed locale translator function.
 * @returns Complete HTML document string.
 */
export function renderPage(
  messages: ChatMessage[],
  settings: MendelSettings,
  t: TFunction = getTranslator()
): string {
  return `<!doctype html>
<html lang="${Bun.escapeHTML(t("lang"))}" class="light">
  ${renderHead(t)}
  <body class="light">
    <div class="app-layout">
      ${renderHeader(settings, t)}
      ${renderChatFeed(messages, settings, t)}
      ${renderComposer(t)}
    </div>
    ${renderSettingsDialog(settings, t)}
  </body>
</html>`;
}
