/**
 * Configuration modal dialog UI components for editing webhook and instance
 * settings.
 *
 * @packageDocumentation
 */

import type { TFunction } from "i18next";
import type { MendelSettings } from "../../db";
import { getTranslator } from "../../i18n";

/**
 * Properties for rendering a single Beer CSS input field inside the settings
 * dialog.
 */
export interface SettingsFieldProps {
  /** HTML `name` attribute of the input field. */
  name: string;
  /** Localized field label. */
  label: string;
  /** Current field value. */
  value: string;
  /** Input type (`"text"` or `"url"`). */
  type?: "text" | "url";
  /** Whether the input is required. */
  required?: boolean;
  /** Optional helper caption rendered below the input. */
  helper?: string;
}

/**
 * Renders a labeled Beer CSS form field for the settings modal dialog.
 *
 * @param props - Field configuration properties.
 * @returns HTML markup for the `.field` element.
 */
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

/**
 * Renders the `<dialog id="settings-dialog">` modal allowing users to update
 * the target webhook URL, Evolution API instance name, API key, and simulated
 * sender identity.
 *
 * @param settings - Current application settings.
 * @param t - Fixed locale translator function.
 * @returns HTML markup for the settings dialog.
 */
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
