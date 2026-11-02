import type { TFunction } from "i18next";
import type { MendelSettings } from "../../db";
import { getTranslator } from "../../i18n";

interface SettingsFieldProps {
  name: string;
  label: string;
  value: string;
  type?: "text" | "url";
  required?: boolean;
  helper?: string;
}

export function renderSettingsField({
  name,
  label,
  value,
  type = "text",
  required = false,
  helper,
}: SettingsFieldProps): string {
  const reqAttr = required ? " required" : "";
  const helperHtml = helper
    ? `<span class="helper">${Bun.escapeHTML(helper)}</span>`
    : "";

  return `
    <div class="field label border round">
      <input type="${type}" name="${Bun.escapeHTML(name)}" value="${Bun.escapeHTML(value)}"${reqAttr}>
      <label>${Bun.escapeHTML(label)}</label>
      ${helperHtml}
    </div>
  `;
}

export function renderSettingsDialog(
  settings: MendelSettings,
  t: TFunction = getTranslator()
): string {
  const fields = [
    renderSettingsField({
      name: "webhookUrl",
      type: "url",
      label: t("webhookUrlField"),
      value: settings.webhookUrl,
      required: true,
      helper: t("webhookUrlHelper"),
    }),
    renderSettingsField({
      name: "instanceName",
      label: t("instanceNameField"),
      value: settings.instanceName,
      required: true,
    }),
    renderSettingsField({
      name: "apiKey",
      label: t("apiKeyField"),
      value: settings.apiKey,
    }),
    renderSettingsField({
      name: "senderNumber",
      label: t("senderNumberField"),
      value: settings.senderNumber,
      required: true,
    }),
    renderSettingsField({
      name: "pushName",
      label: t("pushNameField"),
      value: settings.pushName,
      required: true,
    }),
  ].join("\n");

  return `
    <dialog id="settings-dialog" class="round medium-width">
      <h5>${Bun.escapeHTML(t("configuration"))}</h5>
      <form
        hx-post="/ui/settings"
        hx-target="#header-status"
        hx-swap="innerHTML"
        onsubmit="if (window.ui) window.ui('#settings-dialog');"
      >
        ${fields}
        <nav class="right-align no-space">
          <button type="button" class="transparent link" data-ui="#settings-dialog">
            ${Bun.escapeHTML(t("cancel"))}
          </button>
          <button type="submit" class="primary round">
            ${Bun.escapeHTML(t("save"))}
          </button>
        </nav>
      </form>
    </dialog>
  `;
}
