/* Device-local Studio preferences and saved catalog selections. No account data. */
(() => {
  "use strict";
  const defaults = Object.freeze({ color: "all", minValue: 0, rarity: 0, sort: "name", team: "both", skipDefault: true, favoritesOnly: false });
  function preferences(value = {}) {
    value = value && typeof value === "object" ? value : {};
    return {
      color: ["all", ...globalThis.KarasuSkins.COLORS].includes(value.color) ? value.color : "all",
      minValue: Math.min(100000, Math.max(0, Number(value.minValue) || 0)),
      rarity: [0, 4, 5, 6].includes(Number(value.rarity)) ? Number(value.rarity) : 0,
      sort: ["name", "price-high", "price-low"].includes(value.sort) ? value.sort : "name",
      team: ["CT", "T", "both"].includes(value.team) ? value.team : "both",
      skipDefault: value.skipDefault !== false, favoritesOnly: value.favoritesOnly === true
    };
  }
  function clean(value = {}) {
    value = value && typeof value === "object" ? value : {};
    return {
      preferences: preferences(value.preferences),
      favorites: [...new Set((Array.isArray(value.favorites) ? value.favorites : []).filter(Number.isSafeInteger).filter(id => id >= 0))].slice(0, 500),
      presets: (Array.isArray(value.presets) ? value.presets : []).filter(preset => typeof preset?.id === "string" && /^[a-z0-9-]{1,80}$/i.test(preset.id) && typeof preset.name === "string" && Array.isArray(preset.entries)).slice(0, 12).map(preset => ({
        id: preset.id, name: preset.name.trim().slice(0, 40) || "My loadout", preferences: preferences(preset.preferences),
        entries: preset.entries.filter(row => ["CT", "T"].includes(row?.team) && globalThis.KarasuSkins.SLOTS.includes(row.slot) && Number.isSafeInteger(row.catalogId) && row.catalogId >= 0).slice(0, 34).map(({ team, slot, catalogId }) => ({ team, slot, catalogId }))
      })).filter(preset => preset.entries.length)
    };
  }
  function create(storage) {
    let changes = Promise.resolve();
    return {
      async load() { return clean((await storage.get("skinStudio")).skinStudio); },
      update(patch) {
        const next = changes.then(async () => {
          const state = clean((await storage.get("skinStudio")).skinStudio);
          const result = clean({ ...state, ...patch });
          await storage.set({ skinStudio: result });
          return result;
        });
        changes = next.catch(() => {});
        return next;
      }
    };
  }
  globalThis.KarasuStudio = Object.freeze({ defaults, preferences, clean, create });
})();
