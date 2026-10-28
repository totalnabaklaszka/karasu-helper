/* Indicative USD listing floors, grouped by finish and exact Doppler variant. */
(() => {
  "use strict";
  const SOURCE = "Skinport";
  const URL = "https://api.skinport.com/v1/items?app_id=730&currency=USD&tradable=0";
  const ORIGIN = "https://api.skinport.com/*";
  const normal = value => String(value || "").normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const key = (name, variant = "") => `${normal(name)}::${normal(variant)}`;
  function build(rows, fetchedAt = Date.now()) {
    if (!Array.isArray(rows) || rows.length > 100000) throw new Error("Invalid price list");
    const prices = {};
    let updatedAt = 0;
    for (const row of rows) {
      const name = row?.market_hash_name;
      if (typeof name !== "string" || name.length > 250 || /^(?:StatTrak|Souvenir)/i.test(name.replace(/^★\s*/, "")) || row.currency !== "USD" || !Number.isFinite(row.min_price) || row.min_price <= 0 || !Number.isFinite(row.quantity) || row.quantity < 1) continue;
      const finish = name.replace(/^★\s*/, "").replace(/\s+\((?:Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/, "");
      if (!finish.includes(" | ")) continue;
      const variant = /\bdoppler\b/i.test(finish) ? row.version : "";
      if (/\bdoppler\b/i.test(finish) && !/^(?:Phase [1-4]|Ruby|Sapphire|Black Pearl|Emerald)$/i.test(variant || "")) continue;
      const id = key(finish, variant);
      prices[id] = Math.min(prices[id] ?? Infinity, row.min_price);
      if (Number.isFinite(row.updated_at)) updatedAt = Math.max(updatedAt, row.updated_at * 1000);
    }
    if (!Object.keys(prices).length) throw new Error("No usable price records");
    return { schema: 1, currency: "USD", source: SOURCE, fetchedAt, updatedAt: updatedAt || fetchedAt, prices };
  }
  function validate(value) {
    if (value?.schema !== 1 || value.currency !== "USD" || value.source !== SOURCE || !Number.isFinite(value.fetchedAt) || !Number.isFinite(value.updatedAt) || !value.prices || typeof value.prices !== "object" || Array.isArray(value.prices)) return null;
    const entries = Object.entries(value.prices);
    if (!entries.length || entries.length > 15000 || entries.some(([name, price]) => name.length > 300 || !Number.isFinite(price) || price <= 0 || price > 10000000)) return null;
    return value;
  }
  function value(entry, snapshot) {
    if (!snapshot) return null;
    const S = globalThis.KarasuSkins;
    const item = S.itemOf(entry);
    const variant = S.variantOf(entry);
    if (/\bdoppler\b/i.test(item?.name || "") && !variant) return null;
    const price = snapshot.prices[key(item?.name, variant)];
    return Number.isFinite(price) && price > 0 ? price : null;
  }
  function annotate(entry, snapshot) {
    const item = globalThis.KarasuSkins.itemOf(entry);
    const priced = { ...item, marketValue: value(entry, snapshot) };
    return entry.item ? { ...entry, item: priced } : priced;
  }
  const format = value => Number.isFinite(value) ? `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "Price unavailable";
  globalThis.KarasuMarket = Object.freeze({ SOURCE, URL, ORIGIN, build, validate, value, annotate, format, key });
})();
