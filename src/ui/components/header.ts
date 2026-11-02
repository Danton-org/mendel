import type { TFunction } from "i18next";
import type { MendelSettings } from "../../db";
import { getTranslator } from "../../i18n";

export function renderHeaderStatus(
  settings: MendelSettings,
  t: TFunction = getTranslator()
): string {
  const instanceLabel = Bun.escapeHTML(t("instanceLabel"));
  const instanceName = Bun.escapeHTML(settings.instanceName);
  const webhookLabel = Bun.escapeHTML(t("webhookLabel"));
  const webhookUrl = Bun.escapeHTML(settings.webhookUrl || t("none"));

  return `<span class="status-chip">${instanceLabel}: <b>${instanceName}</b> &bull; ${webhookLabel}: <code>${webhookUrl}</code></span>`;
}

export function renderHeader(
  settings: MendelSettings,
  t: TFunction = getTranslator()
): string {
  return `
    <header class="chat-header">
      <nav>
        <i>forum</i>
        <div class="max">
          <h6 class="small no-margin">mendel</h6>
          <div id="header-status">${renderHeaderStatus(settings, t)}</div>
        </div>
        <button
          type="button"
          class="circle transparent"
          title="${Bun.escapeHTML(t("clearConversation"))}"
          hx-post="/ui/clear"
          hx-target="#chat-messages"
          hx-swap="innerHTML"
        >
          <i>delete_sweep</i>
        </button>
        <button
          type="button"
          class="circle transparent"
          title="${Bun.escapeHTML(t("toggleTheme"))}"
          onclick="window.toggleTheme()"
        >
          <i id="theme-icon">dark_mode</i>
        </button>
        <button
          type="button"
          class="circle transparent"
          title="${Bun.escapeHTML(t("settingsTitle"))}"
          data-ui="#settings-dialog"
        >
          <i>settings</i>
        </button>
      </nav>
    </header>
  `;
}
