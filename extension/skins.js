/* Pure skin search and loadout planning. No account access or requests. */
(() => {
  "use strict";
  const COLORS = ["red", "blue", "green", "yellow", "purple", "pink", "orange", "black", "white"];
  const SKIN_BASE = "/apps/inventory";
  const FINISHES = {
    red: /red|crimson|bloodsport|slaughter|autotronic|candy apple|hot rod|kill confirmed|cyrex|evil daimyo|hellfire|howl|ruby/i,
    blue: /blue|cobalt|sapphire|vulcan|poseidon|icarus fell|bright water|decimator|blue phosphor|nightwish/i,
    green: /green|emerald|gamma|malachite|aquamarine|eco\b|hydroponic|nuclear garden|toxic/i,
    yellow: /yellow|gold|golden|brass|fuel injector|tiger tooth|gold arabesque|bulldozer|hazard|lore\b/i,
    purple: /purple|violet|ultraviolet|neo noir|neo-noir|nightwish|decimator|fade|amethyst/i,
    pink: /pink|neon|fade|neo noir|neo-noir|chromatic|printstream|bullet queen|vice/i,
    orange: /orange|asiimov|tiger tooth|atomic alloy|nitro|safety net|amber|fade/i,
    black: /black|redline|slate|night\b|night stripe|elite build|cyrex|neo noir|neo-noir|asiimov|autotronic|ultraviolet/i,
    white: /white|whiteout|printstream|asiimov|neo noir|neo-noir|mecha industries|arctic|snow/i
  };
  const GROUPS = [["sp"], ["p1", "p2", "p3", "p4"], ["m1", "m2", "m3", "m4", "m5"], ["r1", "r2", "r3", "r4", "r5"]];
  const DEFAULTS = {
    CT: { sp: "hkp2000", p1: "elite", p2: "p250", p3: "fiveseven", p4: "deagle", m1: "nova", m2: "xm1014", m3: "mp5sd", m4: "p90", m5: "mp9", r1: "famas", r2: "m4a1_silencer", r3: "ssg08", r4: "aug", r5: "awp" },
    T: { sp: "glock", p1: "elite", p2: "p250", p3: "tec9", p4: "deagle", m1: "nova", m2: "xm1014", m3: "mp5sd", m4: "p90", m5: "mac10", r1: "galilar", r2: "ak47", r3: "ssg08", r4: "sg556", r5: "awp" }
  };
  const STARTERS = ["glock", "hkp2000", "usp_silencer"];
  const SLOTS = [...GROUPS.flat(), "knife", "gloves"];
  const normalize = value => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const isId = value => (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) || (typeof value === "string" && /^[a-zA-Z0-9_-]{1,120}$/.test(value));
  const itemOf = entry => entry?.item || entry;
  function variantOf(entry) {
    const item = itemOf(entry);
    if (!/\bdoppler\b/i.test(item?.name || "")) return "";
    const alternate = String(item.altName || "").trim();
    const phase = alternate.match(/^(?:phase\s*|p)([1-4])$/i);
    if (phase) return `Phase ${phase[1]}`;
    const gem = ({ ruby: "Ruby", sapphire: "Sapphire", emerald: "Emerald", "black pearl": "Black Pearl" })[normalize(alternate)];
    if (gem) return gem;
    const material = `${item.paintMaterial || ""} ${item.image || ""}`;
    const materialPhase = material.match(/doppler_phase([1-4])(?:_|\.|\b)/i);
    if (materialPhase) return `Phase ${materialPhase[1]}`;
    for (const [code, name] of [["blackpearl", "Black Pearl"], ["sapphire", "Sapphire"], ["emerald", "Emerald"], ["ruby", "Ruby"]]) if (new RegExp(`(?:_|/)${code}_marbleized`, "i").test(material)) return name;
    return "";
  }
  function displayName(entry) {
    const item = itemOf(entry);
    const name = String(item?.name || "");
    const variant = variantOf(entry);
    return variant && !normalize(name).includes(normalize(variant)) ? `${name} — ${variant}` : name;
  }
  const modelOf = entry => {
    const item = itemOf(entry);
    if (item?.type === "melee" || entry?.slot === "knife") return "knife";
    if (item?.type === "glove" || entry?.slot === "gloves") return "gloves";
    return item?.model || "";
  };
  function skin(entry) {
    const item = itemOf(entry);
    return !!item && isId(entry?.id) && typeof item.name === "string" && !!modelOf(entry) && ["weapon", "melee", "glove"].includes(item.type) && entry.attached_to == null;
  }
  function colors(entry) {
    // Finish colours, never the rarity colour. These are approximate design tags.
    const item = itemOf(entry);
    const name = [item?.name?.split(" | ").slice(1).join(" | ") || item?.name || "", item?.altName || "", variantOf(entry)].join(" ");
    return COLORS.filter(color => FINISHES[color].test(name));
  }
  const rarityOf = entry => ({ "#ded6cc": 1, "#b0c3d9": 2, "#4b69ff": 3, "#8847ff": 4, "#d32cee": 5, "#eb4b4b": 6, "#e4ae39": 7 })[String(itemOf(entry)?.rarity || "").toLowerCase()] || 0;
  const marketValue = entry => Number.isFinite(itemOf(entry)?.marketValue) && itemOf(entry).marketValue > 0 ? itemOf(entry).marketValue : null;
  function matches(entry, filter = {}) {
    if (!skin(entry)) return false;
    const item = itemOf(entry);
    if (filter.skipDefault && !item.name.includes(" | ")) return false;
    if (Number(filter.rarity) > 0 && rarityOf(entry) < Number(filter.rarity)) return false;
    if (Number(filter.minValue) > 0 && (marketValue(entry) === null || marketValue(entry) < Number(filter.minValue))) return false;
    if (filter.weapon && filter.weapon !== "all" && modelOf(entry) !== filter.weapon) return false;
    if (filter.team && filter.team !== "both" && item.teams?.length && !item.teams.includes(filter.team)) return false;
    const tags = colors(entry);
    if (filter.color && filter.color !== "all" && !tags.includes(filter.color)) return false;
    const haystack = normalize([displayName(entry), item.altName, item.model, ...tags].join(" "));
    return normalize(filter.query).replace(/\bp([1-4])\b/g, "phase $1").split(" ").filter(token => token && !["skin", "skins"].includes(token)).every(token => haystack.includes(token));
  }
  function roster(data, team) {
    const result = {};
    const rows = (data.loadout || []).filter(row => row.team === team);
    const current = Object.fromEntries(rows.filter(row => GROUPS.flat().includes(row.slot)).map(row => [row.slot, row.item?.model]));
    const used = new Set(Object.values(current).filter(Boolean));
    for (const group of GROUPS) {
      const spare = group.map(slot => DEFAULTS[team][slot]).filter(model => !used.has(model));
      for (const slot of group) {
        const model = current[slot];
        if (model) result[slot] = model;
        else if (spare.includes(DEFAULTS[team][slot])) { result[slot] = DEFAULTS[team][slot]; spare.splice(spare.indexOf(result[slot]), 1); }
      }
      for (const slot of group) if (!result[slot]) result[slot] = spare.shift();
    }
    return { ...result, knife: "knife", gloves: "gloves" };
  }
  function supports(entry, team) {
    const teams = itemOf(entry)?.teams;
    return !teams?.length || teams.includes(team);
  }
  function slotFor(data, entry, team) {
    if (!supports(entry, team)) return null;
    const model = modelOf(entry);
    if (["knife", "gloves"].includes(model)) return model;
    const current = roster(data, team);
    const existing = GROUPS.flat().find(slot => current[slot] === model);
    if (existing) return existing;
    if (STARTERS.includes(model)) return "sp";
    const category = itemOf(entry)?.category || data.weapons?.find(weapon => weapon.model === model)?.category;
    return category === "rifle" ? "r1" : category === "secondary" ? "p1" : ["smg", "heavy"].includes(category) ? "m1" : null;
  }
  function revision(data) {
    return JSON.stringify([String(data.preset || ""), (data.loadout || []).map(row => [row.team, row.slot, String(row.item_instance_id ?? ""), String(row.item_id ?? ""), row.item?.model || ""]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))]);
  }
  function pick(entries, currentId, random) {
    const alternatives = entries.filter(entry => String(entry.id) !== String(currentId));
    const pool = alternatives.length ? alternatives : entries;
    if (!pool.length) return null;
    return pool[Math.min(pool.length - 1, Math.floor(Math.max(0, random()) * pool.length))];
  }
  function plan(data, options = {}, random = Math.random) {
    const inventory = (data.inventory || []).filter(skin);
    const teams = options.team === "both" ? ["CT", "T"] : [options.team === "T" ? "T" : "CT"];
    const entries = [];
    let skipped = 0;
    function add(entry, team, slot) {
      if (!entry || !slot) { skipped++; return; }
      const row = data.loadout?.find(row => row.team === team && row.slot === slot);
      if (String(row?.item_instance_id) === String(entry.id)) { skipped++; return; }
      entries.push({ team, slot, itemId: entry.id, name: displayName(entry), model: modelOf(entry), image: itemOf(entry).image || "" });
    }
    if (options.mode === "loadout") {
      for (const team of teams) {
        const current = roster(data, team);
        for (const slot of SLOTS) {
          const row = data.loadout?.find(row => row.team === team && row.slot === slot);
          const pool = inventory.filter(entry => supports(entry, team) && matches(entry, { ...options, query: "", weapon: current[slot] }));
          add(pick(pool, row?.item_instance_id, random), team, slot);
        }
      }
    } else {
      const pool = inventory.filter(entry => matches(entry, options));
      const chosen = options.mode === "equip" ? pool.find(entry => String(entry.id) === String(options.itemId)) : pick(pool, null, random);
      for (const team of teams) {
        if (chosen && supports(chosen, team)) add(chosen, team, slotFor(data, chosen, team));
      }
    }
    return { revision: revision(data), entries, skipped };
  }
  function validate(data, candidate) {
    if (!candidate || candidate.revision !== revision(data) || !Array.isArray(candidate.entries) || !candidate.entries.length || candidate.entries.length > 34) return false;
    const seen = new Set();
    return candidate.entries.every(entry => {
      if (!["CT", "T"].includes(entry.team) || !SLOTS.includes(entry.slot) || !isId(entry.itemId)) return false;
      const key = `${entry.team}:${entry.slot}`;
      if (seen.has(key)) return false;
      seen.add(key);
      const owned = data.inventory?.find(item => String(item.id) === String(entry.itemId));
      return skin(owned) && slotFor(data, owned, entry.team) === entry.slot;
    });
  }
  function catalogPlan(data, catalog, options = {}, random = Math.random) {
    const teams = options.team === "both" ? ["CT", "T"] : [options.team === "T" ? "T" : "CT"];
    const entries = [];
    let skipped = 0;
    for (const team of teams) {
      const current = roster(data, team);
      for (const slot of SLOTS) {
        const pool = catalog.filter(entry => supports(entry, team) && matches(entry, { ...options, query: "", weapon: current[slot] }));
        const item = pick(pool, null, random);
        if (item) entries.push({ team, slot, catalogId: item.id, name: displayName(item) });
        else skipped++;
      }
    }
    return { source: "catalog", entries, skipped, personal: data.personal === true };
  }
  globalThis.KarasuSkins = Object.freeze({ COLORS, SKIN_BASE, SLOTS, isId, skin, itemOf, variantOf, displayName, modelOf, rarityOf, marketValue, colors, matches, roster, slotFor, revision, plan, catalogPlan, validate });
})();
