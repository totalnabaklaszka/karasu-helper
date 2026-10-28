(() => {
  "use strict";
  const S = globalThis.KarasuSkins;
  const M = globalThis.KarasuMarket;
  function create(root, options) {
    let data = null;
    let targetTab;
    let busy = false;
    let source = "catalog";
    let catalogItems = [];
    let candidate = null;
    let catalogLocked = false;
    let shown = 24;
    let epoch = 0;
    let market = null;
    let studio = { preferences: {}, favorites: [], presets: [] };
    let studioLoaded = false;
    let builderPlan = null;
    let builderCatalog = [];
    const lockedSlots = new Set();
    let batchStop = false;
    let applyingBatch = false;
    root.innerHTML = `
      <div class="ka-skins-heading"><span class="ka-caption">Skin library <span class="ka-studio-tag">STUDIO</span></span><button type="button" class="ka-text-button" data-refresh>Refresh</button></div>
      <p class="ka-skins-status" role="status">Open Karasu to browse the skin catalog.</p>
      <fieldset class="ka-skin-controls" disabled>
        <div class="ka-skin-filters">
          <label><span>Team filter</span><select data-team aria-label="Team filter"><option value="both" selected>Both</option><option value="CT">CT</option><option value="T">T</option></select></label>
          <label><span>Weapon</span><select data-weapon aria-label="Weapon"><option value="all" selected>All weapons</option></select></label>
        </div>
        <input class="ka-search" type="search" data-search aria-label="Search skins" placeholder="Search skins, e.g. red AK…" maxlength="100">
        <div class="ka-colors" role="group" aria-label="Finish colour"></div>
        <details class="ka-studio-filters"><summary>Loadout filters <span>Colour · Value · Rarity</span></summary>
          <div class="ka-style-presets" role="group" aria-label="Colour presets"><button type="button" data-style-preset="red">Redline</button><button type="button" data-style-preset="blue">Ice</button><button type="button" data-style-preset="green">Toxic</button><button type="button" data-style-preset="white">Clean</button><button type="button" data-style-preset="all">Reset</button></div>
          <div class="ka-value-filters"><label>Min. market value (USD)<input type="number" data-min-value min="0" max="100000" step="1" value="0" placeholder="0"></label><label>Minimum rarity<select data-rarity><option value="0">Any rarity</option><option value="4">Restricted +</option><option value="5">Classified +</option><option value="6">Covert +</option></select></label></div>
          <label class="ka-studio-check"><input type="checkbox" data-skip-default checked>Skip default skins</label>
          <p class="ka-market-info" data-market-info>Market values are indicative. Karasu crafting is free.</p><button type="button" class="ka-text-button" data-price-refresh>Update prices</button>
        </details>
        <div class="ka-skin-actions"><button type="button" data-random>Random weapon</button><button type="button" data-loadout>Random loadout</button></div>
        <div class="ka-saved-sets"><select data-saved-set aria-label="Saved loadout"><option value="">Saved loadouts…</option></select><button type="button" class="ka-text-button" data-load-set>Load</button><button type="button" class="ka-text-button" data-delete-set aria-label="Delete selected loadout">×</button></div>
        <div class="ka-source" role="group" aria-label="Catalog tools"><button type="button" data-source="catalog" aria-pressed="true">Catalog</button><button type="button" data-favorites aria-label="Show favorites" aria-pressed="false">☆</button><span data-count></span><select data-sort aria-label="Sort skins"><option value="name">A–Z</option><option value="price-high">Value ↓</option><option value="price-low">Value ↑</option></select></div>
      </fieldset>
      <section class="ka-skin-preview" aria-label="Selection preview" hidden><div class="ka-preview-title"><strong>Preview</strong><button type="button" class="ka-text-button" data-cancel>Cancel</button></div><ul></ul><p class="ka-hint" data-preview-hint></p><div class="ka-builder-tools" data-builder-tools hidden><div class="ka-builder-top"><button type="button" class="ka-text-button" data-reroll>↻ Reroll unlocked</button><span data-locked-count></span></div><div class="ka-save-set"><input data-set-name aria-label="Loadout name" placeholder="Name this loadout" maxlength="40"><button type="button" class="ka-text-button" data-save-set>Save</button></div><button type="button" class="ka-primary" data-craft-batch>Craft & equip loadout</button></div><div class="ka-craft-actions" data-craft-actions role="group" aria-label="Craft and equip for a team" hidden><button type="button" class="ka-primary" data-craft-team="T">Craft for T</button><button type="button" class="ka-primary" data-craft-team="CT">Craft for CT</button><button type="button" class="ka-primary" data-craft-team="both" title="Equips compatible teams only">Craft for Both</button></div><button type="button" class="ka-primary" data-apply>Apply</button><p class="ka-dock-status" data-dock-status role="status" hidden></p></section>
      <div class="ka-skin-results"></div><button type="button" class="ka-text-button ka-more" data-more hidden>Show more</button>
      <p class="ka-hint" data-source-hint>Search the full catalog. Craft & equip a skin for your selected team. Colour tags are approximate.</p>
      <a class="ka-site-link" data-open-site target="_blank" rel="noopener noreferrer">Open Karasu Skins</a>`;
    const previewElement = root.querySelector(".ka-skin-preview");
    if (options.previewRoot) options.previewRoot.append(previewElement);
    const q = selector => root.querySelector(selector) || previewElement.matches(selector) && previewElement || previewElement.querySelector(selector);
    const all = selector => [...root.querySelectorAll(selector), ...(options.previewRoot ? previewElement.querySelectorAll(selector) : [])];
    let color = "all";
    function filter() { return { weapon: q("[data-weapon]").value, team: q("[data-team]").value, query: q("[data-search]").value, color, minValue: Math.min(100000, Math.max(0, Number(q("[data-min-value]").value) || 0)), rarity: Number(q("[data-rarity]").value) || 0, skipDefault: q("[data-skip-default]").checked }; }
    function note(text, error = false) {
      q(".ka-skins-status").textContent = text; q(".ka-skins-status").dataset.error = String(error);
      const status = q("[data-dock-status]"); status.textContent = text; status.title = text; status.hidden = !text; status.dataset.error = String(error);
    }
    const priced = entry => M && market ? M.annotate(entry, market) : entry;
    const priceText = entry => M?.format(S.marketValue(entry)) || "";
    function filtered(items, criteria = filter()) { return items.map(priced).filter(entry => S.matches(entry, criteria) && (q("[data-favorites]").getAttribute("aria-pressed") !== "true" || studio.favorites.includes(S.itemOf(entry).id))); }
    async function saveStudio(patch) {
      studio = { ...studio, ...patch };
      if (options.studio) try { studio = await options.studio.update(patch); } catch { note("Could not save Studio settings on this device.", true); }
    }
    function saveFilters() { saveStudio({ preferences: { ...filter(), sort: q("[data-sort]").value, favoritesOnly: q("[data-favorites]").getAttribute("aria-pressed") === "true" } }); }
    function renderSaved() {
      const select = q("[data-saved-set]"), selected = select.value;
      select.replaceChildren();
      const empty = document.createElement("option"); empty.value = ""; empty.textContent = "Saved loadouts…"; select.append(empty);
      for (const preset of studio.presets) { const option = document.createElement("option"); option.value = preset.id; option.textContent = preset.name; option.selected = preset.id === selected; select.append(option); }
      q("[data-load-set]").disabled = !studio.presets.length;
      q("[data-delete-set]").disabled = !studio.presets.length;
    }
    function applyFilters(prefs) {
      if (!prefs || !Object.keys(prefs).length) return;
      color = S.COLORS.includes(prefs.color) ? prefs.color : "all";
      q("[data-min-value]").value = prefs.minValue || 0;
      for (const option of q("[data-rarity]").querySelectorAll("option")) option.selected = option.value === String(prefs.rarity || 0);
      for (const option of q("[data-sort]").querySelectorAll("option")) option.selected = option.value === (prefs.sort || "name");
      for (const option of q("[data-team]").querySelectorAll("option")) option.selected = option.value === (prefs.team || "both");
      q("[data-skip-default]").checked = prefs.skipDefault !== false;
      q("[data-favorites]").setAttribute("aria-pressed", String(prefs.favoritesOnly === true));
      renderColors();
    }
    function renderColors() { for (const chip of root.querySelectorAll("[data-color]")) chip.setAttribute("aria-pressed", String(chip.dataset.color === color)); }
    function renderMarket() {
      q("[data-market-info]").textContent = market ? `Skinport · ${new Date(market.updatedAt).toLocaleDateString("en-GB")} · lowest listing, any wear. Karasu crafting is free.` : "Prices unavailable. A value filter skips skins without a known price. Karasu crafting is free.";
    }
    function setBusy(value) {
      busy = value;
      q(".ka-skin-controls").disabled = value || !data;
      q("[data-apply]").disabled = value || !!q("[data-apply]").dataset.state;
      q("[data-refresh]").disabled = value;
      q("[data-cancel]").disabled = value && !applyingBatch;
      q("[data-cancel]").textContent = applyingBatch ? "Stop after this skin" : "Cancel";
      for (const button of root.querySelectorAll(".ka-skin-result")) button.disabled = value;
      for (const button of all(".ka-catalog-equip")) button.disabled = value || !!button.dataset.state;
      for (const button of all("[data-reroll], [data-save-set], .ka-slot-reroll, .ka-slot-lock")) button.disabled = value || !!button.dataset.state;
      q("[data-craft-batch]").disabled = value || !builderPlan || builderPlan.entries.every(entry => entry.state) || builderPlan.entries.some(entry => entry.state === "check");
      updateCraftButtons();
    }
    function updateCraftButtons() {
      const teams = candidate?.source === "catalog" ? candidate.entry.teams : [];
      for (const button of all("[data-craft-team]")) {
        const team = button.dataset.craftTeam;
        const compatible = team === "both" || !teams?.length || teams.includes(team);
        button.disabled = busy || catalogLocked || !compatible;
        button.title = !compatible ? "This weapon is unavailable for this team." : team === "both" ? "Equips compatible teams only" : `Craft and equip for ${team}`;
      }
    }
    async function send(request) {
      if (!options.request) return { ok: false, reason: "no-tab" };
      const result = await options.request({ ...request, ...(Number.isInteger(targetTab) ? { tabId: targetTab } : {}) });
      if (Number.isInteger(result?.tabId)) targetTab = result.tabId;
      return result;
    }
    const reason = code => code === "reload-extension" ? "Reload Karasu Helper on your browser’s Extensions page, then refresh Karasu." : code === "origin" ? "The extension could not verify its panel. Reload the extension and refresh Karasu." : code === "sign-in" ? "Sign in to Karasu, then refresh this panel." : code === "no-tab" ? "Open or refresh a Karasu tab, then try again." : code === "stale" ? "Your loadout changed. Refresh and make a new selection." : code === "incompatible-team" ? "This weapon cannot be equipped for the selected team. Choose CT, T or Both." : code === "busy" ? "Another skin change is in progress." : code === "timeout" ? "Request timed out. Refresh to check your loadout before trying again." : code === "unconfirmed" ? "The saved change could not be confirmed. Check your Karasu inventory before trying again." : `Could not complete the request${code ? ` (${code})` : ""}.`;
    function updateLink() {
      const base = data?.skinBase || S.SKIN_BASE;
      const valid = typeof base === "string" && /^\/apps\/[a-z0-9_-]+$/i.test(base);
      const link = q("[data-open-site]");
      link.hidden = !valid;
      if (valid) link.href = "https://karasu.live" + base;
    }
    async function refresh() {
      if (busy) return;
      targetTab = undefined;
      resetPreview();
      note(source === "catalog" ? "Loading catalog…" : "Loading inventory…"); setBusy(true);
      const previous = data;
      try {
        if (!studioLoaded) {
          studioLoaded = true;
          if (options.studio) { studio = await options.studio.load(); applyFilters(studio.preferences); renderSaved(); }
          if (options.market) { try { market = await options.market.load(); } catch { /* Search remains available. */ } }
          renderMarket();
        }
        const result = await send({ type: "read", action: { catalogOnly: source === "catalog" } });
        if (!result?.ok) throw new Error(result?.reason || "request-failed");
        data = result.data;
        const select = q("[data-weapon]");
        const selected = select.value;
        select.replaceChildren();
        for (const item of [{ model: "all", name: "All weapons" }, ...data.weapons, { model: "knife", name: "Knife" }, { model: "gloves", name: "Gloves" }]) {
          const option = document.createElement("option"); option.value = item.model; option.textContent = item.name; select.append(option);
        }
        const value = [...select.querySelectorAll("option")].some(option => option.value === selected) ? selected : "all";
        for (const option of select.querySelectorAll("option")) option.selected = false;
        [...select.querySelectorAll("option")].find(option => option.value === value).selected = true;
        updateLink();
        if (source === "owned") note(`${data.inventory.length} skins in your inventory.`);
        await loadCatalog();
      } catch (error) {
        data = previous ? { ...previous, inventory: [], loadout: [], preset: "", personal: false } : null;
        note(reason(error.message), true);
      }
      finally { setBusy(false); renderResults(); }
    }
    async function loadCatalog() {
      catalogItems = [];
      if (source !== "catalog" || !data) return;
      const revision = ++epoch;
      const result = await send({ type: "read", action: { catalogWeapon: q("[data-weapon]").value } });
      if (revision !== epoch) return;
      if (!result?.ok) { note(reason(result?.reason), true); return; }
      catalogItems = result.items || [];
      note(`${catalogItems.length} skins in the Karasu catalog.`);
    }
    function resetPreview(keepBuilder = false) {
      candidate = null; catalogLocked = false;
      if (keepBuilder !== true) { builderPlan = null; lockedSlots.clear(); }
      q(".ka-skin-preview").hidden = true;
      q("[data-apply]").dataset.state = "";
      q("[data-craft-actions]").hidden = true;
      q("[data-builder-tools]").hidden = true;
      q("[data-dock-status]").hidden = true;
      for (const button of all("[data-craft-team]")) { button.dataset.state = ""; button.textContent = `Craft for ${button.dataset.craftTeam === "both" ? "Both" : button.dataset.craftTeam}`; }
    }
    function preview(plan) {
      if (!plan.entries.length) { resetPreview(); note("No matching changes. Try another weapon or colour."); return; }
      resetPreview(); candidate = plan;
      q(".ka-preview-title strong").textContent = "Preview";
      const list = q(".ka-skin-preview ul"); list.replaceChildren();
      for (const entry of plan.entries) {
        const row = document.createElement("li");
        const team = document.createElement("span"); team.className = "ka-preview-team"; team.textContent = entry.team;
        const name = document.createElement("span"); name.textContent = entry.name;
        row.append(team, name); list.append(row);
      }
      q("[data-preview-hint]").textContent = `${plan.entries.length} slot${plan.entries.length === 1 ? "" : "s"} to update${plan.skipped ? ` · ${plan.skipped} unchanged or without a match` : ""}.`;
      q("[data-apply]").textContent = `Apply ${plan.entries.length === 1 ? "skin" : "loadout"}`;
      q("[data-apply]").hidden = false;
      q("[data-apply]").dataset.state = "";
      q("[data-apply]").disabled = false;
      q(".ka-skin-preview").hidden = false;
    }
    function catalogPreviewPlan(plan, preserve = false) {
      resetPreview(preserve);
      if (!plan.entries.length) { note("No matching skins. Try another colour."); return; }
      const builder = plan.isBuilder === true || plan.entries.length > 1;
      plan.entries = plan.entries.map(entry => ({ ...entry, operationId: entry.operationId || crypto.randomUUID() }));
      if (builder) builderPlan = plan;
      q(".ka-preview-title strong").textContent = builder ? "Loadout Studio" : "Craft & equip";
      const list = q(".ka-skin-preview ul"); list.replaceChildren();
      for (const entry of plan.entries) {
        const selection = entry;
        selection.team ||= filter().team;
        const item = (builder ? builderCatalog : catalogItems).find(item => String(item.id) === String(entry.catalogId));
        const row = document.createElement("li");
        row.dataset.slotKey = `${entry.team}:${entry.slot}`;
        if (entry.team) { const team = document.createElement("span"); team.className = "ka-preview-team"; team.textContent = entry.team; row.append(team); }
        const name = document.createElement("span");
        name.className = "ka-preview-name";
        name.textContent = entry.name;
        if (builder && item) { const detail = document.createElement("small"); detail.textContent = `${entry.slot.toUpperCase()}${S.marketValue(priced(item)) ? ` · from ${priceText(priced(item))}` : ""}`; name.append(detail); }
        row.append(name);
        if (!builder) {
          candidate = { source: "catalog", entry: { ...selection, teams: item?.teams || [] } };
        }
        else {
          const key = `${entry.team}:${entry.slot}`;
          const lock = document.createElement("button"); lock.type = "button"; lock.className = "ka-text-button ka-slot-lock";
          lock.textContent = lockedSlots.has(key) ? "●" : "○"; lock.setAttribute("aria-pressed", String(lockedSlots.has(key))); lock.setAttribute("aria-label", `Lock ${entry.team} ${entry.slot}`); lock.title = lockedSlots.has(key) ? "Unlock slot" : "Keep this skin when rerolling";
          lock.addEventListener("click", () => { if (busy || entry.state) return; lockedSlots.has(key) ? lockedSlots.delete(key) : lockedSlots.add(key); catalogPreviewPlan(builderPlan, true); });
          const reroll = document.createElement("button"); reroll.type = "button"; reroll.className = "ka-text-button ka-slot-reroll"; reroll.textContent = "↻"; reroll.title = "Reroll this slot"; reroll.setAttribute("aria-label", `Reroll ${entry.team} ${entry.slot}`);
          reroll.addEventListener("click", () => { if (!busy && !entry.state) rerollBuilder(key); });
          lock.disabled = reroll.disabled = !!entry.state;
          lock.dataset.state = reroll.dataset.state = entry.state || "";
          const button = document.createElement("button");
          button.type = "button"; button.className = "ka-text-button ka-catalog-equip"; button.textContent = entry.state === "done" ? "Equipped" : entry.state === "check" ? "Check" : "Equip"; button.dataset.state = entry.state || ""; button.disabled = !!entry.state;
          button.setAttribute("aria-label", `Craft & equip ${entry.name} for ${selection.team}`);
          button.addEventListener("click", () => craftSelection(selection, button));
          row.append(lock, reroll, button);
        }
        list.append(row);
      }
      q("[data-preview-hint]").textContent = `${plan.personal === false ? "Default CT/T weapon roster. " : ""}${builder ? "Lock a slot to keep it. No match = unchanged. " : "Default wear and pattern, no stickers or custom name. Both equips compatible teams only."}${plan.skipped ? ` ${plan.skipped} slots unchanged.` : ""}`;
      q("[data-apply]").hidden = true;
      q("[data-craft-actions]").hidden = builder;
      q("[data-builder-tools]").hidden = !builder;
      q("[data-locked-count]").textContent = `${lockedSlots.size} locked`;
      q("[data-craft-batch]").disabled = plan.entries.every(entry => entry.state) || plan.entries.some(entry => entry.state === "check");
      updateCraftButtons();
      q(".ka-skin-preview").hidden = false;
    }
    function catalogPreview(entry) { catalogPreviewPlan({ entries: [{ catalogId: entry.id, name: S.displayName(entry) }] }); }
    async function craftSelection(selection, button) {
      if (busy || button.dataset.state) return;
      setBusy(true); note("Crafting & equipping…");
      try {
        const { operationId, catalogId, team } = selection;
        const result = await send({ type: "craft", action: { operationId, catalogId, team } });
        if (result?.data) data = result.data;
        if (result?.ok) {
          selection.state = "done";
          button.dataset.state = "done"; button.textContent = "Equipped";
          if (button.hasAttribute("data-craft-team")) catalogLocked = true;
          note(`Crafted and equipped for ${(result.equipped || []).join(" + ")}. Refresh the Skins page to update its preview.`);
        } else {
          if (result?.uncertain || result?.created) { selection.state = "check"; button.dataset.state = "check"; button.textContent = "Check inventory"; if (button.hasAttribute("data-craft-team")) catalogLocked = true; }
          note(`${result?.created ? "Skin created in your inventory. " : ""}${reason(result?.reason)}${result?.uncertain ? " A submitted change may have completed. Check your inventory before trying again." : ""}`, true);
        }
      } catch {
        selection.state = "check";
        button.dataset.state = "check"; button.textContent = "Check inventory";
        if (button.hasAttribute("data-craft-team")) catalogLocked = true;
        note("Request interrupted. A skin may have been created. Check your Karasu inventory before trying again.", true);
      } finally {
        const row = button.closest("li");
        if (selection.state && row) for (const control of row.querySelectorAll(".ka-slot-lock, .ka-slot-reroll")) control.dataset.state = selection.state;
        setBusy(false); renderResults();
      }
    }
    function imageUrl(value) {
      try {
        const url = new URL(value, "https://inventory.karasu.live/cdn/");
        if (url.protocol === "https:" && url.hostname === "inventory.karasu.live") {
          if (url.pathname.startsWith("/images/")) url.pathname = "/cdn" + url.pathname;
          return url.href;
        }
      } catch { /* Images are optional. */ }
      return null;
    }
    function renderResults() {
      const target = q(".ka-skin-results"); target.replaceChildren();
      const items = filtered(source === "owned" ? data?.inventory || [] : catalogItems);
      const sort = q("[data-sort]").value;
      items.sort((a, b) => sort === "price-high" ? (S.marketValue(b) ?? -1) - (S.marketValue(a) ?? -1) || S.displayName(a).localeCompare(S.displayName(b)) : sort === "price-low" ? (S.marketValue(a) ?? Infinity) - (S.marketValue(b) ?? Infinity) || S.displayName(a).localeCompare(S.displayName(b)) : S.displayName(a).localeCompare(S.displayName(b)));
      q("[data-count]").textContent = `${items.length}`;
      q("[data-more]").hidden = items.length <= shown;
      if (!items.length && data) {
        const empty = document.createElement("p"); empty.className = "ka-empty";
        empty.textContent = "No matching skins. Lower the minimum value, change colour or clear Favorites.";
        target.append(empty);
      }
      for (const entry of items.slice(0, shown)) {
        const card = document.createElement("div"); card.className = "ka-skin-card";
        const button = document.createElement("button"); button.type = "button"; button.className = "ka-skin-result"; button.disabled = busy;
        const item = S.itemOf(entry); const image = imageUrl(item.image);
        if (image) { const img = document.createElement("img"); img.src = image; img.alt = ""; img.loading = "lazy"; img.referrerPolicy = "no-referrer"; img.addEventListener("error", () => img.remove()); button.append(img); }
        const name = document.createElement("span"); name.textContent = S.displayName(entry); button.append(name);
        if (S.marketValue(entry)) { const price = document.createElement("small"); price.textContent = `from ${priceText(entry)}`; price.title = "Lowest Skinport listing across wear conditions. Not a Karasu price."; button.append(price); }
        button.addEventListener("click", () => {
          if (busy) return;
          q("[data-apply]").hidden = false;
          source === "catalog" ? catalogPreview(entry) : preview(S.plan({ ...data, inventory: data.inventory.map(priced) }, { ...filter(), mode: "equip", itemId: entry.id }));
        });
        const favorite = document.createElement("button"); favorite.type = "button"; favorite.className = "ka-favorite";
        const id = S.itemOf(entry).id;
        favorite.textContent = studio.favorites.includes(id) ? "★" : "☆"; favorite.setAttribute("aria-pressed", String(studio.favorites.includes(id))); favorite.setAttribute("aria-label", `Favorite ${S.displayName(entry)}`);
        favorite.addEventListener("click", async () => { if (busy) return; const favorites = studio.favorites.includes(id) ? studio.favorites.filter(value => value !== id) : [...studio.favorites, id].slice(-500); await saveStudio({ favorites }); renderResults(); });
        card.append(button, favorite); target.append(card);
      }
    }
    function rerollBuilder(onlyKey) {
      if (!builderPlan || busy) return;
      let changed = 0;
      for (const entry of builderPlan.entries) {
        const key = `${entry.team}:${entry.slot}`;
        if (entry.state || (onlyKey ? key !== onlyKey : lockedSlots.has(key))) continue;
        const weapon = S.roster(data, entry.team)[entry.slot];
        const pool = filtered(builderCatalog, { ...filter(), team: entry.team, weapon, query: "" }).filter(item => item.id !== entry.catalogId);
        if (!pool.length) continue;
        const item = pool[Math.floor(Math.random() * pool.length)];
        entry.catalogId = item.id; entry.name = S.displayName(item); entry.operationId = crypto.randomUUID();
        changed++;
      }
      catalogPreviewPlan(builderPlan, true);
      note(changed ? `${changed} slot${changed === 1 ? "" : "s"} rerolled. Locked slots kept.` : "No alternative matches these filters. Your selections are unchanged.");
    }
    async function craftBatch() {
      if (!builderPlan || busy) return;
      if (builderPlan.entries.some(entry => entry.state === "check")) { note("Check inventory before starting another batch.", true); return; }
      applyingBatch = true; batchStop = false; setBusy(true);
      let confirmed = 0, stopped = false;
      // A shared catalog skin is crafted once, then equipped for both teams.
      const groups = new Map();
      for (const entry of builderPlan.entries.filter(entry => !entry.state)) {
        if (!groups.has(entry.catalogId)) groups.set(entry.catalogId, []);
        groups.get(entry.catalogId).push(entry);
      }
      try {
        for (const [catalogId, entries] of groups) {
          if (batchStop) break;
          const teams = [...new Set(entries.map(entry => entry.team))];
          const team = teams.length > 1 ? "both" : teams[0];
          note(`Equipping ${confirmed + 1}/${groups.size}: ${entries[0].name}`);
          let result;
          try { result = await send({ type: "craft", action: { operationId: entries[0].operationId, catalogId, team } }); }
          catch { result = { ok: false, uncertain: true, reason: "interrupted" }; }
          if (result?.data) data = result.data;
          if (!result?.ok) {
            if (result?.created || result?.uncertain) for (const entry of entries) entry.state = "check";
            note(`Stopped after ${confirmed} confirmed skins. ${result?.created ? "Current skin created. " : ""}${result?.equipped?.length ? `${result.equipped.join(" + ")} equipped. ` : ""}${reason(result?.reason)}${result?.created || result?.uncertain ? " Check inventory before continuing." : ""}`, true);
            stopped = true; break;
          }
          for (const entry of entries) { entry.state = "done"; lockedSlots.add(`${entry.team}:${entry.slot}`); }
          confirmed++;
        }
      } finally {
        const message = q("[data-dock-status]").textContent;
        applyingBatch = false; setBusy(false); catalogPreviewPlan(builderPlan, true);
        if (stopped) note(message, true);
        else note(batchStop ? `Stopped after ${confirmed} skins. Remaining slots were not changed.` : `Equipped ${confirmed} skins. Refresh Karasu to update its preview.`);
        q("[data-cancel]").textContent = "Cancel";
        renderResults();
      }
    }
    async function changed() {
      epoch++; shown = 24; resetPreview();
      if (source === "catalog") { setBusy(true); try { await loadCatalog(); } catch (error) { note(reason(error.message), true); } finally { setBusy(false); } }
      renderResults();
    }
    for (const value of ["all", ...S.COLORS]) {
      const button = document.createElement("button"); button.type = "button"; button.dataset.color = value;
      button.className = "ka-color"; button.title = value === "all" ? "Any colour" : value; button.setAttribute("aria-label", value === "all" ? "Any colour" : `${value} skins`); button.setAttribute("aria-pressed", String(value === "all"));
      if (value === "all") button.textContent = "All";
      else { const swatch = document.createElement("i"); swatch.className = `ka-swatch ka-swatch-${value}`; button.append(swatch); }
      button.addEventListener("click", () => {
        color = value; resetPreview(); shown = 24;
        renderColors(); saveFilters(); renderResults();
      });
      q(".ka-colors").append(button);
    }
    for (const button of root.querySelectorAll("[data-source]")) button.addEventListener("click", () => {
      source = button.dataset.source;
      for (const chip of root.querySelectorAll("[data-source]")) chip.setAttribute("aria-pressed", String(chip.dataset.source === source));
      q("[data-source-hint]").textContent = source === "catalog" ? "Search the full catalog. Craft & equip a skin for your selected team. Colour tags are approximate." : "Equip skins from your inventory. Random loadout keeps your weapons. Colour tags are approximate.";
      refresh();
    });
    q("[data-search]").addEventListener("input", () => { resetPreview(); shown = 24; renderResults(); });
    q("[data-team]").addEventListener("change", () => { resetPreview(); saveFilters(); renderResults(); });
    q("[data-weapon]").addEventListener("change", changed);
    q("[data-refresh]").addEventListener("click", refresh);
    q("[data-more]").addEventListener("click", () => { shown += 24; renderResults(); });
    q("[data-cancel]").addEventListener("click", () => { if (applyingBatch) { batchStop = true; q("[data-cancel]").textContent = "Stopping…"; } else if (!busy) resetPreview(); });
    for (const button of all("[data-craft-team]")) button.addEventListener("click", () => {
      if (busy || button.disabled || catalogLocked || candidate?.source !== "catalog") return;
      craftSelection({ ...candidate.entry, team: button.dataset.craftTeam }, button);
    });
    q("[data-random]").addEventListener("click", () => {
      if (!data || busy) return;
      q("[data-apply]").hidden = false;
      if (source === "catalog") {
        const pool = filtered(catalogItems);
        const entry = pool[Math.floor(Math.random() * pool.length)];
        if (entry) catalogPreview(entry); else note("No matching skins. Choose a weapon or another colour.");
      } else preview(S.plan({ ...data, inventory: data.inventory.map(priced) }, { ...filter(), mode: "weapon" }));
    });
    q("[data-loadout]").addEventListener("click", async () => {
      if (!data || busy) return;
      q("[data-apply]").hidden = false;
      if (source === "owned") { preview(S.plan({ ...data, inventory: data.inventory.map(priced) }, { ...filter(), mode: "loadout" })); return; }
      setBusy(true); note("Building a catalog loadout…");
      try {
        const all = await send({ type: "read", action: { catalogWeapon: "all" } });
        if (!all?.ok) throw new Error(all?.reason || "request-failed");
        const personal = await send({ type: "read" });
        if (personal?.ok) data = personal.data;
        else data = { ...data, inventory: [], loadout: [], preset: "", personal: false };
        builderCatalog = all.items || [];
        const pool = filtered(builderCatalog, { ...filter(), weapon: "all", query: "" });
        const plan = S.catalogPlan(data, pool, filter());
        catalogPreviewPlan({ ...plan, isBuilder: true });
        note(plan.entries.length ? "Preview ready. Lock favourites, reroll slots, then craft the loadout or equip individual skins." : "No loadout matches these filters. Lower the minimum value or change colour.");
      } catch (error) { note(reason(error.message), true); }
      finally { setBusy(false); }
    });
    q("[data-apply]").addEventListener("click", async () => {
      if (!candidate || busy) return;
      if (candidate.source === "catalog") return;
      const selected = candidate;
      resetPreview(); setBusy(true); note("Applying selection…");
      try {
        const plan = { revision: selected.revision, entries: selected.entries.map(({ team, slot, itemId }) => ({ team, slot, itemId })) };
        const result = await send({ type: "apply", action: { operationId: crypto.randomUUID(), plan } });
        if (result?.data) data = result.data;
        if (result?.ok) note(`Applied ${result.applied} skin${result.applied === 1 ? "" : "s"}. Refresh the Skins page to update its preview.`);
        else {
          note(`${result?.applied ? `${result.applied} applied. ` : ""}${reason(result?.reason)}${result?.uncertain ? " A submitted change may still have completed. Refresh before retrying." : ""}`, true);
          // A failed batch is not rolled back or retried automatically.
          const latest = await send({ type: "read" }); if (latest?.ok) data = latest.data;
        }
      } catch { note("Request interrupted. Refresh to check the saved loadout before trying again.", true); }
      finally { setBusy(false); renderResults(); }
    });
    for (const selector of ["[data-min-value]", "[data-rarity]", "[data-skip-default]"]) q(selector).addEventListener("change", () => {
      resetPreview(); shown = 24; saveFilters(); renderResults();
      if (filter().minValue > 0 && !market) note("Market values are unavailable. Update prices or set the minimum to 0.", true);
    });
    q("[data-sort]").addEventListener("change", () => { saveFilters(); renderResults(); });
    q("[data-favorites]").addEventListener("click", () => {
      const button = q("[data-favorites]"); button.setAttribute("aria-pressed", String(button.getAttribute("aria-pressed") !== "true")); saveFilters(); resetPreview(); renderResults();
    });
    for (const button of root.querySelectorAll("[data-style-preset]")) button.addEventListener("click", () => {
      color = button.dataset.stylePreset; renderColors(); resetPreview(); saveFilters(); renderResults();
      q("[data-min-value]").focus();
    });
    q("[data-price-refresh]").addEventListener("click", async () => {
      if (!options.market || busy) return;
      q("[data-price-refresh]").disabled = true;
      try { market = await options.market.refresh(); renderMarket(); renderResults(); note("Market values updated. Existing loadout selections are kept."); }
      catch (error) { note(error.message || "Could not update prices.", true); }
      finally { q("[data-price-refresh]").disabled = false; }
    });
    q("[data-reroll]").addEventListener("click", () => rerollBuilder());
    q("[data-craft-batch]").addEventListener("click", craftBatch);
    q("[data-save-set]").addEventListener("click", async () => {
      if (!builderPlan || busy) return;
      const name = q("[data-set-name]").value.trim().slice(0, 40);
      if (!name) { note("Give your loadout a name first.", true); q("[data-set-name]").focus(); return; }
      const existing = studio.presets.find(preset => preset.name.toLowerCase() === name.toLowerCase());
      if (!existing && studio.presets.length >= 12) { note("12 saved loadouts reached. Delete one or reuse a name.", true); return; }
      const preset = { id: existing?.id || crypto.randomUUID(), name, preferences: filter(), entries: builderPlan.entries.map(({ team, slot, catalogId }) => ({ team, slot, catalogId })) };
      await saveStudio({ presets: [...studio.presets.filter(item => item.id !== preset.id), preset] }); renderSaved(); note(`Saved “${name}” on this device.`);
    });
    q("[data-load-set]").addEventListener("click", async () => {
      const preset = studio.presets.find(preset => preset.id === q("[data-saved-set]").value);
      if (!preset || busy) return;
      setBusy(true);
      try {
        const catalog = await send({ type: "read", action: { catalogWeapon: "all" } });
        if (!catalog?.ok) throw new Error(catalog?.reason || "request-failed");
        const personal = await send({ type: "read" });
        if (personal?.ok) data = personal.data;
        else data = { ...data, inventory: [], loadout: [], preset: "", personal: false };
        builderCatalog = catalog.items || [];
        const entries = preset.entries.map(row => {
          const item = builderCatalog.find(item => item.id === row.catalogId);
          return item && S.slotFor(data, item, row.team) === row.slot ? { ...row, name: S.displayName(item) } : null;
        }).filter(Boolean);
        applyFilters(preset.preferences); q("[data-set-name]").value = preset.name;
        source = "catalog"; catalogItems = builderCatalog;
        for (const chip of root.querySelectorAll("[data-source]")) chip.setAttribute("aria-pressed", String(chip.dataset.source === source));
        q("[data-source-hint]").textContent = "Search the full catalog. Craft & equip a skin for your selected team. Colour tags are approximate.";
        catalogPreviewPlan({ source: "catalog", entries, skipped: preset.entries.length - entries.length, isBuilder: true, personal: data.personal });
        note(entries.length ? `Loaded “${preset.name}” as a preview. Nothing has been equipped yet.` : "This set has no compatible catalog slots in the current roster. Nothing was changed.");
      } catch (error) { note(reason(error.message), true); }
      finally { setBusy(false); renderResults(); }
    });
    q("[data-delete-set]").addEventListener("click", async () => {
      const id = q("[data-saved-set]").value;
      if (!id || busy) return;
      await saveStudio({ presets: studio.presets.filter(preset => preset.id !== id) }); renderSaved(); note("Saved loadout removed from this device.");
    });
    updateLink();
    q("[data-skip-default]").checked = true;
    return { open() { if (!data && !busy) return refresh(); }, refresh, setVisible(visible) { if (options.previewRoot) options.previewRoot.hidden = !visible; } };
  }
  globalThis.KarasuSkinsPanel = Object.freeze({ create });
})();
