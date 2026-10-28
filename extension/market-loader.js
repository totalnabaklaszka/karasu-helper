(() => {
  "use strict";
  const M = globalThis.KarasuMarket;
  let loading;
  let current;
  async function load() {
    if (current) return current;
    if (!loading) loading = (async () => {
      const saved = await chrome.storage.local.get("marketSnapshot");
      current = M.validate(saved.marketSnapshot);
      try {
        const response = await fetch(chrome.runtime.getURL("data/prices.json"));
        if (!response.ok) throw new Error("Bundled prices unavailable");
        const bundled = M.validate(await response.json());
        if (bundled && (!current || bundled.updatedAt > current.updatedAt)) current = bundled;
      } catch (error) { if (!current) throw error; }
      if (!current) throw new Error("Prices unavailable");
      return current;
    })().finally(() => { loading = null; });
    return loading;
  }
  async function refresh() {
    // Permission is requested directly from the user's Update prices click.
    const granted = await chrome.permissions.request({ origins: [M.ORIGIN] });
    if (!granted) throw new Error("Price access was not granted. Bundled prices are still available.");
    const previous = await chrome.storage.local.get("marketRefreshAt");
    if (Date.now() - (previous.marketRefreshAt || 0) < 300000) throw new Error("Prices can be updated once every five minutes.");
    await chrome.storage.local.set({ marketRefreshAt: Date.now() });
    const response = await fetch(M.URL, { credentials: "omit", cache: "no-store", signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`Price service unavailable (${response.status}).`);
    if (!(response.headers.get("content-type") || "").includes("application/json")) throw new Error("The price service returned an unexpected response.");
    current = M.build(await response.json());
    await chrome.storage.local.set({ marketSnapshot: current });
    return current;
  }
  globalThis.KarasuMarketLoader = Object.freeze({ load, refresh });
})();
