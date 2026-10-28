(() => {
  "use strict";
  const normalize = value => value === "light" ? "light" : "dark";
  const listeners = new Set();
  let revision = 0;
  let theme = "dark";
  try { theme = normalize(localStorage.getItem("karasu-theme")); } catch { /* Use dark if local caching is unavailable. */ }

  function apply(value) {
    theme = normalize(value);
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("karasu-theme", theme); } catch { /* The extension storage remains authoritative. */ }
    for (const listener of listeners) listener(theme);
  }
  apply(theme);
  const ready = chrome.storage.local.get({ theme: "dark" }).then(value => {
    if (!revision) apply(value.theme);
    return theme;
  }).catch(() => theme);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.theme) return;
    revision++;
    apply(changes.theme.newValue);
  });
  globalThis.KarasuAppearance = Object.freeze({
    get: () => theme,
    ready,
    subscribe(listener) { listeners.add(listener); listener(theme); return () => listeners.delete(listener); },
    async save(value) {
      revision++;
      const next = normalize(value);
      await chrome.storage.local.set({ theme: next });
      apply(next);
    }
  });
})();
