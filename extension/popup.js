(() => {
  "use strict";
  const K = globalThis.KarasuAuto;
  const appearance = globalThis.KarasuAppearance;
  let needsReload = chrome.runtime.getManifest().version !== K.VERSION;
  const reloadMessage = "Reload Karasu Helper on your browser’s Extensions page, then refresh Karasu.";
  const panel = globalThis.KarasuPanel.create(document.getElementById("app"), {
    settings: {},
    theme: appearance.get(),
    studio: globalThis.KarasuStudio?.create(chrome.storage.local),
    market: globalThis.KarasuMarketLoader,
    onExpand: () => chrome.runtime.openOptionsPage(),
    onThemeChange: theme => appearance.save(theme),
    onFaceitChange: enabled => chrome.storage.local.set({ faceitRanksEnabled: enabled }),
    onFaceitStyleChange: style => chrome.storage.local.set({ faceitRankStyle: style }),
    onAutoCopyChange: enabled => chrome.storage.local.set({ autoCopyConnect: enabled }),
    async onPatch(patch) {
      const result = await chrome.runtime.sendMessage({ type: "settings:save", patch });
      if (!result?.ok) throw new Error("save");
      return result.settings;
    },
    async onSkins(request) {
      if (needsReload) return { ok: false, reason: "reload-extension" };
      const dashboard = await chrome.runtime.sendMessage({ type: "dashboard" });
      if (!dashboard?.capabilities?.skins || dashboard.version !== K.VERSION) {
        needsReload = true;
        panel.updateStatus({ text: reloadMessage, level: "error" });
        return { ok: false, reason: "reload-extension" };
      }
      return chrome.runtime.sendMessage({ type: "skins:request", request });
    }
  });
  appearance.subscribe(theme => panel.updateTheme(theme));
  chrome.storage.local.get({ faceitRanksEnabled: true, faceitRankStyle: "badge", autoCopyConnect: false }).then(value => {
    panel.updateFaceitEnabled(value.faceitRanksEnabled);
    panel.updateFaceitStyle(value.faceitRankStyle);
    panel.updateAutoCopyEnabled(value.autoCopyConnect);
  }).catch(() => {});
  let busy = false;
  async function refresh() {
    if (busy) return;
    if (needsReload) { panel.updateStatus({ text: reloadMessage, level: "error" }); return; }
    busy = true;
    try {
      const result = await chrome.runtime.sendMessage({ type: "dashboard" });
      if (result?.ok) {
        if (result.version !== K.VERSION || !result.capabilities?.skins) {
          needsReload = true;
          panel.updateStatus({ text: reloadMessage, level: "error" });
          return;
        }
        panel.updateSettings(result.settings);
        panel.updateStatus(result.status);
        panel.updateHistory(result.history);
      }
    } catch {
      panel.updateStatus({ text: "Reload the extension and refresh Karasu.", level: "error" });
    } finally { busy = false; }
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.settings) panel.updateSettings(changes.settings.newValue);
    if (area === "local" && changes.faceitRanksEnabled) panel.updateFaceitEnabled(changes.faceitRanksEnabled.newValue);
    if (area === "local" && changes.faceitRankStyle) panel.updateFaceitStyle(changes.faceitRankStyle.newValue);
    if (area === "local" && changes.autoCopyConnect) panel.updateAutoCopyEnabled(changes.autoCopyConnect.newValue);
  });
  refresh();
  setInterval(refresh, 2000);
})();
