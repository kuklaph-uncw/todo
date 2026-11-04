import { escapeHtml } from "./html";
import { continuationEnd } from "./lines";

type Inline = (escaped: string) => string;
type Block = { html: string; next: number };

/**
 * A small, safe subset of Markdown as HTML, for entry text. Everything is escaped first;
 * only paragraphs, indented bullet and numbered lists, headings (offset by two, max h6),
 * bold, italic and code spans become markup. Other Markdown stays literal.
 * `inline` decorates escaped runs outside code spans, for example tag pills.
 */
export function renderEntryMarkdown(text: string, inline: Inline = (s) => s): string {
  const escaped = escapeHtml(text);
  const lines = escaped.replace(/\t/g, "    ").split("\n");
  return renderBlocks(lines, inline);
}

/** Keeps code spans literal and undecorated, applying emphasis and the inline hook everywhere else. */
function renderInline(escaped: string, inline: Inline): string {
  return escaped.split(/(`[^`\n]+`)/g).map((run, i) =>
    i % 2 ? `<code>${run.slice(1, -1)}</code>` : renderEmphasis(run, inline),
  ).join("");
}

/** Adds emphasis to escaped text; underscores cannot join letters or digits, following CommonMark. */
function renderEmphasis(escaped: string, inline: Inline): string {
  return escaped.split(/(\*\*[^*]+\*\*|\*[^*]+\*|(?<![\p{L}\p{N}])_[^_]+_(?![\p{L}\p{N}]))/gu).map((part, i) =>
    i % 2 ? wrapEmphasis(part, inline) : inline(part),
  ).join("");
}

/** Wraps an emphasis match, using its delimiter to choose bold or italic. */
function wrapEmphasis(part: string, inline: Inline): string {
  const strong = part.startsWith("**");
  const tag = strong ? "strong" : "em";
  const width = strong ? 2 : 1;
  return `<${tag}>${inline(part.slice(width, -width))}</${tag}>`;
}

const bullet = (line: string) => /^( *)([-*+]|\d+\.) (?!\[[ xX]\](?: |$))(.*)$/.exec(line);
const heading = (line: string) => /^(#{1,6}) (.*)$/.exec(line);
const fenceMarker = (line: string) => /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];

/** Renders blocks in order, advancing past exactly the lines each block consumed. */
function renderBlocks(source: string[], inline: Inline): string {
  const out: string[] = [];
  let at = 0;
  while (at < source.length) {
    const line = source[at];
    if (!line.trim()) { at++; continue; }
    const match = heading(line);
    if (match) {
      const level = Math.min(match[1].length + 2, 6);
      out.push(`<h${level}>${renderInline(match[2], inline)}</h${level}>`);
      at++;
      continue;
    }
    const block = fenceMarker(line) ? renderLiteralFence(source, at)
      : bullet(line) ? renderList(source, at, inline)
      : renderParagraph(source, at, inline);
    out.push(block.html);
    at = block.next;
  }
  return out.join("");
}

/** Keeps pasted fenced code literal, including its fences and emphasis markers. */
function renderLiteralFence(source: string[], at: number): Block {
  const fence = fenceMarker(source[at])!;
  const literal = [source[at]];
  while (++at < source.length) {
    literal.push(source[at]);
    if (fenceMarker(source[at])?.startsWith(fence)) { at++; break; }
  }
  return { html: `<p>${literal.join("<br>")}</p>`, next: at };
}

/** Groups sibling list items and renders their indented continuations as nested blocks. */
function renderList(source: string[], at: number, inline: Inline): Block {
  const first = bullet(source[at])!;
  const indent = first[1].length;
  const tag = first[2].endsWith(".") ? "ol" : "ul";
  const startNumber = Number.parseInt(first[2], 10);
  const start = tag === "ol" && startNumber !== 1 ? ` start="${startNumber}"` : "";
  const items: string[] = [];
  while (at < source.length) {
    const match = bullet(source[at]);
    if (!match || match[1].length !== indent || (match[2].endsWith(".") ? "ol" : "ul") !== tag) break;
    const end = continuationEnd(source, at + 1, indent);
    const body = [match[3], ...source.slice(at + 1, end).map((line) =>
      line.trim() ? line.slice(Math.min(indent + 2, line.search(/\S/))) : "",
    )];
    at = end;
    const html = renderBlocks(body, inline);
    items.push(`<li>${html.replace(/^<p>(.*?)<\/p>/s, "$1")}</li>`);
  }
  return { html: `<${tag}${start}>${items.join("")}</${tag}>`, next: at };
}

/** Groups consecutive text lines into a paragraph, keeping single line breaks. */
function renderParagraph(source: string[], at: number, inline: Inline): Block {
  const paragraph = [source[at++]];
  while (at < source.length) {
    const line = source[at];
    const startsBlock = bullet(line) || heading(line) || fenceMarker(line);
    if (!line.trim() || startsBlock) break;
    paragraph.push(source[at++]);
  }
  return { html: `<p>${paragraph.map((line) => renderInline(line, inline)).join("<br>")}</p>`, next: at };
}
