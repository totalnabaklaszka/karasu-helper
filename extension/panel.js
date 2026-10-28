(() => {
  "use strict";
  const K = globalThis.KarasuAuto;
  let instance = 0;
  function create(root, options) {
    const prefix = `ka-${++instance}-`;
    let settings = K.normalizeSettings(options.settings);
    let committed = settings;
    const pendingPatches = [];
    let tab = "accept";
    let saving = Promise.resolve();
    let theme = options.theme === "light" ? "light" : "dark";
    let themeSaving = Promise.resolve();
    let themeRevision = 0;
    let faceitStyle = ["label", "minimal"].includes(options.faceitStyle) ? options.faceitStyle : "badge";
    root.innerHTML = `
      <section class="ka-panel" aria-label="Karasu Helper">
        <header class="ka-header">
          <div class="ka-brand"><img src="icons/48.png" alt="" width="30" height="30"><div>Karasu <span>Helper</span></div></div>
          <div class="ka-header-tools">
            <span class="ka-version">${K.VERSION}</span>
            <button type="button" class="ka-expand" data-expand title="Open full settings" aria-label="Open full settings"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-8 8M10 20H4V4h6M20 14v6h-6"/></svg></button>
            <div class="ka-theme" role="group" aria-label="Color theme">
              <button type="button" data-theme-choice="light" aria-label="Light mode" title="Light mode" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></svg></button>
              <button type="button" data-theme-choice="dark" aria-label="Dark mode" title="Dark mode" aria-pressed="true"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 13.1A8.5 8.5 0 0 1 10.9 3.5a8.5 8.5 0 1 0 9.6 9.6Z"/></svg></button>
            </div>
          </div>
        </header>
        <div class="ka-status" role="status" hidden><i></i><span></span></div>
        <nav class="ka-tabs" role="tablist" aria-label="Settings">
          <button type="button" role="tab" data-tab="accept">Queue</button>
          <button type="button" role="tab" data-tab="maps">Maps</button>
          <button type="button" role="tab" data-tab="locations">Servers</button>
          <button type="button" role="tab" data-tab="skins">Skins</button>
        </nav>
        <div class="ka-body">
          <section data-page="accept" role="tabpanel">
            <div data-toggle="acceptEnabled"></div><div data-range="acceptDelay"></div>
            <p class="ka-hint">Join the queue in Karasu. Your match will be accepted after this delay.</p>
            <label class="ka-toggle-row ka-copy-toggle"><span><strong>Auto-copy connect</strong><small>Copy when the server is ready or its address changes.</small></span><input class="ka-switch" data-auto-copy-connect type="checkbox" role="switch" aria-label="Auto-copy connect"></label>
            <label class="ka-toggle-row ka-faceit-toggle"><span><strong>FACEIT ranks</strong><small>Level and ELO on match scoreboards.</small></span><input class="ka-switch" data-faceit-enabled type="checkbox" role="switch" aria-label="FACEIT ranks"></label>
            <label class="ka-faceit-style"><span>Rank style</span><select data-faceit-style aria-label="FACEIT rank style"><option value="badge">Badge</option><option value="label">Label</option><option value="minimal">Minimal</option></select></label>
            <details class="ka-activity"><summary>Recent activity</summary><ol class="ka-history"></ol></details>
          </section>
          <section data-page="maps" role="tabpanel" hidden><div data-toggle="mapsEnabled"></div><div data-list="map"></div></section>
          <section data-page="locations" role="tabpanel" hidden><div data-toggle="locationsEnabled"></div><div data-list="location"></div></section>
          <section data-page="skins" role="tabpanel" hidden><div class="ka-skins-root"></div></section>
          <div data-range="vetoDelay" class="ka-veto-delay" hidden></div>
          <p class="ka-save" role="status" hidden></p>
        </div>
        <div class="ka-selection-dock" hidden></div>
        <footer class="ka-footer"><span class="ka-credit">made by : <strong>totalnabaklaszka</strong></span><a class="ka-support" href="https://ko-fi.com/totalnabaklaszka" target="_blank" rel="noopener noreferrer" title="Support totalnabaklaszka on Ko-fi" aria-label="Buy me a coffee on Ko-fi"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h12v7a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8Zm12 1h2a3 3 0 0 1 0 6h-2M7 3v2m4-2v2m4-2v2"/></svg><span>Buy me a coffee</span></a><button class="ka-stop" type="button">Disable all</button></footer>
      </section>`;
    const panel = root.querySelector(".ka-panel");
    const q = selector => panel.querySelector(selector);
    const skins = globalThis.KarasuSkinsPanel?.create(q(".ka-skins-root"), { request: options.onSkins, previewRoot: q(".ka-selection-dock"), studio: options.studio, market: options.market });
    q("[data-expand]").addEventListener("click", () => options.onExpand?.());
    function showSaveError(message = "") {
      q(".ka-save").textContent = message;
      q(".ka-save").hidden = !message;
    }
    function updateTheme(value) {
      theme = value === "light" ? "light" : "dark";
      document.documentElement.dataset.theme = theme;
      for (const button of panel.querySelectorAll("[data-theme-choice]")) button.setAttribute("aria-pressed", String(button.dataset.themeChoice === theme));
    }
    function updateFaceitEnabled(value) {
      q("[data-faceit-enabled]").checked = value !== false;
      q("[data-faceit-style]").disabled = value === false;
    }
    function updateAutoCopyEnabled(value) { q("[data-auto-copy-connect]").checked = value === true; }
    function updateFaceitStyle(value) {
      faceitStyle = ["label", "minimal"].includes(value) ? value : "badge";
      for (const option of q("[data-faceit-style]").querySelectorAll("option")) option.selected = option.value === faceitStyle;
    }
    function rebase() { settings = K.normalizeSettings(Object.assign({}, committed, ...pendingPatches)); render(); }
    function patch(change) {
      pendingPatches.push(change);
      rebase();
      showSaveError();
      saving = saving.then(async () => {
        try {
          const result = await options.onPatch(change);
          committed = K.normalizeSettings(result || { ...committed, ...change });
          pendingPatches.shift();
          rebase();
        } catch {
          pendingPatches.shift();
          rebase();
          showSaveError("Could not save. Try again.");
        }
      });
      return saving;
    }
    function toggle(field, title, description) {
      const target = q(`[data-toggle="${field}"]`);
      target.innerHTML = `<label class="ka-toggle-row"><span><strong></strong><small></small></span><input class="ka-switch" type="checkbox" role="switch"></label>`;
      target.querySelector("strong").textContent = title;
      target.querySelector("small").textContent = description;
      const input = target.querySelector("input");
      input.id = prefix + field;
      input.setAttribute("aria-label", title);
      input.addEventListener("change", () => patch({ [field]: input.checked }));
    }
    function range(field, title) {
      const target = q(`[data-range="${field}"]`);
      target.innerHTML = `<div class="ka-range-card"><div><label></label><output></output></div><input type="range" min="1" max="10" step="1"><div class="ka-range-ends"><span>1s</span><span>10s</span></div></div>`;
      const input = target.querySelector("input");
      input.id = prefix + field;
      target.querySelector("label").htmlFor = input.id;
      target.querySelector("label").textContent = title;
      target.querySelector("output").htmlFor = input.id;
      input.addEventListener("input", () => { target.querySelector("output").textContent = `${input.value}s`; });
      input.addEventListener("change", () => patch({ [field]: Number(input.value) }));
    }
    function list(kind) {
      const target = q(`[data-list="${kind}"]`);
      const catalog = kind === "map" ? K.MAPS : K.LOCATIONS;
      const field = kind === "map" ? "mapOrder" : "locationOrder";
      const order = settings[field];
      target.replaceChildren();
      const intro = document.createElement("p");
      intro.className = "ka-description";
      intro.textContent = "Ban from first to last.";
      const selected = document.createElement("ol");
      selected.className = "ka-selected";
      if (!order.length) {
        const empty = document.createElement("li");
        empty.className = "ka-empty";
        empty.textContent = "No priorities selected.";
        selected.append(empty);
      }
      order.forEach((id, index) => {
        const item = catalog.find(item => item.id === id);
        const row = document.createElement("li");
        row.className = "ka-selected-row";
        const number = document.createElement("span");
        number.className = "ka-position";
        number.textContent = String(index + 1);
        const name = document.createElement("span");
        name.className = "ka-item-name";
        name.textContent = item.label;
        row.append(number, name);
        for (const [action, label, symbol] of [["up", "Move up", "↑"], ["down", "Move down", "↓"], ["remove", "Remove", "×"]]) {
          const button = document.createElement("button");
          button.className = "ka-icon";
          button.type = "button";
          button.textContent = symbol;
          button.setAttribute("aria-label", `${label}: ${item.label}`);
          button.title = `${label}: ${item.label}`;
          button.disabled = (action === "up" && index === 0) || (action === "down" && index === order.length - 1);
          button.addEventListener("click", () => {
            const next = [...settings[field]];
            const position = next.indexOf(id);
            if (action === "remove") next.splice(position, 1);
            else {
              const other = position + (action === "up" ? -1 : 1);
              [next[position], next[other]] = [next[other], next[position]];
            }
            patch({ [field]: next });
          });
          row.append(button);
        }
        selected.append(row);
      });
      const available = document.createElement("div");
      available.className = "ka-available";
      for (const item of catalog.filter(item => !order.includes(item.id))) {
        const button = document.createElement("button");
        button.className = "ka-add";
        button.type = "button";
        const name = document.createElement("span");
        name.textContent = item.label;
        const plus = document.createElement("span");
        plus.textContent = "+";
        button.append(name, plus);
        button.setAttribute("aria-label", `Add to ban order: ${item.label}`);
        button.addEventListener("click", () => patch({ [field]: [...settings[field], item.id] }));
        available.append(button);
      }
      target.append(intro, selected, available);
      const fallback = document.createElement("details");
      fallback.className = "ka-fallback";
      const summary = document.createElement("summary");
      summary.textContent = "After your priorities";
      const description = document.createElement("p");
      description.textContent = catalog.filter(item => !order.includes(item.id)).map(item => item.label).join(" → ") || "New options are handled alphabetically.";
      fallback.append(summary, description);
      target.append(fallback);
    }
    function render() {
      for (const field of ["acceptEnabled", "mapsEnabled", "locationsEnabled"]) q(`[data-toggle="${field}"] input`).checked = settings[field];
      for (const field of ["acceptDelay", "vetoDelay"]) {
        const target = q(`[data-range="${field}"]`);
        target.querySelector("input").value = settings[field];
        target.querySelector("output").textContent = `${settings[field]}s`;
      }
      list("map"); list("location");
      for (const button of panel.querySelectorAll("[data-tab]")) {
        const selected = button.dataset.tab === tab;
        button.setAttribute("aria-selected", String(selected));
        button.tabIndex = selected ? 0 : -1;
      }
      for (const page of panel.querySelectorAll("[data-page]")) page.hidden = page.dataset.page !== tab;
      q(".ka-veto-delay").hidden = !["maps", "locations"].includes(tab);
      skins?.setVisible(tab === "skins");
    }
    toggle("acceptEnabled", "Auto accept", "Accept match ready automatically.");
    toggle("mapsEnabled", "Auto ban maps", "Follow your saved ban order.");
    toggle("locationsEnabled", "Auto ban servers", "Follow your saved location order.");
    range("acceptDelay", "Accept delay");
    range("vetoDelay", "Ban delay");
    const tabs = [...panel.querySelectorAll("[data-tab]")];
    function selectTab(button) { tab = button.dataset.tab; render(); if (tab === "skins") skins?.open(); }
    tabs.forEach((button, index) => {
      button.id = prefix + button.dataset.tab + "-tab";
      button.setAttribute("aria-controls", prefix + button.dataset.tab + "-page");
      const page = q(`[data-page="${button.dataset.tab}"]`);
      page.id = prefix + button.dataset.tab + "-page";
      page.setAttribute("aria-labelledby", button.id);
      button.addEventListener("click", () => selectTab(button));
      button.addEventListener("keydown", event => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
        selectTab(tabs[next]); tabs[next].focus();
      });
    });
    q(".ka-stop").addEventListener("click", async () => {
      const button = q(".ka-stop"), previousCopy = q("[data-auto-copy-connect]").checked;
      button.disabled = true;
      const stopped = patch({ acceptEnabled: false, mapsEnabled: false, locationsEnabled: false });
      updateAutoCopyEnabled(false);
      try { await options.onAutoCopyChange?.(false); }
      catch { updateAutoCopyEnabled(previousCopy); showSaveError("Could not disable Auto-copy connect. Use its switch to try again."); }
      await stopped; button.disabled = false;
    });
    q("[data-auto-copy-connect]").addEventListener("change", async event => {
      const input = event.target;
      const next = input.checked;
      input.disabled = true; showSaveError();
      try { await options.onAutoCopyChange?.(next); }
      catch { updateAutoCopyEnabled(!next); showSaveError("Could not save Auto-copy connect. Try again."); }
      finally { input.disabled = false; }
    });
    q("[data-faceit-enabled]").addEventListener("change", async event => {
      const input = event.target;
      const next = input.checked;
      updateFaceitEnabled(next);
      input.disabled = true; showSaveError();
      try { await options.onFaceitChange?.(next); }
      catch { updateFaceitEnabled(!next); showSaveError("Could not save FACEIT display. Try again."); }
      finally { input.disabled = false; }
    });
    q("[data-faceit-style]").addEventListener("change", async event => {
      const input = event.target;
      const previous = faceitStyle;
      const next = input.value;
      updateFaceitStyle(next);
      input.disabled = true; showSaveError();
      try { await options.onFaceitStyleChange?.(next); }
      catch { updateFaceitStyle(previous); showSaveError("Could not save the rank style. Try again."); }
      finally { input.disabled = !q("[data-faceit-enabled]").checked; }
    });
    for (const button of panel.querySelectorAll("[data-theme-choice]")) button.addEventListener("click", () => {
      const previous = theme;
      const next = button.dataset.themeChoice;
      const revision = ++themeRevision;
      updateTheme(next);
      themeSaving = themeSaving.then(async () => {
        try { await options.onThemeChange?.(next); }
        catch {
          if (revision === themeRevision) updateTheme(previous);
          showSaveError("Could not save the theme. Try again.");
        }
      });
    });
    updateTheme(theme);
    updateFaceitEnabled(options.faceitEnabled);
    updateAutoCopyEnabled(options.autoCopyConnect);
    updateFaceitStyle(faceitStyle);
    render();
    return {
      updateTheme,
      updateFaceitEnabled,
      updateAutoCopyEnabled,
      updateFaceitStyle,
      updateSettings(value) {
        if (K.settingsKey(value) === K.settingsKey(committed)) return;
        committed = K.normalizeSettings(value); rebase();
      },
      updateStatus(value) {
        const level = value?.level || "idle";
        const text = value?.text || "";
        const hidden = !text || level === "idle" || text === "Waiting for a match or your turn.";
        q(".ka-status").hidden = hidden;
        q(".ka-status").dataset.level = level;
        q(".ka-status span").textContent = hidden ? "" : text;
      },
      updateHistory(entries) {
        const history = q(".ka-history");
        history.replaceChildren();
        if (!entries?.length) {
          const empty = document.createElement("li"); empty.className = "ka-empty"; empty.textContent = "No activity this session."; history.append(empty);
        }
        for (const entry of (entries || []).slice(0, 6)) {
          const row = document.createElement("li");
          const text = document.createElement("span");
          const time = document.createElement("time");
          text.textContent = entry.text;
          time.dateTime = new Date(entry.at).toISOString();
          time.textContent = new Date(entry.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
          row.dataset.ok = String(entry.ok); row.append(text, time); history.append(row);
        }
      }
    };
  }
  globalThis.KarasuPanel = Object.freeze({ create });
})();
