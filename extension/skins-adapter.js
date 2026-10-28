/* Karasu's documented-by-source inventory API. Only loaded with this extension.
 * Never reads cookies, passwords, Steam APIs, or tokens. Requests use the site's
 * existing session, like its own Skins app. Crafting requires an explicit panel
 * action. No purchases, Steam trades, or deletion.
 */
(() => {
  "use strict";
  if (globalThis.__karasuSkinsAdapterV1) return;
  globalThis.__karasuSkinsAdapterV1 = true;
  const K = globalThis.KarasuAuto;
  const S = globalThis.KarasuSkins;
  const API = "https://inventory.karasu.live/api";
  const operations = new Set();
  let catalogPromise;
  let applying = false;
  const catalogs = new Map();

  async function request(path, body, deadline = Infinity) {
    const remaining = Math.min(12000, deadline - Date.now());
    if (remaining <= 0) throw new Error("timeout");
    let response;
    try { response = await fetch(API + path, {
      method: body ? "POST" : "GET", credentials: "include", cache: "no-store",
      ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(Math.floor(remaining))
    }); } catch (error) { throw new Error(["AbortError", "TimeoutError"].includes(error.name) ? "timeout" : "network-error"); }
    if (!response.ok) throw new Error([401, 403].includes(response.status) ? "sign-in" : `http-${response.status}`);
    return response.json();
  }
  async function catalog() {
    if (!catalogPromise) catalogPromise = request("/catalog").catch(error => { catalogPromise = null; throw error; });
    return catalogPromise;
  }
  function safeItem(item) {
    if (!item || typeof item.name !== "string") return null;
    return { id: item.id, name: item.name.slice(0, 180), altName: String(item.altName || "").slice(0, 180), rarity: /^#[a-f0-9]{6}$/i.test(item.rarity || "") ? item.rarity : "", model: item.model, type: item.type, category: item.category, teams: Array.isArray(item.teams) ? item.teams.filter(team => ["CT", "T"].includes(team)) : [], image: String(item.image || "").slice(0, 500) };
  }
  function withWeaponInfo(item, info) {
    const weapon = info.weapons?.find(weapon => weapon.model === item.model);
    return { ...item, category: item.category || weapon?.category, teams: item.teams?.length ? item.teams : weapon?.teams || [] };
  }
  function metadata(info) {
    if (!Array.isArray(info.weapons)) throw new Error("schema");
    return {
      weapons: info.weapons.map(weapon => ({ model: weapon.model, name: weapon.name, category: weapon.category, teams: weapon.teams })),
      assetOrigin: "https://inventory.karasu.live/cdn", skinBase: S.SKIN_BASE
    };
  }
  async function read(deadline = Infinity, catalogOnly = false) {
    if (catalogOnly) return { ...metadata(await catalog()), inventory: [], loadout: [], preset: "", personal: false };
    const [info, inventory, loadout, presets] = await Promise.all([catalog(), request("/inventory", undefined, deadline), request("/loadout", undefined, deadline), request("/loadout/presets", undefined, deadline)]);
    if (!Array.isArray(inventory) || !Array.isArray(loadout) || !Array.isArray(info.weapons) || !Array.isArray(presets)) throw new Error("schema");
    return {
      ...metadata(info), personal: true,
      inventory: inventory.filter(S.skin).map(entry => ({ id: entry.id, item_id: entry.item_id, slot: entry.slot, item: safeItem(withWeaponInfo(entry.item, info)) })),
      loadout: loadout.filter(row => ["CT", "T"].includes(row.team) && S.SLOTS.includes(row.slot)).map(row => ({ team: row.team, slot: row.slot, item_instance_id: row.item_instance_id, item_id: row.item_id, item: row.item ? safeItem(withWeaponInfo(row.item, info)) : null })),
      preset: String(presets.find(preset => preset.active)?.id || "")
    };
  }
  async function weaponCatalog(weapon, deadline) {
    if (!catalogs.has(weapon)) catalogs.set(weapon, request(`/catalog/skins?slot=${encodeURIComponent(weapon)}`, undefined, deadline).then(async result => {
      if (!Array.isArray(result.skins)) throw new Error("schema");
      const info = await catalog();
      return result.skins.filter(S.skin).map(item => safeItem(withWeaponInfo(item, info)));
    }).catch(error => { catalogs.delete(weapon); throw error; }));
    return catalogs.get(weapon);
  }
  async function samePreset(preset, deadline) {
    const presets = await request("/loadout/presets", undefined, deadline);
    if (!Array.isArray(presets) || String(presets.find(preset => preset.active)?.id || "") !== preset) throw new Error("stale");
  }
  async function craft(action) {
    const id = action?.catalogId;
    if (!S.isId(action?.operationId) || operations.has(action.operationId)) return { ok: false, reason: "duplicate" };
    if (!Number.isSafeInteger(id) || id < 0 || !["CT", "T", "both"].includes(action.team)) return { ok: false, reason: "invalid" };
    if (applying) return { ok: false, reason: "busy" };
    applying = true;
    const deadline = Date.now() + 45000;
    let createdId;
    let submitted = false;
    let targets = [];
    try {
      const [before, items] = await Promise.all([read(deadline), request(`/catalog/items?ids=${id}`, undefined, deadline)]);
      const raw = Array.isArray(items) && items.find(item => item.id === id);
      if (!raw || !S.skin(raw)) return { ok: false, reason: "invalid" };
      const info = await catalog();
      if (raw.type === "weapon" && !info.weapons.some(weapon => weapon.model === raw.model)) return { ok: false, reason: "invalid" };
      const item = withWeaponInfo(raw, info);
      const teams = action.team === "both" ? ["CT", "T"] : [action.team];
      targets = teams.map(team => ({ team, slot: S.slotFor(before, item, team) })).filter(entry => entry.slot);
      if (!targets.length) return { ok: false, reason: "incompatible-team" };
      await samePreset(before.preset, deadline);
      const wearMin = typeof raw.wearMin === "number" && Number.isFinite(raw.wearMin) ? raw.wearMin : 0;
      const seedMin = typeof raw.seedMin === "number" && Number.isFinite(raw.seedMin) ? raw.seedMin : 1;
      const payload = {
        item_id: id, wear: Math.min(1, Math.max(0, wearMin)), seed: Math.min(100000, Math.max(1, Math.ceil(seedMin))),
        stattrak: false, nametag: null, stickers: Array(5).fill(null), patches: Array(3).fill(null), charm_id: null, charm_offset: null
      };
      operations.add(action.operationId);
      if (operations.size > 100) operations.delete(operations.values().next().value);
      submitted = true;
      const created = await request("/inventory/craft", payload, deadline);
      if (!S.isId(created?.id)) throw new Error("unconfirmed");
      createdId = created.id;
      const fresh = await read(deadline);
      const owned = fresh.inventory.find(entry => String(entry.id) === String(createdId) && Number(entry.item_id) === id);
      if (!owned) throw new Error("unconfirmed");
      if (S.revision(fresh) !== S.revision(before)) throw new Error("stale");
      for (const target of targets) {
        if (S.slotFor(fresh, { ...owned, item }, target.team) !== target.slot) throw new Error("stale");
        await samePreset(before.preset, deadline);
        await request("/loadout", { ...target, item_instance_id: createdId }, deadline);
      }
      const after = await read(deadline);
      if (after.preset !== before.preset) throw new Error("stale");
      const equipped = targets.filter(target => after.loadout.some(row => row.team === target.team && row.slot === target.slot && String(row.item_instance_id) === String(createdId))).map(target => target.team);
      return { ok: equipped.length === targets.length, reason: equipped.length === targets.length ? undefined : "unconfirmed", created: true, itemId: createdId, equipped, total: targets.length, data: after, uncertain: equipped.length !== targets.length };
    } catch (error) {
      return { ok: false, reason: error.message || "request-failed", created: createdId !== undefined, itemId: createdId, total: targets.length, uncertain: submitted };
    } finally { applying = false; }
  }
  async function handle(type, action) {
    if (type === "skins:read") {
      if (action?.catalogWeapon) {
        const weapon = action.catalogWeapon;
        const info = await catalog();
        const models = [...new Set(["knife", "gloves", ...info.weapons.map(item => item.model)])];
        if (weapon !== "all" && !models.includes(weapon)) return { ok: false, reason: "invalid" };
        const deadline = Date.now() + 45000;
        if (weapon !== "all") return { ok: true, items: await weaponCatalog(weapon, deadline) };
        let cursor = 0;
        const items = [];
        // Keep full-catalog loading bounded and cache each weapon for the tab.
        await Promise.all(Array.from({ length: Math.min(4, models.length) }, async () => {
          while (cursor < models.length) {
            const model = models[cursor++];
            items.push(...await weaponCatalog(model, deadline));
          }
        }));
        return { ok: true, items: [...new Map(items.map(item => [String(item.id), item])).values()].sort((a, b) => a.name.localeCompare(b.name)) };
      }
      return { ok: true, data: await read(Infinity, action?.catalogOnly === true) };
    }
    if (type === "skins:craft") return craft(action);
    if (type !== "skins:apply") return null;
    if (!S.isId(action?.operationId) || operations.has(action.operationId)) return { ok: false, reason: "duplicate" };
    if (applying) return { ok: false, reason: "busy" };
    applying = true;
    let applied = 0;
    let attempted = 0;
    const deadline = Date.now() + 45000;
    try {
      const fresh = await read(deadline);
      if (!S.validate(fresh, action.plan)) return { ok: false, reason: "stale" };
      operations.add(action.operationId);
      if (operations.size > 100) operations.delete(operations.values().next().value);
      for (const entry of action.plan.entries) {
        // Detect another tab switching presets before writing the next item.
        await samePreset(fresh.preset, deadline);
        attempted++;
        await request("/loadout", { team: entry.team, slot: entry.slot, item_instance_id: entry.itemId }, deadline);
        applied++;
      }
      const after = await read(deadline);
      const confirmed = action.plan.entries.filter(entry => after.loadout.some(row => row.team === entry.team && row.slot === entry.slot && String(row.item_instance_id) === String(entry.itemId))).length;
      return { ok: confirmed === action.plan.entries.length, reason: confirmed === action.plan.entries.length ? undefined : "unconfirmed", applied: confirmed, total: action.plan.entries.length, data: after };
    } catch (error) {
      return { ok: false, reason: error.message || "request-failed", applied, attempted, total: action?.plan?.entries?.length || 0, uncertain: attempted > applied };
    } finally { applying = false; }
  }
  document.addEventListener(K.REQUEST, async event => {
    let message;
    try {
      if (typeof event.detail !== "string" || event.detail.length > 30000) return;
      message = JSON.parse(event.detail);
      if (typeof message.id !== "string" || message.id.length > 100 || !["skins:read", "skins:apply", "skins:craft"].includes(message.type)) return;
      const result = await handle(message.type, message.action);
      document.dispatchEvent(new CustomEvent(K.RESPONSE, { detail: JSON.stringify({ id: message.id, ...result }) }));
    } catch (error) {
      if (message?.id) document.dispatchEvent(new CustomEvent(K.RESPONSE, { detail: JSON.stringify({ id: message.id, ok: false, reason: error.message || "request-failed" }) }));
    }
  });
})();
