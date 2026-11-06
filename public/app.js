import { renderEntryMarkdown, editorMarkdown, codeText } from "./rich-text.js";

// Progressive enhancement only. Every form and link works without this file;
// with it, form posts update the page in place, keyboard shortcuts work, and
// todos and subtasks can be reordered.
(() => {
  const isTyping = (el) =>
    el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

  // ---- Per-page setup (runs on load and after every in-place swap) --------

  function initPage(root) {
    // Drafts: unsent capture text survives a reload, per day.
    root.querySelectorAll("textarea[data-draft]").forEach((textarea) => {
      const key = textarea.dataset.draft;
      const saved = localStorage.getItem(key);
      if (saved && !textarea.value) textarea.value = saved;
      textarea.addEventListener("input", () => {
        if (textarea.value.trim()) localStorage.setItem(key, textarea.value);
        else localStorage.removeItem(key);
      });
    });

    // Focus mode needs this script, so its button only shows when it runs.
    // Posting from focus mode swaps the page, which ends it.
    root.querySelectorAll("[data-focus-mode]").forEach((button) => {
      button.hidden = false;
    });
    releaseFocusMode();

    root.querySelectorAll('[data-live-search] button[type="submit"]').forEach((button) => {
      button.hidden = true;
    });

    // Subtask lists stay open or closed as the user left them, across updates and pages, for this window.
    const openLists = () => new Set(JSON.parse(sessionStorage.getItem("open-subtasks") || "[]"));
    root.querySelectorAll("details[data-keep-open]").forEach((details) => {
      const button = document.querySelector(`button[data-subtasks="${details.id}"]`);
      if (button) button.hidden = false;
      if (openLists().has(details.id)) details.open = true;
      button?.setAttribute("aria-expanded", String(details.open));
      details.addEventListener("toggle", () => {
        button?.setAttribute("aria-expanded", String(details.open));
        const open = openLists();
        if (details.open) open.add(details.id);
        else open.delete(details.id);
        sessionStorage.setItem("open-subtasks", JSON.stringify([...open]));
      });
    });

    // After drafts, so a restored draft shows up with its pills.
    const data = document.getElementById("composer-data");
    if (data) composerData = JSON.parse(data.textContent);
    root.querySelectorAll("input[data-composer], textarea:not([readonly])").forEach(enhanceComposer);

    // Settings › Updates arrives with each page; the rail's state fills it in.
    renderUpdates();
  }

  // ---- Inline #tags and /goals --------------------------------------------
  // A field marked data-composer gets an editor in its place where tags and
  // goal links show as pills. The field stays in the form, hidden, and always
  // holds the plain text that gets saved ("#tag", "[[goal-slug]]").

  let composerData = { tags: [], goals: [] };
  let editorCount = 0;
  const goalFor = (slug) => composerData.goals.find((goal) => goal.slug === slug);
  const escapeHtml = (text) =>
    text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  // Obsidian ignores number-only hashtags ("PR #892"), and so does the vault.
  const isTagName = (name) => !/^\d+$/.test(name);

  // Same tag and link syntax as src/vault/format.ts. Links with a |label stay text.
  const TOKEN_RE = /(^|\s)#([\p{L}\p{N}_/-]+)|\[\[([^\]|\n]+)\]\]/gu;
  // "#rev" or "/rel" just before the caret, at the start of a word.
  const TRIGGER_RE = /(?:^|\s)(?:#([\p{L}\p{N}_/-]*)|\/([\p{L}\p{N}_-]*))$/u;
  // "#tag " or "[[slug]] " typed by hand, just before the caret.
  const TYPED_RE = /(?:^|\s)(#([\p{L}\p{N}_/-]+)|\[\[([^\]|\n]+)\]\])\s$/u;

  function pillHtml(kind, value) {
    if (kind === "tag") {
      return `<span class="pill pill-tag" contenteditable="false" data-token="#${escapeHtml(value)}">#${escapeHtml(value)}</span>`;
    }
    const goal = goalFor(value);
    const title = goal ? `[[${value}]]` : "No goal has this link, so this doesn't count toward a goal.";
    return `<span class="pill pill-goal${goal ? "" : " unknown"}" contenteditable="false" data-token="[[${escapeHtml(value)}]]" title="${escapeHtml(title)}">${escapeHtml(goal?.title ?? value)}</span>`;
  }

  /**
   * Plain text to editor HTML: tags and goal links become pills. `joinsWord`
   * means the text lands right after a non-space, so a leading "#x" isn't a tag.
   */
  function textToHtml(text, joinsWord = false) {
    let html = "";
    let last = 0;
    for (const match of text.matchAll(TOKEN_RE)) {
      const [, lead = "", tag, slug] = match;
      if (tag !== undefined && (!isTagName(tag) || (joinsWord && match.index === 0 && lead === ""))) continue;
      const start = match.index + lead.length;
      html +=
        escapeHtml(text.slice(last, start)) +
        (tag !== undefined ? pillHtml("tag", tag) : pillHtml("goal", slug.trim()));
      last = match.index + match[0].length;
    }
    return (html + escapeHtml(text.slice(last))).replace(/\n/g, "<br>");
  }

  /** Editor contents back to the plain text that gets saved. */
  function editorText(node) {
    let text = "";
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) text += child.data;
      else if (child.dataset?.token) text += child.dataset.token;
      else if (child.nodeName === "BR") text += "\n";
      else if (/^(DIV|P)$/.test(child.nodeName)) text += (text && !text.endsWith("\n") ? "\n" : "") + editorText(child);
      else text += editorText(child);
    }
    return text.replace(/\u00a0/g, " ");
  }

  /** Saved text from the start of the editor up to a point, pills included. */
  function textBefore(editor, container, offset) {
    const range = document.createRange();
    range.setStart(editor, 0);
    range.setEnd(container, offset);
    return editorText(range.cloneContents());
  }

  /** The text node holding the caret, and all the text before the caret. */
  function caretText(editor) {
    const selection = getSelection();
    const node = selection.anchorNode;
    if (!selection.isCollapsed || node?.nodeType !== Node.TEXT_NODE || !editor.contains(node)) return null;
    if (node.parentElement.closest(".pill")) return null;
    const offset = selection.anchorOffset;
    return { node, offset, before: textBefore(editor, node, offset) };
  }

  /**
   * Swaps node.data[start..end] (and one space after it, if any) for a pill
   * and a space, leaving the caret after the space. insertHTML keeps it on
   * the undo stack.
   */
  function insertPill(node, start, end, kind, value) {
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, /^[ \u00a0]/.test(node.data.slice(end)) ? end + 1 : end);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.execCommand("insertHTML", false, `${pillHtml(kind, value)}&nbsp;`);
  }

  // ---- The suggestion list, shared by every editor on the page ----

  const suggestBox = document.createElement("ul");
  suggestBox.className = "suggest";
  suggestBox.id = "suggest";
  suggestBox.setAttribute("role", "listbox");
  suggestBox.hidden = true;
  document.body.append(suggestBox);
  let suggesting = null; // { editor, items, index, pick }

  function suggestions(isTag, query) {
    const q = query.toLowerCase();
    if (isTag) {
      const items = composerData.tags
        .filter(([name]) => name.includes(q))
        .sort((a, b) => b[0].startsWith(q) - a[0].startsWith(q))
        .slice(0, 7)
        .map(([name, count]) => ({ kind: "tag", value: name, label: `#${name}`, note: `${count}×` }));
      if (q && isTagName(q) && !composerData.tags.some(([name]) => name === q)) {
        items.push({ kind: "tag", value: q, label: `#${q}`, note: "new tag" });
      }
      return items;
    }
    // Match the start of a word, so "/api" doesn't pick "Rapid delivery".
    const startsWord = (goal) =>
      goal.slug.startsWith(q) ||
      `${goal.title} ${goal.slug}`
        .toLowerCase()
        .split(/[\s-]+/)
        .some((word) => word.startsWith(q));
    return composerData.goals
      .filter((goal) => goal.active && startsWord(goal))
      .map((goal) => ({ kind: "goal", value: goal.slug, label: goal.title, note: `[[${goal.slug}]]` }));
  }

  /** With no items, shows `empty` as a note so the "#" or "/" visibly did something. */
  function showSuggestions(editor, items, rect, heading, pick, empty) {
    hideSuggestions();
    suggestBox.innerHTML =
      `<li class="suggest-head" role="presentation">${heading}</li>` +
      (items.length === 0
        ? `<li class="suggest-empty" role="presentation">${escapeHtml(empty)}</li>`
        : items
            .map(
              (item, i) =>
                `<li role="option" id="suggest-${i}" class="suggest-${item.kind}" aria-selected="${i === 0}"><span class="suggest-label">${escapeHtml(item.label)}</span><span class="suggest-note">${escapeHtml(item.note)}</span></li>`,
            )
            .join(""));
    suggestBox.hidden = false;
    // Below the caret, or above it when there's no room.
    const below = rect.bottom + 6;
    const fits = below + suggestBox.offsetHeight <= innerHeight;
    suggestBox.style.top = `${fits ? below : rect.top - suggestBox.offsetHeight - 6}px`;
    suggestBox.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - suggestBox.offsetWidth - 8))}px`;
    if (items.length === 0) return;
    suggesting = { editor, items, index: 0, pick };
    editor.setAttribute("aria-activedescendant", "suggest-0");
  }

  function hideSuggestions() {
    suggesting?.editor.removeAttribute("aria-activedescendant");
    suggesting = null;
    suggestBox.hidden = true;
  }

  function highlightSuggestion(index) {
    suggesting.index = (index + suggesting.items.length) % suggesting.items.length;
    suggestBox.querySelectorAll('[role="option"]').forEach((option, i) => {
      option.setAttribute("aria-selected", String(i === suggesting.index));
    });
    suggesting.editor.setAttribute("aria-activedescendant", `suggest-${suggesting.index}`);
  }

  function pickSuggestion() {
    const { items, index, pick } = suggesting;
    hideSuggestions();
    pick(items[index]);
  }

  suggestBox.addEventListener("mousedown", (event) => {
    event.preventDefault(); // keep focus (and the caret) in the editor
    const option = event.target instanceof Element ? event.target.closest('[role="option"]') : null;
    if (!option || !suggesting) return;
    suggesting.index = Number(option.id.replace("suggest-", ""));
    pickSuggestion();
  });
  addEventListener("scroll", () => !suggestBox.hidden && hideSuggestions(), true);
  addEventListener("resize", () => !suggestBox.hidden && hideSuggestions());

  /** Opens, updates or closes the list for the "#..." or "/..." before the caret. */
  function checkTrigger(editor) {
    const at = caretText(editor);
    const match = at && TRIGGER_RE.exec(at.before);
    // Only at the end of a word, so arrowing into "/docs" doesn't open the list.
    if (!match || /^[^\s\u00a0]/.test(at.node.data.slice(at.offset))) return hideSuggestions();
    const isTag = match[1] !== undefined;
    const query = isTag ? match[1] : match[2];
    const start = at.offset - query.length - 1;
    if (start < 0) return hideSuggestions(); // the "#" is in another text node
    const range = document.createRange();
    range.setStart(at.node, start);
    range.setEnd(at.node, at.offset);
    const empty = isTag
      ? query
        ? "Number-only tags like #123 aren't tags."
        : "Type a name for a new tag."
      : composerData.goals.some((goal) => goal.active)
        ? `No active goal matches “${query}”.`
        : "No active goals yet. Add one on the Goals page.";
    showSuggestions(
      editor,
      suggestions(isTag, query),
      range.getBoundingClientRect(),
      isTag ? "Tags" : "Goals",
      (item) => insertPill(at.node, start, at.offset, item.kind, item.value),
      empty,
    );
  }

  /** Turns a hand-typed "#tag " or "[[slug]] " into a pill once the space is typed. */
  function pillTyped(editor) {
    const at = caretText(editor);
    const match = at && TYPED_RE.exec(at.before);
    if (!match || (match[2] !== undefined && !isTagName(match[2]))) return;
    const end = at.offset - 1; // the typed space goes too; insertPill adds it back
    if (end - match[1].length < 0) return;
    insertPill(
      at.node,
      end - match[1].length,
      end,
      match[2] !== undefined ? "tag" : "goal",
      (match[2] ?? match[3]).trim(),
    );
  }

  // ---- Formatting strip: hidden until asked for, open or closed for every editor at once ----

  const FORMATTING_KEY = "formatting-open";
  const CHEVRON =
    '<svg class="icon chevron" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 14.5l5-5 5 5"/></svg>';
  const formattingOpen = () => localStorage.getItem(FORMATTING_KEY) === "1";

  function setFormatting(open) {
    if (open) localStorage.setItem(FORMATTING_KEY, "1");
    else localStorage.removeItem(FORMATTING_KEY);
    document.querySelectorAll(".composer-box").forEach((box) => {
      const toolbar = box.querySelector(".format-toolbar");
      if (!toolbar) return;
      // Hiding the button that has focus would drop focus to the page; keep it in the text.
      if (!open && toolbar.contains(document.activeElement)) box.querySelector(".composer").focus();
      toolbar.hidden = !open;
      box.querySelector(".lens").setAttribute("aria-expanded", String(open));
    });
  }

  function enhanceComposer(field) {
    const single = field instanceof HTMLInputElement;
    const tokens = field.hasAttribute("data-composer");
    let sourceMode = false;
    let literalPaste = false;
    let lastRange = null;
    const richHtml = (text) => {
      const content = document.createElement("div");
      content.innerHTML = renderEntryMarkdown(text);
      if (tokens) {
        const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
        const nodes = [];
        while (walker.nextNode()) if (!walker.currentNode.parentElement.closest("code")) nodes.push(walker.currentNode);
        for (const node of nodes) {
          const template = document.createElement("template");
          template.innerHTML = textToHtml(node.data);
          node.replaceWith(template.content);
        }
      }
      return content;
    };
    const editor = document.createElement("div");
    editor.className = single ? "composer is-single" : "composer";
    editor.contentEditable = "true";
    editor.spellcheck = true;
    editor.setAttribute("role", "textbox");
    if (!single) editor.setAttribute("aria-multiline", "true");
    if (tokens) {
      editor.setAttribute("aria-autocomplete", "list");
      editor.setAttribute("aria-controls", "suggest");
    }
    const labelledBy = field.getAttribute("aria-labelledby");
    if (labelledBy) editor.setAttribute("aria-labelledby", labelledBy);
    else editor.setAttribute("aria-label", field.labels?.[0]?.textContent.trim() || field.placeholder);
    editor.dataset.placeholder = field.placeholder;
    const required = field.required;
    if (required) editor.setAttribute("aria-required", "true");
    // The editor takes over the field's id and shortcut key, so focus code finds it.
    for (const name of ["id", "data-shortcut"]) {
      if (!field.hasAttribute(name)) continue;
      editor.setAttribute(name, field.getAttribute(name));
      field.removeAttribute(name);
    }
    if (!editor.id) editor.id = `writer-${++editorCount}`;
    const hadFocus = document.activeElement === field || field.autofocus;
    field.hidden = true;
    field.required = false; // a hidden field can't show the browser's "fill this in" bubble
    field.after(editor);
    if (!single) sourceMode = editorMarkdown(richHtml(field.value)) !== field.value;
    const showContent = () => {
      editor.classList.toggle("is-source", sourceMode);
      editor.classList.toggle("is-rich", !single && !sourceMode);
      editor.innerHTML = single
        ? textToHtml(field.value.replace(/\s*\n\s*/g, " "))
        : sourceMode
          ? escapeHtml(field.value).replace(/\n/g, "<br>")
          : richHtml(field.value).innerHTML || "<p><br></p>";
    };
    showContent();

    const rememberSelection = () => {
      const selection = getSelection();
      if (selection.rangeCount && editor.contains(selection.anchorNode) && editor.contains(selection.focusNode))
        lastRange = selection.getRangeAt(0).cloneRange();
    };

    const sync = () => {
      const text = single || sourceMode ? editorText(editor).replace(/\n+$/, "") : editorMarkdown(editor);
      editor.classList.toggle("is-empty", text === "");
      if (text === field.value) return;
      field.value = text;
      field.dispatchEvent(new Event("input", { bubbles: true })); // saves the draft
    };
    editor.classList.toggle("is-empty", !field.value);

    let toolbar;
    let lens;
    let sourceNote;
    // Inside the editor: the element matching `selector` around the caret, if any.
    const around = (selector) => {
      const node = getSelection().anchorNode;
      const found = (node?.nodeType === Node.TEXT_NODE ? node.parentElement : node)?.closest?.(selector);
      return found && editor.contains(found) && found !== editor ? found : null;
    };
    const inlineCode = () => !around("pre") && around("code");
    const runFormat = (command, value) => {
      if (command === "source") {
        if (sourceMode && editorMarkdown(richHtml(field.value)) !== field.value) {
          sourceNote.hidden = false;
          return;
        }
        sourceMode = !sourceMode;
        showContent();
        sourceNote.hidden = !sourceMode;
        focusAtEnd(editor);
      } else {
        if (sourceMode) return;
        editor.focus();
        if (lastRange && editor.contains(lastRange.commonAncestorContainer)) {
          getSelection().removeAllRanges();
          getSelection().addRange(lastRange);
        }
        const pre = around("pre");
        if (command === "codeblock") {
          if (pre) {
            // A plain paragraph, not inline code: unwrap the code element first.
            pre.querySelectorAll("code").forEach((code) => {
              code.replaceWith(...code.childNodes);
            });
            getSelection().selectAllChildren(pre);
            document.execCommand("formatBlock", false, "p");
          } else document.execCommand("formatBlock", false, "pre");
        } else if (pre || (command !== "code" && inlineCode())) return;
        else if (command === "code") {
          const selection = getSelection();
          const parent = inlineCode();
          if (parent) {
            const range = document.createRange();
            range.selectNode(parent);
            selection.removeAllRanges();
            selection.addRange(range);
            document.execCommand("insertHTML", false, escapeHtml(parent.textContent));
          } else if (!selection.isCollapsed) {
            document.execCommand("insertHTML", false, `<code>${escapeHtml(selection.toString())}</code>&nbsp;`);
          }
        } else document.execCommand(command, false, value);
        sync();
        rememberSelection();
      }
      updateToolbar();
    };
    /** The format at the caret, shown on the Aa button so a hidden strip hides nothing. */
    const formatName = () => {
      if (sourceMode) return "MD";
      const block = around("pre, li, h3, h4, h5, h6");
      if (!block) return "Aa";
      if (block.nodeName === "PRE") return "{ }";
      if (block.nodeName === "LI") return block.parentElement.nodeName === "OL" ? "1." : "•";
      return { H3: "H1", H4: "H2" }[block.nodeName] ?? "H3";
    };
    const updateToolbar = () => {
      if (!toolbar) return;
      const face = lens.querySelector(".lens-face");
      face.textContent = formatName();
      face.classList.toggle("is-format", face.textContent !== "Aa");
      const pre = Boolean(around("pre"));
      const code = Boolean(inlineCode());
      for (const button of toolbar.querySelectorAll("button")) {
        const command = button.dataset.command;
        const allowed = command === "source" || (pre ? command === "codeblock" : !code || command === "code");
        button.setAttribute("aria-disabled", String(sourceMode ? command !== "source" : !allowed));
        const active =
          command === "source"
            ? sourceMode
            : command === "codeblock"
              ? pre
              : command === "code"
                ? code
                : !pre &&
                  (command === "formatBlock"
                    ? document.queryCommandValue(command).toLowerCase() === button.dataset.value
                    : document.queryCommandState(command));
        button.setAttribute("aria-pressed", String(command === "source" ? sourceMode : !sourceMode && active));
      }
    };
    if (!single) {
      let box = field.closest(".composer-box");
      if (!box) {
        box = document.createElement("div");
        box.className = "composer-box";
        field.before(box);
        box.append(field, editor);
      }
      let bar = box.querySelector(".composer-bar");
      if (!bar) {
        bar = document.createElement("div");
        bar.className = "composer-bar";
        box.append(bar);
      }
      toolbar = document.createElement("div");
      toolbar.className = "format-toolbar";
      toolbar.id = `${editor.id}-format`;
      toolbar.hidden = !formattingOpen();
      toolbar.setAttribute("role", "toolbar");
      toolbar.setAttribute("aria-label", "Formatting");
      toolbar.setAttribute("aria-controls", editor.id);
      // [text, name, command, value, shortcut, what to type instead]; null starts a new group.
      const formats = [
        ["B", "Bold", "bold", null, "Ctrl+B"],
        ["I", "Italic", "italic", null, "Ctrl+I"],
        ["‹›", "Inline code", "code", null, "Ctrl+E", "`code`"],
        null,
        ["H1", "Heading", "formatBlock", "h3", "Ctrl+Alt+1", "# then space"],
        ["H2", "Subheading", "formatBlock", "h4", "Ctrl+Alt+2", "## then space"],
        ["¶", "Normal text", "formatBlock", "p", "Ctrl+Alt+0"],
        null,
        ["•", "Bulleted list", "insertUnorderedList", null, "Ctrl+Shift+8", "* then space"],
        ["1.", "Numbered list", "insertOrderedList", null, "Ctrl+Shift+7", "1. then space"],
        ["{ }", "Code block", "codeblock", null, null, "``` then Enter"],
        null,
        ["MD", "Markdown source", "source"],
      ];
      for (const format of formats) {
        if (!format) {
          toolbar.insertAdjacentHTML("beforeend", '<span class="format-sep" aria-hidden="true"></span>');
          continue;
        }
        const [text, label, command, value, keys, typed] = format;
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = text;
        button.className = "format-button";
        button.setAttribute("aria-label", label);
        // A reminder on hover; the shortcuts dialog lists them all.
        button.title = [label, keys, typed && `or type ${typed}`].filter(Boolean).join(" · ");
        button.tabIndex = toolbar.querySelector("button") ? -1 : 0;
        button.dataset.command = command;
        if (value) button.dataset.value = value;
        button.addEventListener("mousedown", (event) => event.preventDefault());
        button.addEventListener("click", () => {
          if (button.getAttribute("aria-disabled") !== "true") runFormat(command, value);
        });
        toolbar.append(button);
      }
      toolbar.addEventListener("keydown", (event) => {
        const buttons = [...toolbar.querySelectorAll("button")];
        let next = buttons.indexOf(document.activeElement);
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          editor.focus();
          return;
        }
        if (!/^(ArrowLeft|ArrowRight|Home|End)$/.test(event.key)) return;
        event.preventDefault();
        next =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? buttons.length - 1
              : (next + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
        buttons.forEach((button, index) => {
          button.tabIndex = index === next ? 0 : -1;
        });
        buttons[next].focus();
      });
      // Between the text and the bar, so it reads as part of the text box.
      box.insertBefore(toolbar, bar);

      lens = document.createElement("button");
      lens.type = "button";
      lens.className = "lens";
      lens.setAttribute("aria-label", "Formatting");
      lens.setAttribute("aria-expanded", String(!toolbar.hidden));
      lens.setAttribute("aria-controls", toolbar.id);
      lens.setAttribute("aria-keyshortcuts", "Control+Shift+X");
      lens.title = "Formatting · Ctrl+Shift+X";
      lens.innerHTML = `<span class="lens-face" aria-hidden="true">Aa</span>${CHEVRON}`;
      // Keeps the caret and any selection in the text.
      lens.addEventListener("mousedown", (event) => event.preventDefault());
      lens.addEventListener("click", () => setFormatting(toolbar.hidden));
      if (bar.children.length) bar.prepend(Object.assign(document.createElement("span"), { className: "lens-sep" }));
      bar.prepend(lens);
      box.addEventListener("keydown", (event) => {
        if ((event.ctrlKey || event.metaKey) && event.shiftKey && !event.altKey && event.key.toLowerCase() === "x") {
          event.preventDefault();
          setFormatting(toolbar.hidden);
        }
      });

      sourceNote = document.createElement("p");
      sourceNote.className = "editor-source-note";
      sourceNote.textContent =
        "Markdown source. Existing syntax is kept as written; visual mode is available when it can preserve this text.";
      sourceNote.hidden = !sourceMode;
      box.after(sourceNote);
      const selectionChanged = () => {
        if (!editor.isConnected) {
          document.removeEventListener("selectionchange", selectionChanged);
          return;
        }
        rememberSelection();
        updateToolbar();
      };
      document.addEventListener("selectionchange", selectionChanged);
      updateToolbar();
    }

    // Typed Markdown: "* ", "1. " or "# " at the start of a line, `code`, and ``` then Enter.
    // Each change takes one or two editing steps, so Backspace right after can undo exactly it.
    let undoSteps = 0;
    const selectText = (node, start, end) => {
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, end);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
    };
    /** The caret's text node and the line typed before it, when that line is all in this node. */
    const lineAtCaret = () => {
      const at = caretText(editor);
      if (!at || around("li, h3, h4, h5, h6, pre, code")) return null;
      const line = at.before.split("\n").pop();
      return at.offset >= line.length ? { ...at, line: line.replace(/ /g, " ") } : null;
    };
    const typedBlock = () => {
      const at = lineAtCaret();
      const marker = at && /^([*+-]|\d{1,9}\.|#{1,3}) $/.exec(at.line)?.[1];
      if (!marker) return false;
      selectText(at.node, at.offset - at.line.length, at.offset);
      document.execCommand("delete");
      if (marker.startsWith("#")) document.execCommand("formatBlock", false, `h${marker.length + 2}`);
      else document.execCommand(marker.endsWith(".") ? "insertOrderedList" : "insertUnorderedList");
      const item = around("li");
      const start = Number.parseInt(marker, 10);
      if (start > 1 && item?.parentElement.nodeName === "OL" && !item.previousElementSibling)
        item.parentElement.start = start;
      undoSteps = 2;
      return true;
    };
    const typedCode = () => {
      const at = caretText(editor);
      const match =
        at && !around("pre, code") && /(?:^|[^`])`([^`]*[^`\s][^`]*)`$/.exec(at.node.data.slice(0, at.offset));
      if (!match) return false;
      selectText(at.node, at.offset - match[1].length - 2, at.offset);
      // Mark only the generated spacer, so user-supplied zero-width spaces remain literal.
      document.execCommand(
        "insertHTML",
        false,
        `<code>${escapeHtml(match[1])}</code><span data-editor-caret>&#8203;</span>`,
      );
      const caret = editor.querySelectorAll("[data-editor-caret]");
      const range = document.createRange();
      range.setStart(caret[caret.length - 1].firstChild, 1);
      range.collapse(true);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
      undoSteps = 1;
      return true;
    };
    const typedFence = () => {
      const at = lineAtCaret();
      const match = at && /^(`{3,}|~{3,})([^`\s]*)\s*$/.exec(at.line);
      const next = at?.node.nextSibling;
      if (!match || at.node.data.slice(at.offset).trim() || (next && next.nodeName !== "BR")) return false;
      selectText(at.node, at.offset - at.line.length, at.offset);
      document.execCommand("delete");
      document.execCommand("formatBlock", false, "pre");
      const pre = around("pre");
      if (pre) Object.assign(pre.dataset, { fence: match[1], info: match[2] });
      undoSteps = 2;
      return true;
    };
    /** Enter in a code block starts a new line; on an empty last line it leaves the block. */
    const codeBlockEnter = (pre) => {
      const caret = getSelection().getRangeAt(0);
      const before = document.createRange();
      before.setStart(pre, 0);
      before.setEnd(caret.startContainer, caret.startOffset);
      const after = document.createRange();
      after.setStart(caret.endContainer, caret.endOffset);
      after.setEnd(pre, pre.childNodes.length);
      const leaving =
        caret.collapsed &&
        codeText(before.cloneContents()).endsWith("\n") &&
        !codeText(after.cloneContents()).replace(/\n$/, "");
      if (!leaving) {
        document.execCommand("insertLineBreak");
        return;
      }
      document.execCommand("delete"); // the empty line
      const paragraph = document.createElement("p");
      paragraph.append(document.createElement("br"));
      pre.after(paragraph);
      getSelection().collapse(paragraph, 0);
    };

    editor.addEventListener("beforeinput", (event) => {
      if (
        event.inputType.startsWith("format") &&
        (single || sourceMode || around("pre") || !["formatBold", "formatItalic"].includes(event.inputType))
      )
        event.preventDefault();
    });
    editor.addEventListener("input", (event) => {
      const typed = event.inputType === "insertText" && !single && !sourceMode;
      if (typed && ((event.data === " " && typedBlock()) || (event.data === "`" && typedCode()))) {
        hideSuggestions();
        sync();
        rememberSelection();
        updateToolbar();
        return;
      }
      if (tokens && event.inputType === "insertText" && event.data === " " && !around("code, pre")) pillTyped(editor);
      sync();
      rememberSelection();
      updateToolbar();
      if (tokens && !around("code, pre")) checkTrigger(editor);
    });
    editor.addEventListener("keydown", (event) => {
      if (event.isComposing) return;
      const revert = undoSteps;
      if (!/^(Shift|Control|Alt|Meta)$/.test(event.key)) undoSteps = 0;
      literalPaste = Boolean((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "v");
      if (!single && !sourceMode && (event.ctrlKey || event.metaKey)) {
        if (event.altKey && /^[012]$/.test(event.key)) {
          event.preventDefault();
          runFormat("formatBlock", { 0: "p", 1: "h3", 2: "h4" }[event.key]);
          return;
        }
        if (event.shiftKey && ["7", "8", "&", "*"].includes(event.key)) {
          event.preventDefault();
          runFormat(["7", "&"].includes(event.key) ? "insertOrderedList" : "insertUnorderedList");
          return;
        }
      }
      if (
        !single &&
        !sourceMode &&
        event.key === "Tab" &&
        !event.ctrlKey &&
        !event.metaKey &&
        suggestBox.hidden &&
        getSelection().anchorNode?.parentElement?.closest("li")
      ) {
        event.preventDefault();
        document.execCommand(event.shiftKey ? "outdent" : "indent");
        sync();
        return;
      }
      if (
        !single &&
        !sourceMode &&
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        !event.shiftKey &&
        /^[bie]$/i.test(event.key)
      ) {
        event.preventDefault();
        runFormat({ b: "bold", i: "italic", e: "code" }[event.key.toLowerCase()]);
        return;
      }
      const plain = !event.ctrlKey && !event.metaKey && !event.altKey;
      if (plain && event.key === "Escape" && !suggestBox.hidden) {
        event.preventDefault();
        event.stopPropagation(); // closing the list shouldn't also cancel the edit
        hideSuggestions();
        return;
      }
      if (suggesting?.editor === editor && plain) {
        const handled = { ArrowDown: 1, ArrowUp: 1, Enter: 1, Tab: !event.shiftKey }[event.key];
        if (handled) {
          event.preventDefault();
          if (event.key === "ArrowDown") highlightSuggestion(suggesting.index + 1);
          else if (event.key === "ArrowUp") highlightSuggestion(suggesting.index - 1);
          else pickSuggestion();
          return;
        }
      }
      if (!single && !sourceMode && plain && !event.shiftKey) {
        const pre = around("pre");
        let handled = true;
        if (event.key === "Backspace" && revert && getSelection().isCollapsed) {
          // Right after a typed conversion: put the typed characters back.
          for (let step = 0; step < revert; step++) document.execCommand("undo");
          getSelection().collapseToEnd();
        } else if (event.key === "Backspace" && pre && !codeText(pre).replace(/\n/g, "")) {
          document.execCommand("formatBlock", false, "p");
        } else if (event.key === "Enter" && pre) codeBlockEnter(pre);
        else handled = event.key === "Enter" && typedFence();
        if (handled) {
          event.preventDefault();
          sync();
          updateToolbar();
          return;
        }
      }
      if (event.key === "Enter" && !event.ctrlKey && !event.metaKey && (single || sourceMode)) {
        event.preventDefault();
        // A one-line field submits on Enter, like the input it replaced.
        if (single) field.form?.requestSubmit();
        else document.execCommand("insertLineBreak");
      }
    });
    editor.addEventListener("keyup", (event) => {
      // Up/Down move through the list when it has items, so only recheck when it doesn't.
      const moved =
        /^(ArrowLeft|ArrowRight|Home|End)$/.test(event.key) ||
        (!suggesting && /^(ArrowUp|ArrowDown|PageUp|PageDown)$/.test(event.key));
      rememberSelection();
      updateToolbar();
      if (moved && tokens && !around("code, pre")) checkTrigger(editor);
    });
    editor.addEventListener("click", () => {
      undoSteps = 0;
      rememberSelection();
      updateToolbar();
      if (tokens) checkTrigger(editor);
    });
    editor.addEventListener("blur", () => {
      undoSteps = 0;
      hideSuggestions();
    });

    // Source and single-line fields insert text without interpreting Markdown.
    const insertPlain = (text) => {
      if (single) text = text.replace(/\s*\n\s*/g, " ");
      const range = getSelection().getRangeAt(0);
      const joinsWord = /\S$/.test(textBefore(editor, range.startContainer, range.startOffset));
      if (text)
        document.execCommand(
          "insertHTML",
          false,
          tokens && !sourceMode ? textToHtml(text, joinsWord) : escapeHtml(text).replace(/\n/g, "<br>"),
        );
    };
    /** Text pasted or dropped into code stays literal; inline code stays on one line. */
    const insertIntoCode = (text) => {
      if (!around("pre")) text = text.replace(/\s*\n\s*/g, " ");
      if (text) document.execCommand("insertText", false, text);
      sync();
    };
    // Copy and cut the saved text, so a goal pill keeps its [[link]], and code copies as typed.
    const copySelection = (event) => {
      const selection = getSelection();
      if (!selection.rangeCount || selection.isCollapsed) return;
      event.preventDefault();
      const range = selection.getRangeAt(0);
      const fragment = range.cloneContents();
      const common = range.commonAncestorContainer;
      const code = (common.nodeType === Node.TEXT_NODE ? common.parentElement : common).closest("pre, code");
      if (!single && !sourceMode && code && editor.contains(code)) {
        event.clipboardData.setData("text/plain", codeText(fragment));
      } else {
        event.clipboardData.setData(
          "text/plain",
          single || sourceMode ? editorText(fragment) : editorMarkdown(fragment),
        );
        if (!single && !sourceMode) {
          const safe = document.createElement("div");
          safe.append(fragment);
          event.clipboardData.setData("text/html", renderEntryMarkdown(editorMarkdown(safe)));
        }
      }
      if (event.type === "cut") document.execCommand("delete");
    };
    editor.addEventListener("copy", copySelection);
    editor.addEventListener("cut", copySelection);
    // Dragging text out of the editor would lose goal links, and dropping it
    // back in would copy rather than move it, so it's turned off.
    editor.addEventListener("dragstart", (event) => event.preventDefault());
    editor.addEventListener("paste", (event) => {
      event.preventDefault();
      if (!single && !sourceMode && around("pre, code")) insertIntoCode(event.clipboardData.getData("text/plain"));
      else if (!single && !sourceMode) {
        const html = event.clipboardData.getData("text/html");
        const content = document.createElement("template");
        if (html) content.innerHTML = html;
        content.content.querySelectorAll("[data-token], [data-editor-caret]").forEach((node) => {
          node.removeAttribute("data-token");
          node.removeAttribute("data-editor-caret");
        });
        const markdown = html ? editorMarkdown(content.content) : event.clipboardData.getData("text/plain");
        document.execCommand(
          "insertHTML",
          false,
          literalPaste
            ? escapeHtml(event.clipboardData.getData("text/plain")).replace(/\n/g, "<br>")
            : richHtml(markdown).innerHTML,
        );
        literalPaste = false;
        sync();
      } else insertPlain(event.clipboardData.getData("text/plain"));
    });
    editor.addEventListener("drop", (event) => {
      event.preventDefault();
      const range = document.caretRangeFromPoint(event.clientX, event.clientY);
      if (!range || !editor.contains(range.startContainer)) return;
      getSelection().removeAllRanges();
      getSelection().addRange(range);
      const text = event.dataTransfer.getData("text/plain");
      if (!single && !sourceMode && around("pre, code")) insertIntoCode(text);
      else if (!single && !sourceMode) {
        document.execCommand("insertHTML", false, richHtml(text).innerHTML);
        sync();
      } else insertPlain(text);
    });

    field.form?.addEventListener("submit", (event) => {
      sync();
      if (!required || field.value.trim()) return;
      // Nothing written: stay put instead of posting an empty form.
      event.preventDefault();
      event.stopImmediatePropagation();
      editor.focus();
    });

    if (hadFocus) {
      // Edit links end in "#entry-…", and the browser drops focus when it
      // scrolls there during load, so wait until loading is done.
      if (document.readyState === "complete") focusAtEnd(editor);
      else addEventListener("load", () => focusAtEnd(editor), { once: true });
    }
  }

  function focusAtEnd(editor) {
    editor.focus();
    getSelection().selectAllChildren(editor);
    getSelection().collapseToEnd();
  }

  /** Focus mode: the capture form fills the window. */
  function setFocusMode(form, on) {
    hideSuggestions(); // the editor moves, so an open list would point at the wrong spot
    form.classList.toggle("is-focus-mode", on);
    form.querySelector("[data-focus-mode]")?.setAttribute("aria-pressed", String(on));
    // Everything behind the overlay is out of reach (Tab, shortcuts) while it's up.
    if (on) {
      for (let el = form; el !== document.body; el = el.parentElement) {
        for (const sibling of el.parentElement.children) {
          if (sibling === el || sibling === suggestBox || /^(DIALOG|SCRIPT)$/.test(sibling.tagName)) continue;
          sibling.inert = true;
          sibling.dataset.focusInert = "";
        }
      }
    } else {
      releaseFocusMode();
    }
    const editor = form.querySelector(".composer");
    if (editor && !editor.contains(document.activeElement)) focusAtEnd(editor);
  }

  function releaseFocusMode() {
    document.querySelectorAll("[data-focus-inert]").forEach((el) => {
      el.inert = false;
      delete el.dataset.focusInert;
    });
  }

  // ---- Post a form, then swap in the page it redirects to ----------------

  /** Visible, so focusing it makes sense (not inside a collapsed section). */
  const canFocus = (el) => {
    if (!el?.isConnected) return false;
    const closed = el.closest("details:not([open])");
    return !closed || closed.querySelector(":scope > summary")?.contains(el);
  };
  // Prefer the row's buttons over links inside its text.
  const firstControl = (row) =>
    row?.querySelector("button") ?? row?.querySelector('a[href], input:not([type="hidden"]), select, textarea');

  function swapPage(html, url, { focusCapture, draftKey }) {
    cancelTodoSearch();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const nextMain = doc.querySelector("main");
    if (!nextMain) {
      location.assign(url);
      return;
    }

    const seen = new Set([...document.querySelectorAll(".entry[id]")].map((el) => el.id));
    // Remember where focus was, and the rows around it, in case that element goes away.
    const active = document.activeElement;
    const row = active?.closest("li[id]");
    const focusIds = [active?.id, row?.id, row?.nextElementSibling?.id, row?.previousElementSibling?.id].filter(
      Boolean,
    );
    const trayScroll = document.querySelector(".tray")?.scrollTop ?? 0;

    document.querySelector("main").replaceWith(nextMain);
    const nextNav = doc.querySelector(".nav");
    if (nextNav) document.querySelector(".nav")?.replaceWith(nextNav);
    const settingsLink = doc.querySelector(".agent-settings-link");
    if (settingsLink) document.querySelector(".agent-settings-link")?.replaceWith(settingsLink);
    document.getElementById("change-notice").hidden = true;
    document.title = doc.title;

    const target = new URL(url);
    target.searchParams.delete("error");
    target.searchParams.delete("saved");
    if (target.pathname + target.search !== location.pathname + location.search) {
      history.pushState(null, "", target.pathname + target.search);
    }

    if (draftKey && !new URL(url).searchParams.has("error")) localStorage.removeItem(draftKey);
    initPage(nextMain);

    const tray = nextMain.querySelector(".tray");
    if (tray) tray.scrollTop = trayScroll;

    if (seen.size > 0 || focusCapture) {
      nextMain.querySelectorAll(".entry[id]").forEach((el) => {
        if (!seen.has(el.id)) el.classList.add("is-new");
      });
    }

    // Keep keyboard users in place: same control, else the same or a nearby row, else the page.
    const candidates = [
      focusCapture && nextMain.querySelector("#capture"),
      ...focusIds.map((id, i) => {
        const el = document.getElementById(id);
        return i === 0 ? el : firstControl(el);
      }),
    ];
    const refocus = candidates.find(canFocus) || nextMain;
    refocus.focus({ preventScroll: true });
  }

  document.addEventListener("submit", async (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (form.hasAttribute("data-live-search")) {
      event.preventDefault();
      updateTodoSearch(form);
      return;
    }
    if (form.method.toLowerCase() !== "post") return;
    event.preventDefault();

    if (form.dataset.confirm && !confirm(form.dataset.confirm)) return;
    if (form.dataset.busy) return;
    cancelTodoSearch();
    form.dataset.busy = "1";

    const draftKey = form.querySelector("textarea[data-draft]")?.dataset.draft;
    try {
      const response = await fetch(form.action, { method: "POST", body: new FormData(form, event.submitter) });
      const type = response.headers.get("content-type") || "";
      if (!type.includes("text/html")) {
        document.body.textContent = await response.text();
        return;
      }
      swapPage(await response.text(), response.url, { focusCapture: form.hasAttribute("data-capture"), draftKey });
    } catch {
      // Network hiccup: fall back to a normal form post.
      form.submit();
    } finally {
      delete form.dataset.busy;
    }
  });

  // ---- Small behaviours ---------------------------------------------------

  let todoSearchTimer = 0;
  let todoSearchRequest = null;

  /** Ends pending search work when input changes or another page update takes over. */
  function cancelTodoSearch() {
    clearTimeout(todoSearchTimer);
    todoSearchRequest?.controller.abort();
    todoSearchRequest = null;
  }

  /** Fetches changed filters once, allowing only the current request to swap the page. */
  async function updateTodoSearch(form, replaceHistory = false) {
    clearTimeout(todoSearchTimer);
    const filters = new URLSearchParams(new FormData(form));
    const query = filters.toString();
    if (query === todoSearchRequest?.query) {
      todoSearchRequest.replaceHistory = replaceHistory;
      return;
    }
    cancelTodoSearch();
    const shown = new URLSearchParams(location.search);
    const unchanged = [...filters].every(([name, value]) => {
      const current = shown.get(name) ?? "";
      return name === "q" ? value.trim() === current.trim() : value === current;
    });
    if (unchanged) return;

    const request = { query, replaceHistory, controller: new AbortController() };
    todoSearchRequest = request;
    const url = new URL(form.action);
    url.search = query;
    try {
      const response = await fetch(url, { signal: request.controller.signal });
      const html = await response.text();
      if (request.controller.signal.aborted || !form.isConnected) return;

      const doc = new DOMParser().parseFromString(html, "text/html");
      for (const selector of [".page-sub", ".filter-actions", "#todo-results"]) {
        const next = doc.querySelector(selector);
        document.querySelector(selector).replaceWith(next);
        initPage(next);
      }
      const returnToSelector = 'form.todo-add input[name="return_to"]';
      document.querySelector(returnToSelector).value = doc.querySelector(returnToSelector).value;
      const target = new URL(response.url);
      if (target.pathname + target.search !== location.pathname + location.search) {
        if (request.replaceHistory) history.replaceState(null, "", target.pathname + target.search);
        else history.pushState(null, "", target.pathname + target.search);
      }
    } catch {
      if (!request.controller.signal.aborted && form.isConnected) form.submit();
    } finally {
      if (todoSearchRequest === request) todoSearchRequest = null;
    }
  }

  /** Debounces committed search text without discarding an open todo editor. */
  function scheduleTodoSearch(event) {
    const search = event.target;
    if (!(search instanceof HTMLInputElement) || !search.form?.hasAttribute("data-live-search")) return;
    cancelTodoSearch();
    if (event.type === "compositionstart" || event.isComposing || document.querySelector(".todo-edit")) return;
    todoSearchTimer = setTimeout(() => updateTodoSearch(search.form, true), 250);
  }

  document.addEventListener("input", scheduleTodoSearch);
  document.addEventListener("compositionstart", scheduleTodoSearch);
  document.addEventListener("compositionend", scheduleTodoSearch);

  let dateTimer = 0;
  document.addEventListener("change", (event) => {
    const el = event.target;
    if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement) || !el.hasAttribute("data-autosubmit"))
      return;
    // Typing a date fires "change" on every valid keystroke (e.g. while typing
    // the year), so wait until the user pauses before jumping there.
    if (el.type === "date") {
      clearTimeout(dateTimer);
      dateTimer = setTimeout(() => el.form?.requestSubmit(), 900);
      return;
    }
    el.form?.requestSubmit();
  });

  const announce = (status, text) => {
    if (!status) return;
    // Clear first so screen readers announce the same message again.
    status.textContent = "";
    requestAnimationFrame(() => (status.textContent = text));
  };

  /** Form fields the user has changed since the page loaded. */
  const changedFields = (main) =>
    [...main.querySelectorAll("input, textarea, select")].filter(
      (field) =>
        !field.readOnly &&
        field.type !== "hidden" &&
        (field instanceof HTMLSelectElement
          ? field.value !== (field.querySelector("option[selected]") ?? field.options[0])?.value
          : field.type === "checkbox"
            ? field.checked !== field.defaultChecked
            : field.value !== field.defaultValue),
    );

  function formValues(main) {
    return JSON.stringify(
      [...main.querySelectorAll("input, textarea, select")].map((field) => [
        field.name,
        field.type === "checkbox" || field.type === "radio" ? field.checked : field.value,
      ]),
    );
  }

  document.addEventListener("click", async (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    if (target.closest("[data-refresh-page]")) {
      const main = document.querySelector("main");
      const dirty = main.querySelector(".edit-form, .goal-edit") || changedFields(main).length > 0;
      if (dirty && !confirm("Refresh now? Unsaved edits will be discarded. A ledger capture draft will be kept."))
        return;
      const url = location.href;
      const initialValues = formValues(main);
      try {
        const response = await fetch(url);
        const html = await response.text();
        if (main === document.querySelector("main") && url === location.href) {
          if (formValues(main) !== initialValues) {
            announce(
              document.getElementById("change-text"),
              "New edits were made while refreshing. Your page has been kept.",
            );
            return;
          }
          swapPage(html, url, {});
        }
      } catch {
        announce(document.getElementById("change-text"), "Could not refresh. Your edits are still here. Try again.");
      }
      return;
    }

    const copyButton = target.closest("[data-copy]");
    if (copyButton) {
      const source = document.querySelector(copyButton.dataset.copy);
      const html = copyButton.dataset.copyHtml ? document.querySelector(copyButton.dataset.copyHtml)?.innerHTML : null;
      const status = document.querySelector(copyButton.dataset.copyStatus || "");
      try {
        try {
          if (!html || !window.ClipboardItem) throw new Error("plain text only");
          // Formatted text for Word/Docs, Markdown for plain text boxes.
          await navigator.clipboard.write([
            new ClipboardItem({
              "text/plain": new Blob([source.value], { type: "text/plain" }),
              "text/html": new Blob([html], { type: "text/html" }),
            }),
          ]);
        } catch {
          await navigator.clipboard.writeText(source.value);
        }
        announce(status, copyButton.dataset.copyMessage || "Copied. Paste it into your review.");
      } catch {
        source.closest("details")?.setAttribute("open", "");
        source.select();
        announce(status, "Couldn't reach the clipboard. The text is selected below; press Ctrl+C.");
      }
      return;
    }

    const printButton = target.closest("[data-print]");
    if (printButton) {
      // The page title becomes the suggested PDF file name.
      const title = document.title;
      if (printButton.dataset.print) document.title = printButton.dataset.print;
      window.print();
      document.title = title;
    }
    if (target.closest("[data-open-shortcuts]")) document.getElementById("shortcuts")?.showModal();

    const focusButton = target.closest("[data-focus-mode]");
    if (focusButton) setFocusMode(focusButton.form, focusButton.getAttribute("aria-pressed") !== "true");
  });

  // ---- Subtasks: a todo's title opens and closes its list -----------------

  function toggleSubtasks(title) {
    const list = document.getElementById(title.dataset.subtasks);
    if (!list) return;
    list.open = !list.open;
    // An empty list only has the add box, so go straight to it.
    if (list.open && !list.querySelector(".subtask")) list.querySelector('.subtask-add input[name="text"]')?.focus();
  }

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const toggle = target?.closest("[data-subtasks]");
    if (!toggle) return;
    // On the title, tag and goal links still work, and selecting text doesn't toggle.
    const isButton = toggle instanceof HTMLButtonElement;
    if (!isButton && (target.closest("a, button") || String(getSelection()).trim())) return;
    toggleSubtasks(toggle);
  });

  // ---- Reordering todos and subtasks --------------------------------------
  // Rows marked data-move can be dragged by their grip, or moved with Alt+arrows.

  /** Posts a move like any other form, so the page updates in place. */
  function postMove(row, where, targetId) {
    // One at a time: each move is worked out from the page, which updates only when the last one lands.
    if (document.querySelector("form[data-move-form]")) return;
    const form = document.createElement("form");
    form.method = "post";
    form.action = `/${row.dataset.move === "todo" ? "todos" : "subtasks"}/${row.dataset.id}/move`;
    form.hidden = true;
    form.dataset.moveForm = "";
    for (const [name, value] of [
      [where, targetId],
      ["return_to", location.pathname + location.search],
      ["expected_revision", row.closest("[data-todo-revision]")?.dataset.todoRevision ?? ""],
    ]) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = value;
      form.append(input);
    }
    // Inside <main>, so the swap that follows removes it.
    document.querySelector("main").append(form);
    form.requestSubmit();
  }

  const siblingRow = (row, direction) => {
    let el = row[direction];
    while (el && !el.matches("li[data-move]")) el = el[direction];
    return el;
  };

  /** Up/down among siblings; right nests under the one above; left moves out to just after its parent. */
  function moveByKey(row, key) {
    const above = siblingRow(row, "previousElementSibling");
    const below = siblingRow(row, "nextElementSibling");
    const parent = row.parentElement.closest("li[data-move]");
    const isSubtask = row.dataset.move === "subtask";
    if (key === "ArrowUp" && above) postMove(row, "before", above.dataset.id);
    else if (key === "ArrowDown" && below) postMove(row, "after", below.dataset.id);
    else if (key === "ArrowRight" && isSubtask && above) postMove(row, "into", above.dataset.id);
    // A top-level subtask stays a subtask: its parent is the todo.
    else if (key === "ArrowLeft" && isSubtask && parent?.dataset.move === "subtask")
      postMove(row, "after", parent.dataset.id);
  }

  let dragged = null;
  let drop = null;

  const clearDrop = () => {
    drop?.row.classList.remove(`drop-${drop.where}`);
    drop = null;
  };

  /** Where the dragged row would land: before/after a sibling todo, or before/after/into a subtask or todo. */
  function dropAt(event) {
    if (!dragged || !(event.target instanceof Element)) return null;
    if (dragged.dataset.move === "todo") {
      const row = event.target.closest('li[data-move="todo"]');
      // Todos only move within their own status group.
      if (!row || row === dragged || row.parentElement !== dragged.parentElement) return null;
      const box = row.getBoundingClientRect();
      return { row, where: event.clientY < box.top + box.height / 2 ? "before" : "after" };
    }
    const row = event.target.closest("li[data-move]");
    if (!row || dragged.contains(row)) return null;
    if (row.dataset.move === "todo") return { row, where: "into" };
    const box = row.querySelector(":scope > .subtask-line").getBoundingClientRect();
    const y = (event.clientY - box.top) / box.height;
    return { row, where: y < 0.3 ? "before" : y > 0.7 ? "after" : "into" };
  }

  // Only the grip starts a drag, so text in the row can still be selected.
  document.addEventListener("pointerdown", (event) => {
    const handle = event.target instanceof Element ? event.target.closest(".grip") : null;
    if (handle) handle.closest("li[data-move]").draggable = true;
  });
  document.addEventListener("pointerup", () => {
    document.querySelectorAll("li[data-move][draggable]").forEach((row) => {
      row.removeAttribute("draggable");
    });
  });

  document.addEventListener("dragstart", (event) => {
    const row = event.target instanceof Element ? event.target.closest("li[data-move]") : null;
    if (!row?.draggable) return;
    dragged = row;
    event.dataTransfer.effectAllowed = "move";
    // Not text/plain, so letting go over a text box doesn't paste the id into it.
    event.dataTransfer.setData("application/x-workledger-move", row.dataset.id);
    // After the browser has taken its drag image.
    requestAnimationFrame(() => row.classList.add("is-dragging"));
  });

  document.addEventListener("dragover", (event) => {
    const next = dropAt(event);
    if (next) event.preventDefault();
    if (next?.row === drop?.row && next?.where === drop?.where) return;
    clearDrop();
    drop = next;
    drop?.row.classList.add(`drop-${drop.where}`);
  });

  document.addEventListener("drop", (event) => {
    if (!dragged || !drop) return;
    event.preventDefault();
    // Focus the moved row's grip, so focus stays with it after the update.
    dragged.querySelector(".grip")?.focus({ preventScroll: true });
    postMove(dragged, drop.where, drop.row.dataset.id);
  });

  document.addEventListener("dragend", () => {
    clearDrop();
    dragged?.classList.remove("is-dragging");
    dragged?.removeAttribute("draggable");
    dragged = null;
  });

  // ---- Keyboard -----------------------------------------------------------

  let pendingG = 0;
  const GO = { t: "/", d: "/todos", g: "/goals", r: "/review" };

  document.addEventListener("keydown", (event) => {
    const el = event.target instanceof Element ? event.target : null;

    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      const form = el?.closest("form");
      if (form) {
        event.preventDefault();
        form.requestSubmit();
      }
      return;
    }

    if ((event.key === "f" || event.key === "F") && (event.ctrlKey || event.metaKey) && event.shiftKey) {
      const capture = document.querySelector("form[data-capture]");
      if (capture) {
        event.preventDefault();
        setFocusMode(capture, !capture.classList.contains("is-focus-mode"));
      }
      return;
    }

    if (event.key === "Escape") {
      // A dialog closes itself on Esc; don't also act on the page behind it.
      if (el?.closest("dialog[open]")) return;
      // Leave focus mode, cancel an edit, or step out of a text field, in that order.
      const focusMode = document.querySelector(".is-focus-mode");
      if (focusMode) {
        setFocusMode(focusMode, false);
        return;
      }
      const cancel = el?.closest(".edit-form")?.querySelector("a.btn.ghost");
      if (cancel) {
        // Escape must not discard formatting or other unsaved multiline edits.
        const changed = [...el.closest(".edit-form").querySelectorAll("textarea:not([readonly])")].some(
          (field) => field.value !== field.defaultValue,
        );
        if (changed) {
          event.preventDefault();
          el.blur();
          return;
        }
        cancel.click();
        return;
      }
      if (isTyping(el)) el.blur();
      return;
    }

    const plainAlt = event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
    const row = el?.closest("li[data-move]");
    if (plainAlt && /^Arrow(Up|Down|Left|Right)$/.test(event.key) && row && !isTyping(el)) {
      // Also stops Alt+Left going back a page in a browser.
      event.preventDefault();
      if (!event.repeat) moveByKey(row, event.key);
      return;
    }

    if (event.ctrlKey || event.metaKey || event.altKey || isTyping(el)) return;

    if (pendingG && Date.now() - pendingG < 1200 && GO[event.key]) {
      pendingG = 0;
      location.assign(GO[event.key]);
      return;
    }
    pendingG = event.key === "g" ? Date.now() : 0;
    if (event.key === "g") return;

    if (event.key === "?") {
      document.getElementById("shortcuts")?.showModal();
      return;
    }

    const target = document.querySelector(`[data-shortcut="${CSS.escape(event.key)}"]`);
    if (!target) return;
    event.preventDefault();
    if (target instanceof HTMLAnchorElement) target.click();
    else target.focus();
  });

  // ---- Updates: the version row in the rail, and Settings › Updates ------
  // The main process checks and downloads in the background. This only shows
  // the state, starts a check when asked, and asks before restarting.

  const updateRow = document.getElementById("version-row");
  let update = updateRow ? JSON.parse(updateRow.dataset.updates) : null;
  let checkedByUser = false; // only a check the user asked for announces its result
  let checkedTimer = 0; // a tick shows for a moment after such a check finds nothing
  let readyAnnounced = "";
  let pollTimer = 0;
  const appVersion = document.querySelector(".version-number")?.textContent ?? "";
  const busyStates = ["checking", "downloading", "restarting"];
  const updatePop = document.getElementById("update-pop");
  const updateButton = document.getElementById("update-btn");

  /** Restarting loses these. The unsent ledger entry is a draft, so it's kept. */
  const editsLostOnRestart = () =>
    changedFields(document.querySelector("main")).some((field) => !field.matches("textarea[data-draft]"));

  /** The rail button for each state. `pop` means a click shows details instead of checking. */
  function updateView() {
    const version = update.version;
    switch (update.status) {
      case "unavailable":
        return { icon: "update", tone: "off", pop: true, label: "Updates unavailable. Show details." };
      case "checking":
        return { icon: "refresh", busy: true, label: "Checking for updates…" };
      case "downloading":
        return { icon: "download", ring: true, pop: true, label: `Downloading ToDo ${version}. Show details.` };
      case "ready":
        return { icon: "update", tone: "ready", pop: true, label: `ToDo ${version} is ready. Show restart options.` };
      case "restarting":
        return { icon: "refresh", busy: true, label: "Restarting ToDo…" };
      case "error":
        return { icon: "alert", tone: version ? "failed" : "", pop: true, label: `${update.message} Show details.` };
      default:
        if (checkedTimer) return { icon: "check", tone: "ok", label: "ToDo is up to date. Check for updates." };
        return {
          icon: "refresh",
          label: update.checkedAt
            ? `Check for updates. Up to date, checked ${new Date(update.checkedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`
            : "Check for updates",
        };
    }
  }

  /** The restart button, and a warning when restarting now would lose edits on this page. */
  function restartControl(small) {
    const size = small ? " small" : "";
    return editsLostOnRestart()
      ? {
          warning: `<p class="update-warn">This page has unsaved changes. Save them first, or they'll be lost.</p>`,
          button: `<button type="button" class="btn${size}" data-update-restart data-discard>Restart and discard changes</button>`,
        }
      : {
          warning: "",
          button: `<button type="button" class="btn primary${size}" data-update-restart>Restart to update</button>`,
        };
  }

  function popHtml() {
    const { status, version, percent, message } = update;
    const title = (text) => `<h2 id="update-pop-title">${escapeHtml(text)}</h2>`;
    if (status === "unavailable")
      return `${title("Updates unavailable")}<p>This copy of ToDo isn't the installed app, so it doesn't check for or install updates.</p>`;
    if (status === "downloading")
      return `${title(`Downloading ToDo ${version}`)}<progress class="update-progress" max="100" value="${percent}" aria-labelledby="update-pop-title"></progress>
        <p class="update-meta">${percent}% · in the background</p><p>Keep working. Nothing restarts until you choose.</p>`;
    if (status === "ready") {
      const restart = restartControl(true);
      return `${title(`ToDo ${version} is ready`)}<p>Restarting takes a few seconds. Unsent ledger entries are kept.</p>${restart.warning}
        <div class="update-actions">${restart.button}<button type="button" class="btn small ghost" data-update-close>Not now</button></div>`;
    }
    return `${title(message)}<p>${version ? `ToDo is still on ${escapeHtml(appVersion)}. Your notes are unchanged.` : "ToDo works offline and checks again next time it starts."}</p>
      <div class="update-actions"><button type="button" class="btn small" data-update-check>Try again</button><a class="btn small ghost" href="/settings#updates">Details</a></div>`;
  }

  function settingsHtml() {
    const { status, version, percent, message } = update;
    const time = update.checkedAt
      ? new Date(update.checkedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
      : "";
    const [line, tone = ""] =
      {
        unavailable: ["Not available in this copy"],
        idle: ["Not checked yet"],
        checking: ["Checking for updates…"],
        current: [`Up to date · checked ${time}`],
        downloading: [`Downloading ${version} · ${percent}%`],
        ready: [`${version} is ready to install`, "is-ready"],
        restarting: [`Restarting to install ${version}…`, "is-ready"],
      }[status] ??
      (version ? [message, "is-error"] : [`${message} ToDo works offline and checks again next time it starts.`]);
    const progress =
      status === "downloading"
        ? `<progress class="update-progress" max="100" value="${percent}" aria-label="Downloading ToDo ${escapeHtml(version)}"></progress>`
        : "";
    const busy = busyStates.includes(status) ? ' aria-disabled="true"' : "";
    const restart = status === "ready" ? restartControl(false) : { warning: "", button: "" };
    const action =
      status === "unavailable"
        ? ""
        : status === "ready"
          ? restart.button
          : status === "restarting"
            ? `<button type="button" class="btn primary" aria-disabled="true">Restart to update</button>`
            : `<button type="button" class="btn" data-update-check${busy}>${status === "error" ? "Try again" : "Check for updates"}</button>`;
    return `<p class="state-line"><span>Version ${escapeHtml(appVersion)}</span><span class="${tone}">${escapeHtml(line)}</span></p>${progress}${restart.warning}${action && `<div class="update-actions">${action}</div>`}`;
  }

  /** Redraws a panel only when what it says changes, so a focused button isn't replaced mid-download. */
  function fill(container, html, key) {
    if (container.dataset.key === key) {
      container.querySelectorAll(".update-progress").forEach((bar) => {
        bar.value = update.percent;
      });
      const meta = container.querySelector(".update-meta");
      if (meta) meta.textContent = `${update.percent}% · in the background`;
      const line = container.querySelector(".state-line span:last-child");
      if (line && update.status === "downloading")
        line.textContent = `Downloading ${update.version} · ${update.percent}%`;
      return;
    }
    const hadFocus = container.contains(document.activeElement);
    container.dataset.key = key;
    container.innerHTML = html;
    if (hadFocus) (container.querySelector("button:not([aria-disabled])") ?? updateButton).focus();
  }

  function renderUpdates() {
    if (!update) return;
    const view = updateView();
    updateButton.hidden = false;
    updateButton.dataset.icon = view.icon;
    updateButton.dataset.tone = view.tone ?? "";
    updateButton.toggleAttribute("data-busy", Boolean(view.busy));
    updateButton.setAttribute("aria-label", view.label);
    updateButton.title = view.label;
    if (view.busy) updateButton.setAttribute("aria-disabled", "true");
    else updateButton.removeAttribute("aria-disabled");
    updateButton
      .querySelector(".update-ring .value")
      .setAttribute("stroke-dashoffset", String(100 - (update.percent ?? 0)));
    if (!view.pop && !updatePop.hidden) closeUpdatePop(updatePop.contains(document.activeElement));
    if (view.pop) {
      updateButton.setAttribute("aria-controls", "update-pop");
      updateButton.setAttribute("aria-expanded", String(!updatePop.hidden));
    } else {
      updateButton.removeAttribute("aria-controls");
      updateButton.removeAttribute("aria-expanded");
    }
    const key = JSON.stringify([update.status, update.version, update.message, update.checkedAt, editsLostOnRestart()]);
    if (!updatePop.hidden) fill(updatePop, popHtml(), key);
    const settings = document.getElementById("settings-updates");
    if (settings) fill(settings, settingsHtml(), key);
  }

  function closeUpdatePop(returnFocus) {
    updatePop.hidden = true;
    delete updatePop.dataset.key;
    if (updateButton.hasAttribute("aria-expanded")) updateButton.setAttribute("aria-expanded", "false");
    if (returnFocus) updateButton.focus();
  }

  function setUpdate(next) {
    const before = update;
    update = next;
    clearTimeout(pollTimer);
    if (busyStates.includes(next.status)) pollTimer = setTimeout(refreshUpdates, 1000);
    // Announce outcomes, never progress.
    const live = document.getElementById("update-live");
    if (next.status === "ready" && readyAnnounced !== next.version) {
      readyAnnounced = next.version;
      announce(live, `ToDo ${next.version} is ready. Restart to update when it suits you.`);
    } else if (next.status === "error" && before.status !== "error" && (checkedByUser || next.version)) {
      announce(live, next.message);
    } else if (next.status === "current" && checkedByUser) {
      announce(live, "ToDo is up to date.");
      clearTimeout(checkedTimer);
      checkedTimer = setTimeout(() => {
        checkedTimer = 0;
        renderUpdates();
      }, 4000);
    }
    if (!busyStates.includes(next.status)) checkedByUser = false;
    renderUpdates();
  }

  async function refreshUpdates() {
    try {
      const response = await fetch("/updates", { cache: "no-store" });
      if (response.ok) setUpdate(await response.json());
    } catch {
      // The app may be closing to install. Keep showing the last state.
      if (busyStates.includes(update.status)) pollTimer = setTimeout(refreshUpdates, 1000);
    }
  }

  async function checkForUpdates() {
    checkedByUser = true;
    if (updatePop.contains(document.activeElement)) updateButton.focus();
    try {
      const response = await fetch("/updates/check", { method: "POST" });
      setUpdate(await response.json());
    } catch {
      checkedByUser = false;
      refreshUpdates();
    }
  }

  async function restartToUpdate(button) {
    // Edits may have started since the panel opened: show the warning and let the user choose again.
    if (editsLostOnRestart() && !button.hasAttribute("data-discard")) {
      const container = button.closest("#update-pop, #settings-updates");
      delete container.dataset.key;
      renderUpdates();
      container.querySelector("[data-update-restart]")?.focus();
      return;
    }
    try {
      const response = await fetch("/updates/restart", { method: "POST" });
      if (response.status === 202) announce(document.getElementById("update-live"), "Restarting ToDo.");
      setUpdate(await response.json());
    } catch {
      // The app is quitting to install.
    }
  }

  if (update) {
    document.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      if (target.closest("#update-btn")) {
        if (updateButton.getAttribute("aria-disabled") === "true") return;
        if (!updateView().pop) checkForUpdates();
        else if (updatePop.hidden) {
          updatePop.hidden = false;
          renderUpdates();
        } else closeUpdatePop(false);
      } else if (target.closest("[data-update-check]")) {
        if (target.closest("[data-update-check]").getAttribute("aria-disabled") !== "true") checkForUpdates();
      } else if (target.closest("[data-update-restart]")) {
        if (target.closest("[data-update-restart]").getAttribute("aria-disabled") !== "true")
          restartToUpdate(target.closest("[data-update-restart]"));
      } else if (target.closest("[data-update-close]")) closeUpdatePop(true);
      else if (!target.closest("#update-pop")) closeUpdatePop(false);
    });
    updateRow.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || updatePop.hidden) return;
      event.preventDefault();
      event.stopPropagation();
      closeUpdatePop(true);
    });
    setUpdate(update);
  }

  let checkingChanges = false;
  async function checkTaskChanges() {
    if (document.hidden || checkingChanges) return;
    const main = document.querySelector("main");
    if (!main?.dataset.todoVersion) return;
    checkingChanges = true;
    try {
      const response = await fetch("/todo-version");
      if (!response.ok) return;
      const { revision } = await response.json();
      const notice = document.getElementById("change-notice");
      if (main === document.querySelector("main") && revision !== main.dataset.todoVersion && notice.hidden) {
        notice.hidden = false;
        announce(
          document.getElementById("change-text"),
          "Ledger or todos changed outside this page. Refresh when ready.",
        );
      }
    } catch {
      // The app may be shutting down. Leave the current page and every draft alone.
    } finally {
      checkingChanges = false;
    }
  }
  setInterval(checkTaskChanges, 5000);
  window.addEventListener("focus", checkTaskChanges);
  initPage(document);
})();
