/**
 * Internationalization (i18n) module powered by `i18next`.
 *
 * Provides translations for American English (`en-US`), Brazilian Portuguese
 * (`pt-BR`), and French (`fr-FR`), resolving locales from HTTP
 * `Accept-Language` headers via `Intl.Locale`.
 *
 * @packageDocumentation
 */

import i18next, { type TFunction } from "i18next";

/**
 * Canonical BCP 47 locale tags supported by `mendel`.
 */
export type SupportedLocale = "en-US" | "pt-BR" | "fr-FR";

/**
 * American English (`en-US`) translation dictionary.
 */
export const enUS = {
  lang: "en-US",
  pageTitle: "mendel — Evolution API Test Chat",
  instanceLabel: "Instance",
  webhookLabel: "Webhook",
  none: "none",
  unconfigured: "unconfigured",
  clearConversation: "Clear conversation",
  toggleTheme: "Toggle theme",
  settingsTitle: "Webhook & Instance Settings",
  emptyTitle: "No messages yet",
  emptyDescription:
    "Messages you send here are forwarded as Evolution API webhooks to",
  imageAlt: "Image",
  attachment: "Attachment",
  edited: "(edited)",
  webhookSending: "Sending webhook...",
  webhookDelivered: "Webhook delivered",
  webhookFailed: "Webhook delivery failed",
  retryWebhook: "Retry webhook",
  previewAlt: "Preview",
  removeAttachment: "Remove attachment",
  attachMedia: "Attach image or video",
  messagePlaceholder: "Type a message or caption...",
  sendMessage: "Send message",
  configuration: "Configuration",
  webhookUrlField: "Target Webhook URL",
  webhookUrlHelper:
    "URL where MESSAGES_UPSERT payloads are sent (e.g. http://dietia:8000/whatsapp)",
  instanceNameField: "Evolution Instance Name",
  apiKeyField: "API Key (apikey / x-api-key)",
  senderNumberField: "Simulated Sender Phone Number",
  pushNameField: "Sender Push Name",
  cancel: "Cancel",
  save: "Save",
} as const;

/**
 * Union of all valid translation keys in `mendel`.
 */
export type TranslationKeys = keyof typeof enUS;

/**
 * Brazilian Portuguese (`pt-BR`) translation dictionary.
 */
export const ptBR: Record<TranslationKeys, string> = {
  lang: "pt-BR",
  pageTitle: "mendel — Chat de Teste da Evolution API",
  instanceLabel: "Instância",
  webhookLabel: "Webhook",
  none: "nenhum",
  unconfigured: "não configurado",
  clearConversation: "Limpar conversa",
  toggleTheme: "Alternar tema",
  settingsTitle: "Configurações de Webhook e Instância",
  emptyTitle: "Nenhuma mensagem ainda",
  emptyDescription:
    "As mensagens enviadas aqui são encaminhadas como webhooks da Evolution API para",
  imageAlt: "Imagem",
  attachment: "Anexo",
  edited: "(editada)",
  webhookSending: "Enviando webhook...",
  webhookDelivered: "Webhook entregue",
  webhookFailed: "Falha ao entregar webhook",
  retryWebhook: "Tentar novamente",
  previewAlt: "Pré-visualização",
  removeAttachment: "Remover anexo",
  attachMedia: "Anexar imagem ou vídeo",
  messagePlaceholder: "Digite uma mensagem ou legenda...",
  sendMessage: "Enviar mensagem",
  configuration: "Configuração",
  webhookUrlField: "URL do Webhook de Destino",
  webhookUrlHelper:
    "URL para onde os payloads MESSAGES_UPSERT são enviados (ex: http://dietia:8000/whatsapp)",
  instanceNameField: "Nome da Instância Evolution",
  apiKeyField: "Chave da API (apikey / x-api-key)",
  senderNumberField: "Número de Telefone Simulado",
  pushNameField: "Nome de Exibição do Remetente",
  cancel: "Cancelar",
  save: "Salvar",
};

/**
 * French (`fr-FR`) translation dictionary.
 */
export const frFR: Record<TranslationKeys, string> = {
  lang: "fr-FR",
  pageTitle: "mendel — Chat de test Evolution API",
  instanceLabel: "Instance",
  webhookLabel: "Webhook",
  none: "aucun",
  unconfigured: "non configuré",
  clearConversation: "Effacer la conversation",
  toggleTheme: "Changer de thème",
  settingsTitle: "Paramètres du webhook et de l'instance",
  emptyTitle: "Aucun message pour le moment",
  emptyDescription:
    "Les messages envoyés ici sont transmis en tant que webhooks Evolution API vers",
  imageAlt: "Image",
  attachment: "Pièce jointe",
  edited: "(modifié)",
  webhookSending: "Envoi du webhook...",
  webhookDelivered: "Webhook livré",
  webhookFailed: "Échec de la livraison du webhook",
  retryWebhook: "Réessayer le webhook",
  previewAlt: "Aperçu",
  removeAttachment: "Supprimer la pièce jointe",
  attachMedia: "Joindre une image ou une vidéo",
  messagePlaceholder: "Écrivez un message ou une légende...",
  sendMessage: "Envoyer le message",
  configuration: "Configuration",
  webhookUrlField: "URL du webhook cible",
  webhookUrlHelper:
    "URL vers laquelle les payloads MESSAGES_UPSERT sont envoyés (ex. http://dietia:8000/whatsapp)",
  instanceNameField: "Nom de l'instance Evolution",
  apiKeyField: "Clé API (apikey / x-api-key)",
  senderNumberField: "Numéro de téléphone simulé",
  pushNameField: "Nom d'affichage de l'expéditeur",
  cancel: "Annuler",
  save: "Enregistrer",
};

const i18nInstance = i18next.createInstance();

await i18nInstance.init({
  fallbackLng: "en-US",
  interpolation: {
    escapeValue: false,
  },
  resources: {
    "en-US": { translation: enUS },
    en: { translation: enUS },
    "pt-BR": { translation: ptBR },
    pt: { translation: ptBR },
    "fr-FR": { translation: frFR },
    fr: { translation: frFR },
  },
});

/**
 * Parses an HTTP `Accept-Language` header into an ordered list of candidate
 * BCP 47 locale tags and base languages, ending with `"en-US"` as fallback.
 *
 * @param header - Raw `Accept-Language` header value.
 * @returns Ordered array of locale tags for `i18next.getFixedT`.
 */
export function parseAcceptLanguage(header: string | null | undefined): string[] {
  if (!header) return ["en-US"];
  const candidates: string[] = [];
  for (const part of header.split(",")) {
    const rawTag = part.split(";")[0]?.trim();
    if (!rawTag || rawTag === "*") continue;
    try {
      const loc = new Intl.Locale(rawTag.replace("_", "-"));
      candidates.push(loc.baseName);
      candidates.push(loc.language);
    } catch {
      candidates.push(rawTag);
    }
  }
  candidates.push("en-US");
  return candidates;
}

/**
 * Returns a fixed `i18next` translator function (`t`) matching the provided
 * HTTP `Request` or `Accept-Language` header string.
 *
 * @param reqOrHeader - HTTP `Request`, raw `Accept-Language` string, or `null`.
 * @returns Fixed `TFunction` bound to the resolved locale.
 */
export function getTranslator(reqOrHeader?: Request | string | null): TFunction {
  const header =
    typeof reqOrHeader === "string" || reqOrHeader == null
      ? reqOrHeader
      : reqOrHeader.headers.get("accept-language");
  return i18nInstance.getFixedT(parseAcceptLanguage(header));
}
