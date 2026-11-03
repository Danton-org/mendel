/**
 * Media parsing, MIME type inference, and HTTP response helper functions.
 *
 * @packageDocumentation
 */

import type { MediaType } from "../db";

/**
 * Result of parsing an Evolution API media field (`http(s)://` URL, `data:` URI,
 * or raw base64 string).
 */
export interface ParsedMediaResult {
  /** Decoded binary bytes when inline base64 data was provided, or `null` for external URLs. */
  data: Uint8Array | null;
  /** Resolved MIME type string. */
  mimetype: string;
  /** External HTTP(S) URL when media is referenced by URL, or `null` for inline data. */
  mediaUrl: string | null;
}

/**
 * Infers a normalized {@link MediaType} from an explicit Evolution API
 * `mediatype` string or MIME type.
 *
 * @param explicitType - Explicit `mediatype` value (e.g. `"image"`, `"video"`).
 * @param mimetype - MIME type string (e.g. `"image/png"`, `"video/mp4"`).
 * @param filename - Optional filename used to infer category by extension.
 * @returns Normalized {@link MediaType}.
 */
export function inferMediaType(
  explicitType?: string | null,
  mimetype?: string | null,
  filename?: string | null
): MediaType {
  const t = (explicitType || "").toLowerCase();
  if (t === "image" || t === "sticker") return "image";
  if (t === "video" || t === "ptv") return "video";
  if (t === "audio") return "audio";
  if (t === "document") return "document";

  const m = (mimetype || "").toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";

  const fn = (filename || "").toLowerCase();
  if (/\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(fn)) return "image";
  if (/\.(mp4|mov|avi|mkv)$/i.test(fn)) return "video";
  if (/\.(ogg|opus|mp3|wav|m4a|aac|oga|flac|weba)$/i.test(fn)) return "audio";

  return "document";
}

/**
 * Returns the default MIME type for a given {@link MediaType}.
 *
 * @param mediaType - Normalized media category.
 * @returns Default MIME type string.
 */
export function defaultMimetypeFor(mediaType: MediaType): string {
  switch (mediaType) {
    case "image":
      return "image/png";
    case "video":
      return "video/mp4";
    case "audio":
      return "audio/ogg";
    default:
      return "application/octet-stream";
  }
}

/**
 * Parses an Evolution API `media` string (HTTP URL, `data:` URI, or raw base64)
 * into binary bytes or an external URL reference.
 *
 * @param rawMedia - Input media string from the API request body.
 * @param fallbackMimetype - Fallback MIME type if none is embedded in a `data:` URI.
 * @returns Decoded binary data, resolved MIME type, and optional external URL.
 */
export function parseMediaString(
  rawMedia: string,
  fallbackMimetype: string
): ParsedMediaResult {
  const trimmed = rawMedia.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return { data: null, mimetype: fallbackMimetype, mediaUrl: trimmed };
  }

  if (trimmed.startsWith("data:")) {
    const commaIdx = trimmed.indexOf(",");
    if (commaIdx !== -1) {
      const header = trimmed.slice(5, commaIdx);
      const b64 = trimmed.slice(commaIdx + 1);
      const mime = header.split(";")[0] || fallbackMimetype;
      return {
        data: Uint8Array.fromBase64(b64.replace(/\s+/g, "")),
        mimetype: mime,
        mediaUrl: null,
      };
    }
  }

  return {
    data: Uint8Array.fromBase64(trimmed.replace(/\s+/g, "")),
    mimetype: fallbackMimetype,
    mediaUrl: null,
  };
}

/**
 * Wraps an HTML string in a UTF-8 `text/html` HTTP {@link Response}.
 *
 * @param html - Rendered HTML markup.
 * @param status - HTTP status code (defaults to `200`).
 * @returns HTTP {@link Response}.
 */
export function htmlResponse(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
