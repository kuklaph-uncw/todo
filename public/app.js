// Progressive enhancement only. Every form and link works without this file;
// with it, form posts update the page in place and keyboard shortcuts work.
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

    // Panels like "Time, star" stay open if you left them open.
    root.querySelectorAll("details[data-remember-open]").forEach((details) => {
      const key = `open:${details.dataset.rememberOpen}`;
      if (localStorage.getItem(key) === "1") details.open = true;
      details.addEventListener("toggle", () => localStorage.setItem(key, details.open ? "1" : "0"));
    });

    // After drafts, so a restored draft shows up with its pills.
    const data = document.getElementById("composer-data");
    if (data) composerData = JSON.parse(data.textContent);
    root.querySelectorAll("[data-composer]").forEach(enhanceComposer);
  }

  // ---- Inline #tags and /goals --------------------------------------------
  // A field marked data-composer gets an editor in its place where tags and
  // goal links show as pills. The field stays in the form, hidden, and always
  // holds the plain text that gets saved ("#tag", "[[goal-slug]]").

  let composerData = { tags: [], goals: [] };
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
      html += escapeHtml(text.slice(last, start)) + (tag !== undefined ? pillHtml("tag", tag) : pillHtml("goal", slug.trim()));
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
      goal.slug.startsWith(q) || `${goal.title} ${goal.slug}`.toLowerCase().split(/[\s-]+/).some((word) => word.startsWith(q));
    return composerData.goals
      .filter((goal) => goal.active && startsWord(goal))
      .map((goal) => ({ kind: "goal", value: goal.slug, label: goal.title, note: `[[${goal.slug}]]` }));
  }

  function showSuggestions(editor, items, rect, heading, pick) {
    if (items.length === 0) return hideSuggestions();
    suggesting = { editor, items, index: 0, pick };
    suggestBox.innerHTML =
      `<li class="suggest-head" role="presentation">${heading}</li>` +
      items
        .map(
          (item, i) =>
            `<li role="option" id="suggest-${i}" class="suggest-${item.kind}" aria-selected="${i === 0}"><span class="suggest-label">${escapeHtml(item.label)}</span><span class="suggest-note">${escapeHtml(item.note)}</span></li>`,
        )
        .join("");
    suggestBox.hidden = false;
    // Below the caret, or above it when there's no room.
    const below = rect.bottom + 6;
    const fits = below + suggestBox.offsetHeight <= innerHeight;
    suggestBox.style.top = `${fits ? below : rect.top - suggestBox.offsetHeight - 6}px`;
    suggestBox.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - suggestBox.offsetWidth - 8))}px`;
    editor.setAttribute("aria-activedescendant", "suggest-0");
  }

  function hideSuggestions() {
    suggesting?.editor.removeAttribute("aria-activedescendant");
    suggesting = null;
    suggestBox.hidden = true;
  }

  function highlightSuggestion(index) {
    suggesting.index = (index + suggesting.items.length) % suggesting.items.length;
    suggestBox.querySelectorAll('[role="option"]').forEach((option, i) => option.setAttribute("aria-selected", String(i === suggesting.index)));
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
  addEventListener("scroll", () => suggesting && hideSuggestions(), true);
  addEventListener("resize", () => suggesting && hideSuggestions());

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
    showSuggestions(editor, suggestions(isTag, query), range.getBoundingClientRect(), isTag ? "Tags" : "Goals", (item) =>
      insertPill(at.node, start, at.offset, item.kind, item.value),
    );
  }

  /** Turns a hand-typed "#tag " or "[[slug]] " into a pill once the space is typed. */
  function pillTyped(editor) {
    const at = caretText(editor);
    const match = at && TYPED_RE.exec(at.before);
    if (!match || (match[2] !== undefined && !isTagName(match[2]))) return;
    const end = at.offset - 1; // the typed space goes too; insertPill adds it back
    if (end - match[1].length < 0) return;
    insertPill(at.node, end - match[1].length, end, match[2] !== undefined ? "tag" : "goal", (match[2] ?? match[3]).trim());
  }

  function enhanceComposer(field) {
    const single = field instanceof HTMLInputElement;
    const editor = document.createElement("div");
    editor.className = single ? "composer is-single" : "composer";
    editor.contentEditable = "true";
    editor.spellcheck = true;
    editor.setAttribute("role", "textbox");
    if (!single) editor.setAttribute("aria-multiline", "true");
    editor.setAttribute("aria-autocomplete", "list");
    editor.setAttribute("aria-controls", "suggest");
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
    const hadFocus = document.activeElement === field || field.autofocus;
    field.hidden = true;
    field.required = false; // a hidden field can't show the browser's "fill this in" bubble
    field.after(editor);
    editor.innerHTML = textToHtml(single ? field.value.replace(/\s*\n\s*/g, " ") : field.value);

    const sync = () => {
      const text = editorText(editor).replace(/\n+$/, "");
      editor.classList.toggle("is-empty", text === "");
      if (text === field.value) return;
      field.value = text;
      field.dispatchEvent(new Event("input", { bubbles: true })); // saves the draft
    };
    sync();

    editor.addEventListener("beforeinput", (event) => {
      // No bold, italics and the like: this is plain text with pills.
      if (event.inputType.startsWith("format")) event.preventDefault();
    });
    editor.addEventListener("input", (event) => {
      if (event.inputType === "insertText" && event.data === " ") pillTyped(editor);
      sync();
      checkTrigger(editor);
    });
    editor.addEventListener("keydown", (event) => {
      if (event.isComposing) return;
      const plain = !event.ctrlKey && !event.metaKey && !event.altKey;
      if (suggesting?.editor === editor && plain) {
        const handled = { ArrowDown: 1, ArrowUp: 1, Enter: 1, Tab: !event.shiftKey, Escape: 1 }[event.key];
        if (handled) {
          event.preventDefault();
          event.stopPropagation(); // Escape here shouldn't also cancel the edit
          if (event.key === "ArrowDown") highlightSuggestion(suggesting.index + 1);
          else if (event.key === "ArrowUp") highlightSuggestion(suggesting.index - 1);
          else if (event.key === "Escape") hideSuggestions();
          else pickSuggestion();
          return;
        }
      }
      if (event.key === "Enter" && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        // A one-line field submits on Enter, like the input it replaced.
        if (single) field.form?.requestSubmit();
        else document.execCommand("insertLineBreak");
      }
    });
    editor.addEventListener("keyup", (event) => {
      if (/^(ArrowLeft|ArrowRight|Home|End)$/.test(event.key)) checkTrigger(editor);
    });
    editor.addEventListener("click", () => checkTrigger(editor));
    editor.addEventListener("blur", () => suggesting?.editor === editor && hideSuggestions());

    // Pasted or dropped text arrives as plain text, with its tags and links as pills.
    const insertPlain = (text) => {
      if (single) text = text.replace(/\s*\n\s*/g, " ");
      const range = getSelection().getRangeAt(0);
      const joinsWord = /\S$/.test(textBefore(editor, range.startContainer, range.startOffset));
      if (text) document.execCommand("insertHTML", false, textToHtml(text, joinsWord));
    };
    // Copy and cut the saved text, so a goal pill keeps its [[link]].
    const copySelection = (event) => {
      const selection = getSelection();
      if (!selection.rangeCount || selection.isCollapsed) return;
      event.preventDefault();
      event.clipboardData.setData("text/plain", editorText(selection.getRangeAt(0).cloneContents()));
      if (event.type === "cut") document.execCommand("delete");
    };
    editor.addEventListener("copy", copySelection);
    editor.addEventListener("cut", copySelection);
    // Dragging text out of the editor would lose goal links, and dropping it
    // back in would copy rather than move it, so it's turned off.
    editor.addEventListener("dragstart", (event) => event.preventDefault());
    editor.addEventListener("paste", (event) => {
      event.preventDefault();
      insertPlain(event.clipboardData.getData("text/plain"));
    });
    editor.addEventListener("drop", (event) => {
      event.preventDefault();
      const range = document.caretRangeFromPoint(event.clientX, event.clientY);
      if (!range || !editor.contains(range.startContainer)) return;
      getSelection().removeAllRanges();
      getSelection().addRange(range);
      insertPlain(event.dataTransfer.getData("text/plain"));
    });

    field.form?.addEventListener("submit", (event) => {
      if (!required || field.value.trim()) return;
      // Nothing written: stay put instead of posting an empty form.
      event.preventDefault();
      event.stopImmediatePropagation();
      editor.focus();
    });

    if (hadFocus) {
      const focusEditor = () => {
        editor.focus();
        getSelection().selectAllChildren(editor);
        getSelection().collapseToEnd();
      };
      // Edit links end in "#entry-…", and the browser drops focus when it
      // scrolls there during load, so wait until loading is done.
      if (document.readyState === "complete") focusEditor();
      else addEventListener("load", focusEditor, { once: true });
    }
  }

  // ---- Post a form, then swap in the page it redirects to ----------------

  /** Visible, so focusing it makes sense (not inside a collapsed section). */
  const canFocus = (el) => {
    if (!el || !el.isConnected) return false;
    const closed = el.closest("details:not([open])");
    return !closed || closed.querySelector(":scope > summary")?.contains(el);
  };
  // Prefer the row's buttons over links inside its text.
  const firstControl = (row) =>
    row?.querySelector("button") ?? row?.querySelector('a[href], input:not([type="hidden"]), select, textarea');

  function swapPage(html, url, { focusCapture, draftKey }) {
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
    const focusIds = [active?.id, row?.id, row?.nextElementSibling?.id, row?.previousElementSibling?.id].filter(Boolean);
    const trayScroll = document.querySelector(".tray")?.scrollTop ?? 0;

    document.querySelector("main").replaceWith(nextMain);
    const nextNav = doc.querySelector(".nav");
    if (nextNav) document.querySelector(".nav")?.replaceWith(nextNav);
    document.title = doc.title;

    const target = new URL(url);
    target.searchParams.delete("error");
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
    if (!(form instanceof HTMLFormElement) || form.method.toLowerCase() !== "post") return;
    event.preventDefault();

    if (form.dataset.confirm && !confirm(form.dataset.confirm)) return;
    if (form.dataset.busy) return;
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

  let dateTimer = 0;
  document.addEventListener("change", (event) => {
    const el = event.target;
    if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement) || !el.hasAttribute("data-autosubmit")) return;
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

  document.addEventListener("click", async (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

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
        announce(status, "Copied. Paste it into your review.");
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

    // Close any open action menu when clicking elsewhere.
    document.querySelectorAll("details.menu[open]").forEach((menu) => {
      if (!menu.contains(target)) menu.removeAttribute("open");
    });
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

    if (event.key === "Escape") {
      // Close a menu, cancel an edit, or step out of a text field, in that order.
      const menu = document.querySelector("details.menu[open]");
      if (menu) {
        menu.removeAttribute("open");
        menu.querySelector("summary")?.focus();
        return;
      }
      const cancel = el?.closest(".edit-form")?.querySelector("a.btn.ghost");
      if (cancel) {
        cancel.click();
        return;
      }
      if (isTyping(el)) el.blur();
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

  initPage(document);
})();
