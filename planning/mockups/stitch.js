(() => {
  const quickEntryButton = document.querySelector("[data-quick-entry]");
  const quickEntryTarget = document.querySelector("[data-quick-entry-target]");
  if (quickEntryButton && quickEntryTarget) {
    quickEntryButton.addEventListener("click", () => quickEntryTarget.focus());
  }

  document.querySelectorAll("[data-copy]").forEach((button) => {
    button.addEventListener("click", async () => {
      const target = document.querySelector(button.dataset.copy);
      const status = document.querySelector(button.dataset.copyStatus || "");
      if (!target) return;
      const text = "value" in target ? target.value : target.textContent;
      try {
        await navigator.clipboard.writeText(text.trim());
        if (status) status.textContent = "Copied";
      } catch {
        if (status) status.textContent = "Copy manually";
      }
    });
  });

  document.querySelectorAll("[data-segmented]").forEach((group) => {
    group.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button) return;
      group.querySelectorAll("button").forEach((item) => {
        item.classList.toggle("primary", item === button);
        item.setAttribute("aria-pressed", String(item === button));
      });
    });
  });
})();
