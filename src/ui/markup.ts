/**
 * WhatsApp text formatting parser and HTML renderer.
 *
 * Converts WhatsApp markup syntax (`*bold*`, `_italic_`, `~strikethrough~`,
 * `` `inline code` ``, ```` ```monospace``` ````, `> blockquote`, and
 * `* ` / `- ` bulleted lists) into safe, escaped HTML.
 *
 * @packageDocumentation
 */

/**
 * Applies inline WhatsApp formatting (`*bold*`, `_italic_`, `~strikethrough~`)
 * to a single line of already HTML-escaped text (with code placeholders).
 *
 * @param escapedLine - HTML-escaped single-line string.
 * @returns Line with inline WhatsApp tags converted to HTML elements.
 */
function formatInlineWhatsApp(escapedLine: string): string {
  return escapedLine
    .replace(
      /(?<![\p{L}\p{N}])\*(?!\s)([^*\n]+?)(?<!\s)\*(?![\p{L}\p{N}])/gu,
      "<strong>$1</strong>"
    )
    .replace(
      /(?<![\p{L}\p{N}])_(?!\s)([^_\n]+?)(?<!\s)_(?![\p{L}\p{N}])/gu,
      "<em>$1</em>"
    )
    .replace(
      /(?<![\p{L}\p{N}])~(?!\s)([^~\n]+?)(?<!\s)~(?![\p{L}\p{N}])/gu,
      "<del>$1</del>"
    );
}

/**
 * Formats a raw message string using WhatsApp's markup rules and escapes all
 * user-supplied HTML content.
 *
 * Supported syntax:
 * - `*bold*` -> `<strong>bold</strong>`
 * - `_italic_` -> `<em>italic</em>`
 * - `~strikethrough~` -> `<del>strikethrough</del>`
 * - `` `inline code` `` -> `<code class="wa-inline-code">inline code</code>`
 * - ```` ```monospace``` ```` -> `<code class="wa-monospace">...</code>` or `<pre class="wa-code-block"><code>...</code></pre>`
 * - `> quote` -> `<blockquote class="wa-quote">quote</blockquote>`
 * - `* item` / `- item` -> `<ul class="wa-list"><li>item</li></ul>`
 *
 * @param text - Raw message text.
 * @returns Safe HTML string with WhatsApp formatting applied.
 */
export function formatWhatsAppText(text: string): string {
  if (!text) return "";

  const codePlaceholders: string[] = [];
  const createPlaceholder = (html: string): string => {
    const idx = codePlaceholders.length;
    codePlaceholders.push(html);
    return `\x00WA_CODE_${idx}\x00`;
  };

  // 1. Extract triple-backtick monospace blocks first so their contents are
  // never interpreted as inline or block formatting.
  let processed = text.replace(/```([\s\S]+?)```/g, (_match, rawCode: string) => {
    if (rawCode.includes("\n")) {
      const trimmed = rawCode.replace(/^\n+|\n+$/g, "");
      return createPlaceholder(
        `<pre class="wa-code-block"><code>${Bun.escapeHTML(trimmed)}</code></pre>`
      );
    }
    return createPlaceholder(
      `<code class="wa-monospace">${Bun.escapeHTML(rawCode)}</code>`
    );
  });

  // 2. Extract single-backtick inline code spans (single-line only).
  processed = processed.replace(/`([^`\n]+)`/g, (_match, rawCode: string) =>
    createPlaceholder(
      `<code class="wa-inline-code">${Bun.escapeHTML(rawCode)}</code>`
    )
  );

  // 3. Process line-by-line for blockquotes (`> ...`) and bullet lists (`* ...` / `- ...`).
  const lines = processed.split(/\r?\n/);
  const outputBlocks: string[] = [];
  let quoteLines: string[] = [];
  let listItems: string[] = [];

  const flushQuotes = () => {
    if (quoteLines.length > 0) {
      outputBlocks.push(
        `<blockquote class="wa-quote">${quoteLines.join("\n")}</blockquote>`
      );
      quoteLines = [];
    }
  };

  const flushList = () => {
    if (listItems.length > 0) {
      outputBlocks.push(
        `<ul class="wa-list">${listItems.map((item) => `<li>${item}</li>`).join("")}</ul>`
      );
      listItems = [];
    }
  };

  for (const line of lines) {
    const quoteMatch = line.match(/^>(?: (.*)|$)/);
    if (quoteMatch && (quoteMatch[1] !== undefined || quoteLines.length > 0)) {
      flushList();
      const content = quoteMatch[1] ?? "";
      quoteLines.push(formatInlineWhatsApp(Bun.escapeHTML(content)));
      continue;
    }

    const listMatch = line.match(/^[*-]\s+(.+)$/);
    if (listMatch && listMatch[1] !== undefined) {
      flushQuotes();
      listItems.push(formatInlineWhatsApp(Bun.escapeHTML(listMatch[1])));
      continue;
    }

    flushQuotes();
    flushList();
    outputBlocks.push(formatInlineWhatsApp(Bun.escapeHTML(line)));
  }

  flushQuotes();
  flushList();

  let html = outputBlocks.join("\n");

  // 4. Restore code placeholders before collapsing block spacing so `<pre>`
  // blocks are also recognized.
  html = html.replace(/\x00WA_CODE_(\d+)\x00/g, (_match, idxStr: string) => {
    return codePlaceholders[Number(idxStr)] ?? "";
  });

  // 5. Avoid double line-breaks around block-level elements inside a
  // `white-space: pre-wrap` container.
  html = html
    .replace(/\n{1,2}(?=<(?:blockquote|pre|ul)\b)/g, "")
    .replace(/(?<=<\/(?:blockquote|pre|ul)>)\n{1,2}/g, "");

  return html;
}
