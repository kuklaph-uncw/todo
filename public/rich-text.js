// Shared by the page renderer and the browser editor. Never accepts raw HTML.
const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char],
  );

/** Shared with Electron: only absolute web URLs may leave the app. */
export function isWebUrl(value) {
  if (!/^https?:\/\//i.test(value) || /[\s\p{Cc}\\]/u.test(value)) return false;
  try {
    const url = new URL(value);
    return Boolean(url.hostname && !url.username && !url.password);
  } catch {
    return false;
  }
}

/** Any address with a scheme (t3-thread:, mailto:), on one line. Shown by its label; never opened. */
function isLinkUrl(value) {
  return /^[a-z][a-z0-9+.-]*:/i.test(value) && !/[\s\p{Cc}]/u.test(value);
}

const unescapeHtml = (value) =>
  value.replace(
    /&(?:amp|lt|gt|quot|#39);/g,
    (entity) => ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" })[entity],
  );

/** Inline destinations can contain balanced parentheses, as in a wiki article URL. */
function markdownLink(text) {
  const label = /^\[((?:\\.|[^[\]\\\n])+)\]\(/.exec(text);
  if (!label) return null;
  const start = label[0].length;
  if (text.startsWith("&lt;", start)) {
    const end = text.indexOf("&gt;)", start + 4);
    if (end < 0) return null;
    const href = unescapeHtml(text.slice(start + 4, end));
    return isWebUrl(href) || isLinkUrl(href) ? { label: label[1], href, length: end + 5 } : null;
  }
  let depth = 1;
  for (let at = label[0].length; at < text.length; at++) {
    if (text[at] === "(") depth++;
    if (text[at] === ")" && --depth === 0) {
      const href = unescapeHtml(text.slice(label[0].length, at));
      return isWebUrl(href) || isLinkUrl(href) ? { label: label[1], href, length: at + 1 } : null;
    }
  }
  return null;
}
function continuationEnd(lines, start, indent) {
  let end = start;
  for (let next = start; next < lines.length; next++) {
    if (!lines[next].trim()) continue;
    const width = /^[ \t]*/.exec(lines[next])[0].replace(/\t/g, "    ").length;
    if (width <= indent) break;
    end = next + 1;
  }
  return end;
}

/**
 * A small, safe subset of Markdown as HTML, for entry text. Everything is escaped first;
 * only paragraphs, indented bullet and numbered lists, headings (offset by two, max h6),
 * bold, italic, code spans/blocks, links and bare web addresses become markup. A link
 * with another scheme (such as t3-thread:) shows its label, since only web links leave
 * the app. Other Markdown stays literal.
 * `inline` decorates escaped runs outside code spans, for example tag pills.
 */
export function renderEntryMarkdown(text, inline = (s) => s) {
  const escaped = escapeHtml(text);
  const lines = escaped.replace(/\t/g, "    ").split("\n");
  return renderBlocks(lines, inline);
}

/** One line of Markdown, such as a todo title: inline formatting and links, never blocks. */
export function renderInlineMarkdown(text, inline = (s) => s) {
  return renderInline(escapeHtml(text), inline);
}

/**
 * A web address typed without a label. Trailing punctuation and an unmatched `)`
 * stay outside it, and one inside literal link syntax (`\[label\](address)`) stays text.
 */
function bareUrl(escaped, at) {
  if (at > 0 && (!/[\s(]/.test(escaped[at - 1]) || escaped.slice(at - 2, at) === "](")) return null;
  // The text is HTML-escaped, so a typed & is always &amp;, and < > " ' are entities that end the address.
  // A backslash before punctuation is a Markdown escape (the editor adds them before _ and *).
  let text = /^https?:\/\/(?:&amp;|\\[!-/:-@[-`{-~]|[^\s<>&\\])+/i.exec(escaped.slice(at))?.[0];
  if (!text) return null;
  for (;;) {
    // Sentence punctuation and closing emphasis stay outside; so does the ; of a trailing &amp;.
    const trimmed = text.replace(/(?:[.,:!?*_~\\]|(?<!&amp);)$/, "");
    const opens = (trimmed.match(/\(/g) ?? []).length;
    const closes = (trimmed.match(/\)/g) ?? []).length;
    const next = trimmed.endsWith(")") && closes > opens ? trimmed.slice(0, -1) : trimmed;
    if (next === text) break;
    text = next;
  }
  const html = text.replace(/\\([!-/:-@[-`{-~])/g, "$1");
  const href = unescapeHtml(html);
  return isWebUrl(href) ? { length: text.length, html, href } : null;
}

/** Keeps code spans literal and undecorated, applying emphasis and the inline hook everywhere else. */
function renderInline(escaped, inline, links = true) {
  const tokens = [];
  const openers = [];
  let plain = "";
  const flush = () => {
    if (plain) tokens.push({ html: inline(plain) });
    plain = "";
  };
  const delimiter = (token) => {
    tokens.push(token);
    while (token.canClose && token.count) {
      const index = openers.findLastIndex((opener) => opener.mark === token.mark && opener.count);
      if (index === -1) break;
      const opener = openers[index];
      const count = token.mark === "*" && opener.count >= 2 && token.count >= 2 ? 2 : 1;
      const tag = count === 2 ? "strong" : "em";
      opener.open.unshift(`<${tag}>`);
      token.close.push(`</${tag}>`);
      opener.count -= count;
      token.count -= count;
      openers.splice(index + 1); // Unmatched inner markers cannot cross this pair.
      if (!opener.count) openers.pop();
    }
    if (token.canOpen && token.count) openers.push(token);
  };
  for (let at = 0; at < escaped.length; ) {
    if (escaped[at] === "\\" && /[\\`*_#.+\-[\]]/.test(escaped[at + 1] ?? "")) {
      plain += escaped[at + 1];
      at += 2;
      continue;
    }
    const link = links && escaped[at] === "[" && escaped[at - 1] !== "!" && markdownLink(escaped.slice(at));
    if (link) {
      flush();
      const label = renderInline(link.label, (text) => text, false);
      const href = escapeHtml(link.href);
      tokens.push({
        html: isWebUrl(link.href)
          ? `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`
          : `<span class="local-link" data-href="${href}" title="${href}">${label}</span>`,
      });
      at += link.length;
      continue;
    }
    const bare = links && escaped[at] === "h" && bareUrl(escaped, at);
    if (bare) {
      flush();
      tokens.push({
        html: `<a href="${escapeHtml(bare.href)}" target="_blank" rel="noopener noreferrer" data-bare>${bare.html}</a>`,
      });
      at += bare.length;
      continue;
    }
    const code = /^`+/.exec(escaped.slice(at))?.[0];
    if (code) {
      const rest = escaped.slice(at + code.length);
      const close = [...rest.matchAll(/`+/g)].find((match) => match[0].length === code.length);
      if (close && close.index > 0 && !rest.slice(0, close.index).includes("\n")) {
        let body = rest.slice(0, close.index);
        if (body.startsWith(" ") && body.endsWith(" ") && body.trim()) body = body.slice(1, -1);
        flush();
        tokens.push({ html: `<code>${body}</code>` });
        at += code.length * 2 + close.index;
        continue;
      }
      plain += code;
      at += code.length;
      continue;
    }
    // Token names may contain underscores. Keep their spelling intact before
    // resolving emphasis, including when the whole token is bold or italic.
    let token =
      /^\[\[[^\]\n]+\]\]/.exec(escaped.slice(at))?.[0] ??
      (at === 0 || /[\s*_]/.test(escaped[at - 1]) ? /^#[\p{L}\p{N}_/-]+/u.exec(escaped.slice(at))?.[0] : null);
    if (token?.startsWith("#") && token.endsWith("_") && openers.some((opener) => opener.mark === "_"))
      token = token.slice(0, -1);
    if (token) {
      plain += token;
      at += token.length;
      continue;
    }
    const mark = /^(\*+|_)/.exec(escaped.slice(at))?.[0];
    if (mark) {
      const before = escaped[at - 1] ?? "",
        after = escaped[at + mark.length] ?? "";
      const canOpen = Boolean(after && !/\s/.test(after) && (mark !== "_" || !/[\p{L}\p{N}]/u.test(before)));
      const canClose = Boolean(before && !/\s/.test(before) && (mark !== "_" || !/[\p{L}\p{N}]/u.test(after)));
      if (!canOpen && !canClose) {
        plain += mark;
        at += mark.length;
        continue;
      }
      flush();
      delimiter({ mark: mark[0], count: mark.length, open: [], close: [], canOpen, canClose });
      at += mark.length;
      continue;
    }
    plain += escaped[at++];
  }
  flush();
  return tokens
    .map((token) => token.html ?? token.close.join("") + token.mark.repeat(token.count) + token.open.join(""))
    .join("");
}

const bullet = (line) => /^( *)([-*+]|\d+\.) (?!\[[ xX]\](?: |$))(.*)$/.exec(line);
const heading = (line) => /^(#{1,6}) (.*)$/.exec(line);
const fenceMarker = (line) => {
  const match = /^ {0,3}(`{3,}|~{3,})/.exec(line);
  return match && !(match[1][0] === "`" && line.slice(match[0].length).includes("`")) ? match[1] : undefined;
};
const closesFence = (line, fence) => {
  const match = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line);
  return Boolean(match && match[1][0] === fence[0] && match[1].length >= fence.length);
};

/** Renders blocks in order, advancing past exactly the lines each block consumed. */
function renderBlocks(source, inline) {
  const out = [];
  let at = 0;
  while (at < source.length) {
    const line = source[at];
    if (!line.trim()) {
      at++;
      continue;
    }
    const match = heading(line);
    if (match) {
      const level = Math.min(match[1].length + 2, 6);
      out.push(`<h${level}>${renderInline(match[2], inline)}</h${level}>`);
      at++;
      continue;
    }
    const block = fenceMarker(line)
      ? renderFence(source, at)
      : bullet(line)
        ? renderList(source, at, inline)
        : renderParagraph(source, at, inline);
    out.push(block.html);
    at = block.next;
  }
  return out.join("");
}

/**
 * A fenced code block. Its text stays literal: no emphasis, tags or links. An unclosed
 * fence runs to the end. The fence and info string are kept so the editor can save them back.
 */
function renderFence(source, at) {
  const open = source[at];
  const fence = fenceMarker(open);
  const indent = open.search(/\S/);
  const info = open.slice(indent + fence.length).trim();
  const body = [];
  while (++at < source.length && !closesFence(source[at], fence)) {
    body.push(source[at].replace(new RegExp(`^ {0,${indent}}`), ""));
  }
  const html = `<pre data-fence="${fence}" data-info="${info}"><code>${body.join("\n")}</code></pre>`;
  return { html, next: at + 1 };
}

/** Groups sibling list items and renders their indented continuations as nested blocks. */
function renderList(source, at, inline) {
  const first = bullet(source[at]);
  const indent = first[1].length;
  const tag = first[2].endsWith(".") ? "ol" : "ul";
  const startNumber = Number.parseInt(first[2], 10);
  const start = tag === "ol" && startNumber !== 1 ? ` start="${startNumber}"` : "";
  const items = [];
  while (at < source.length) {
    const match = bullet(source[at]);
    if (!match || match[1].length !== indent || (match[2].endsWith(".") ? "ol" : "ul") !== tag) break;
    const end = continuationEnd(source, at + 1, indent);
    const body = [
      match[3],
      ...source
        .slice(at + 1, end)
        .map((line) => (line.trim() ? line.slice(Math.min(indent + 2, line.search(/\S/))) : "")),
    ];
    at = end;
    const html = renderBlocks(body, inline);
    items.push(`<li>${html.replace(/^<p>(.*?)<\/p>/s, "$1")}</li>`);
  }
  return { html: `<${tag}${start}>${items.join("")}</${tag}>`, next: at };
}

/** Groups consecutive text lines into a paragraph, keeping single line breaks. */
function renderParagraph(source, at, inline) {
  const paragraph = [source[at++]];
  while (at < source.length) {
    const line = source[at];
    const startsBlock = bullet(line) || heading(line) || fenceMarker(line);
    if (!line.trim() || startsBlock) break;
    paragraph.push(source[at++]);
  }
  return { html: `<p>${paragraph.map((line) => renderInline(line, inline)).join("<br>")}</p>`, next: at };
}

const escapeMarkdown = (text) =>
  text
    .replace(/ /g, " ")
    // A typed web address keeps its _ and *, so it reads back as the same link.
    .split(/(https?:\/\/[^\s<>]+)/i)
    .map((part, index) => (index % 2 ? part : part.replace(/[\\*`_]/g, "\\$&")))
    .join("")
    // A text node is literal. Actual anchors serialize separately below.
    .replace(/\[/g, (bracket, at, source) =>
      source[at - 1] !== "!" && markdownLink(escapeHtml(source.slice(at))) ? "\\[" : bracket,
    )
    .replace(/(^|\n)(#{1,6} |[-+] |\d+\.)/g, (_match, lead, marker) => `${lead}${marker.replace(/[.#\-+]/, "\\$&")}`);

/** A code block's text as typed: line breaks and nested lines kept, markup dropped. */
export function codeText(node) {
  let text = "";
  for (const child of node.childNodes) {
    if (child.nodeType === 3) text += child.data;
    else if (child.hasAttribute?.("data-editor-caret")) text += codeText(child).replace(/^\u200b/, "");
    else if (child.nodeName === "BR") text += "\n";
    else if (/^(SCRIPT|STYLE|SVG|IFRAME|OBJECT)$/.test(child.nodeName)) continue;
    else if (/^(DIV|P)$/.test(child.nodeName)) text += (text && !text.endsWith("\n") ? "\n" : "") + codeText(child);
    else if (child.nodeType === 1) text += codeText(child);
  }
  return text.replace(/ /g, " ");
}

/** A fence longer than any line inside that could close it early. */
function codeBlock(pre) {
  const text = codeText(pre).replace(/\n$/, "");
  const info = (pre.dataset?.info ?? "").replace(/\s+/g, " ").trim();
  let fence = /^(`{3,}|~{3,})$/.test(pre.dataset?.fence ?? "") ? pre.dataset.fence : "```";
  if (fence[0] === "`" && info.includes("`")) fence = "~~~";
  while (text.split("\n").some((line) => closesFence(line, fence))) fence += fence[0];
  return `${fence}${info}\n${text ? `${text}\n` : ""}${fence}`;
}

/** Serialize only the supported text structure. Clipboard HTML never becomes saved HTML. */
export function editorMarkdown(node) {
  function inline(child) {
    if (child.nodeType === 3) return escapeMarkdown(child.data);
    if (child.nodeType !== 1) return "";
    if (child.hasAttribute("data-editor-caret"))
      return [...child.childNodes]
        .map(inline)
        .join("")
        .replace(/^\u200b/, "");
    if (/^(SCRIPT|STYLE|SVG|IFRAME|OBJECT)$/.test(child.nodeName)) return "";
    if (child.dataset?.token) return child.dataset.token;
    if (child.nodeName === "BR") return "\n";
    if (child.nodeName === "CODE") {
      let fence = "`";
      while (child.textContent.includes(fence)) fence += "`";
      const text = child.textContent;
      const pad =
        text.startsWith("`") || text.endsWith("`") || (text.startsWith(" ") && text.endsWith(" ") && text.trim());
      return `${fence}${pad ? " " : ""}${text}${pad ? " " : ""}${fence}`;
    }
    const text = [...child.childNodes].map(inline).join("");
    // A link this app shows by its label (data-href) keeps its address too.
    const href = (child.nodeName === "A" ? child.getAttribute("href") : null) ?? child.getAttribute("data-href") ?? "";
    if ((child.nodeName === "A" && isWebUrl(href)) || (child.hasAttribute("data-href") && isLinkUrl(href))) {
      // An address typed without a label stays bare.
      if (child.hasAttribute("data-bare") && child.textContent === href) return href;
      const label = text.replace(/(?<!\\)[[\]]/g, "\\$&");
      const link = `[${label}](${href})`;
      const escaped = escapeHtml(link);
      // Angle brackets keep an unbalanced parenthesis in a pasted URL inside its destination.
      return markdownLink(escaped)?.length === escaped.length
        ? link
        : `[${label}](<${href.replace(/</g, "%3C").replace(/>/g, "%3E")}>)`;
    }
    const mark = /^(B|STRONG)$/.test(child.nodeName) ? "**" : /^(I|EM)$/.test(child.nodeName) ? "*" : "";
    // Whitespace stays outside marks, which Markdown interprets consistently.
    if (mark && text.trim())
      return text.replace(
        /^(\s*)([\s\S]*?)(\s*)$/,
        (_m, before, body, after) => `${before}${mark}${body}${mark}${after}`,
      );
    return text;
  }
  function list(element) {
    const start = Number(element.getAttribute("start")) || 1;
    return [...element.children]
      .filter((item) => item.nodeName === "LI")
      .map((item, index) => {
        const prefix = element.nodeName === "OL" ? `${start + index}. ` : "- ";
        const body = blocks(item).split("\n");
        return prefix + body.map((line, i) => (i && line ? " ".repeat(prefix.length) + line : line)).join("\n");
      })
      .join("\n");
  }
  function blocks(parent) {
    const parts = [];
    let run = "";
    const flush = () => {
      if (run) parts.push(run);
      run = "";
    };
    for (const child of parent.childNodes) {
      const tag = child.nodeName;
      if (/^(P|DIV|H[1-6]|UL|OL|PRE|BLOCKQUOTE|SECTION|ARTICLE|TABLE|TBODY|TR|TD|TH|HTML|BODY)$/.test(tag)) {
        flush();
        if (/^(UL|OL)$/.test(tag)) parts.push(list(child));
        else if (tag === "PRE") parts.push(codeBlock(child));
        else if (/^H[1-6]$/.test(tag))
          parts.push(
            `${"#".repeat(Number(tag[1]) < 3 ? Number(tag[1]) : Number(tag[1]) - 2)} ${[...child.childNodes].map(inline).join("")}`,
          );
        else parts.push(blocks(child));
      } else run += inline(child);
    }
    flush();
    return parts.join("\n\n");
  }
  return blocks(node).replace(/\n+$/, "");
}
