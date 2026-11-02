import type { TFunction } from "i18next";
import type { ChatMessage, MendelSettings } from "../../db";
import { getTranslator } from "../../i18n";
import { renderComposer } from "../components/composer";
import { renderHeader } from "../components/header";
import { renderChatFeed } from "../components/messages";
import { renderSettingsDialog } from "../components/settings-dialog";

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
