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

    // Panels like "Tags, time, goal, star" stay open if you left them open.
    root.querySelectorAll("details[data-remember-open]").forEach((details) => {
      const key = `open:${details.dataset.rememberOpen}`;
      if (localStorage.getItem(key) === "1") details.open = true;
      details.addEventListener("toggle", () => localStorage.setItem(key, details.open ? "1" : "0"));
    });
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
