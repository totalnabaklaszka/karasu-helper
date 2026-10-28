/* Short-lived countdown wakeups. No endless worker heartbeat or game control. */
(() => {
  "use strict";
  const wakeups = new Map();
  async function schedule(message, sender) {
    const delay = Number(message.delay);
    if (!Number.isInteger(sender.tab?.id) || typeof message.key !== "string" || message.key.length > 18000 || !Number.isFinite(delay) || delay < 1 || delay > 10000) return { ok: false, reason: "invalid" };
    const settings = globalThis.KarasuAuto.normalizeSettings((await chrome.storage.local.get("settings")).settings);
    if (!settings.acceptEnabled && !settings.mapsEnabled && !settings.locationsEnabled) return { ok: false, reason: "disabled" };
    const id = sender.tab.id;
    if (wakeups.get(id)?.key === message.key) return { ok: true };
    if (wakeups.has(id)) clearTimeout(wakeups.get(id).timer);
    const timer = setTimeout(() => {
      wakeups.delete(id);
      chrome.tabs.sendMessage(id, { type: "automation:tick" }).catch(() => {});
    }, Math.ceil(delay));
    wakeups.set(id, { key: message.key, timer });
    return { ok: true };
  }
  async function protect(message, sender) {
    const tabId = sender.tab.id;
    if (typeof chrome.tabs.get !== "function" || typeof chrome.tabs.update !== "function") return { ok: false };
    const session = await chrome.storage.session.get({ protectedTabs: {} });
    const records = session.protectedTabs;
    const existing = records[tabId];
    const settings = globalThis.KarasuAuto.normalizeSettings((await chrome.storage.local.get("settings")).settings);
    const path = new URL(sender.url).pathname;
    const eligible = path === "/play" || path.startsWith("/matches/");
    const enabled = message.enabled === true && eligible && (settings.acceptEnabled || settings.mapsEnabled || settings.locationsEnabled);
    if (enabled) {
      if (existing) return { ok: true };
      const tab = await chrome.tabs.get(tabId);
      records[tabId] = { previous: tab.autoDiscardable !== false };
      await chrome.storage.session.set({ protectedTabs: records });
      await chrome.tabs.update(tabId, { autoDiscardable: false });
    } else if (existing) {
      await chrome.tabs.update(tabId, { autoDiscardable: existing.previous });
      delete records[tabId];
      await chrome.storage.session.set({ protectedTabs: records });
    }
    return { ok: true };
  }
  async function release(tabId, closed = false) {
    if (wakeups.has(tabId)) clearTimeout(wakeups.get(tabId).timer);
    wakeups.delete(tabId);
    const session = await chrome.storage.session.get({ protectedTabs: {} });
    const previous = session.protectedTabs[tabId];
    if (!previous) return;
    if (!closed) try { await chrome.tabs.update(tabId, { autoDiscardable: previous.previous }); } catch { /* The tab may have closed during navigation. */ }
    delete session.protectedTabs[tabId];
    await chrome.storage.session.set({ protectedTabs: session.protectedTabs });
  }
  globalThis.KarasuBackground = Object.freeze({ schedule, protect, release });
})();
