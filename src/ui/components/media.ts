import type { TFunction } from "i18next";
import type { ChatMessage } from "../../db";

export function renderMedia(msg: ChatMessage, t: TFunction): string {
  if (!msg.mediaType) return "";

  const src = msg.hasMediaBlob
    ? `/media/${encodeURIComponent(msg.id)}`
    : msg.mediaUrl || "";
  if (!src) return "";

  const escapedSrc = Bun.escapeHTML(src);

  switch (msg.mediaType) {
    case "image": {
      const alt = Bun.escapeHTML(msg.mediaFilename || t("imageAlt"));
      return `<img class="message-media" src="${escapedSrc}" alt="${alt}" loading="lazy">`;
    }
    case "video":
      return `<video class="message-media" src="${escapedSrc}" controls preload="metadata"></video>`;
    case "audio":
      return `<audio class="message-media" src="${escapedSrc}" controls preload="metadata"></audio>`;
    case "document": {
      const downloadName = Bun.escapeHTML(msg.mediaFilename || "file");
      const label = Bun.escapeHTML(msg.mediaFilename || t("attachment"));
      return `<p><a class="button small border round" href="${escapedSrc}" download="${downloadName}"><i>download</i><span>${label}</span></a></p>`;
    }
  }
}
