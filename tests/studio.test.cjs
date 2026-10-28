"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm");
const clone = value => JSON.parse(JSON.stringify(value));
const read = file => fs.readFileSync("extension/" + file, "utf8");
function logic(extra = {}) {
  const context = vm.createContext({ ...extra });
  for (const file of ["skins.js", "market.js", "studio.js"]) vm.runInContext(read(file), context);
  return { S: context.KarasuSkins, M: context.KarasuMarket, Studio: context.KarasuStudio, context };
}
const row = (name, price, extra = {}) => ({ market_hash_name: name, currency: "USD", min_price: price, quantity: 3, updated_at: 1793217613, version: null, ...extra });
test("market floors compare normal finishes across wear and exclude StatTrak, Souvenir and unavailable listings", () => {
  const { M } = logic();
  const snapshot = M.build([
    row("AK-47 | Redline (Field-Tested)", 24), row("AK-47 | Redline (Well-Worn)", 20),
    row("StatTrak™ AK-47 | Redline (Field-Tested)", 1), row("Souvenir AK-47 | Redline (Field-Tested)", 1),
    row("AK-47 | Redline (Battle-Scarred)", 2, { quantity: 0 }), row("AK-47 | Redline (Minimal Wear)", 3, { currency: "EUR" }),
    row("★ StatTrak™ Karambit | Slaughter (Factory New)", 1), row("AK-47 | Slate (Factory New)", null)
  ], 1793217613000);
  assert.equal(snapshot.prices[M.key("AK-47 | Redline")], 20);
  assert.equal(Object.keys(snapshot.prices).length, 1);
  assert.equal(snapshot.source, "Skinport"); assert.equal(snapshot.currency, "USD");
});
test("Doppler phases and gems have independent prices; generic or unknown phases never inherit a price", () => {
  const { M } = logic();
  const snapshot = M.build([
    row("★ Karambit | Doppler (Factory New)", 1000, { version: "Phase 1" }),
    row("★ Karambit | Doppler (Minimal Wear)", 950, { version: "Phase 1" }),
    row("★ Karambit | Doppler (Factory New)", 4000, { version: "Sapphire" }),
    row("★ Karambit | Doppler (Factory New)", 3, { version: null })
  ]);
  const item = { name: "Karambit | Doppler" };
  assert.equal(M.value({ ...item, altName: "Phase 1" }, snapshot), 950);
  assert.equal(M.value({ ...item, altName: "Sapphire" }, snapshot), 4000);
  assert.equal(M.value({ ...item, altName: "Ruby" }, snapshot), null);
  assert.equal(M.value(item, snapshot), null);
});
test("value and rarity filters exclude unknown prices and do not confuse rarity with price", () => {
  const { S } = logic();
  const item = { id: 1, name: "AK-47 | Redline", type: "weapon", model: "ak47", rarity: "#d32cee", marketValue: 20 };
  assert.equal(S.matches(item, { minValue: 20, rarity: 5 }), true);
  assert.equal(S.matches(item, { minValue: 21 }), false);
  assert.equal(S.matches({ ...item, marketValue: null }, { minValue: 1 }), false);
  assert.equal(S.matches({ ...item, rarity: "#4b69ff", marketValue: 500 }, { minValue: 200, rarity: 5 }), false);
  assert.equal(S.matches({ ...item, name: "AK-47" }, { skipDefault: true }), false);
});
test("market validation rejects malformed snapshots instead of enabling misleading value filters", () => {
  const { M } = logic();
  assert.equal(M.validate({ prices: {} }), null);
  const snapshot = M.build([row("AK-47 | Redline (Field-Tested)", 20)]);
  assert.ok(M.validate(snapshot));
  assert.equal(M.validate({ ...snapshot, currency: "EUR" }), null);
  assert.equal(M.validate({ ...snapshot, prices: { bad: -2 } }), null);
  assert.throws(() => M.build([row("AK-47 | Redline (Field-Tested)", 0)]));
});
test("Studio stores bounded preferences, favorites and catalog selections without match settings", async () => {
  const { Studio } = logic();
  const values = { settings: { acceptEnabled: true, acceptDelay: 9 } };
  const store = Studio.create({ async get(key) { return clone({ [key]: values[key] }); }, async set(patch) { Object.assign(values, clone(patch)); } });
  await Promise.all([store.update({ favorites: [10, 10, -5, "x", 20] }), store.update({ preferences: { minValue: 50, color: "red", team: "T" } })]);
  const state = await store.load();
  assert.deepEqual(clone(state.favorites), [10, 20]);
  assert.equal(state.preferences.minValue, 50); assert.equal(state.preferences.team, "T");
  assert.deepEqual(values.settings, { acceptEnabled: true, acceptDelay: 9 });
  assert.equal(Studio.clean(null).presets.length, 0);
  const bad = Studio.clean({ presets: [{ id: "valid", name: "x", entries: [{ team: "CT", slot: "knife", catalogId: 1343 }, { team: "BAD", slot: "r2", catalogId: 1 }] }] });
  assert.equal(bad.presets[0].entries.length, 1);
});
function loader({ granted = true, saved, lastRefresh = 0, fail = false } = {}) {
  const values = { marketSnapshot: saved, marketRefreshAt: lastRefresh }, calls = [], permission = [];
  const { M, context } = logic({ chrome: {
    permissions: { async request(value) { permission.push(clone(value)); return granted; } },
    storage: { local: { async get(key) { return { [key]: values[key] }; }, async set(patch) { Object.assign(values, patch); } } },
    runtime: { getURL: path => "chrome-extension://test/" + path }
  }, AbortSignal, fetch: async (url, options) => {
    calls.push({ url, options });
    return { ok: !fail, status: fail ? 503 : 200, headers: { get() { return "application/json"; } }, async json() { return String(url).startsWith("chrome-extension:") ? M.build([row("AK-47 | Redline (Field-Tested)", 20)]) : [row("AK-47 | Redline (Field-Tested)", 25)]; } };
  } });
  vm.runInContext(read("market-loader.js"), context);
  return { api: context.KarasuMarketLoader, calls, permission, values, M };
}
test("opening Studio uses local bundled prices and never contacts an external price provider", async () => {
  const f = loader();
  assert.equal(f.calls.length, 0);
  const first = await f.api.load(); await f.api.load();
  assert.equal(f.calls.length, 1); assert.equal(f.permission.length, 0);
  assert.equal(f.calls[0].url, "chrome-extension://test/data/prices.json");
  assert.equal(first.prices[f.M.key("AK-47 | Redline")], 20);
});
test("price refresh asks only for the provider origin and sends no credentials", async () => {
  const f = loader(); await f.api.refresh();
  assert.deepEqual(f.permission, [{ origins: ["https://api.skinport.com/*"] }]);
  assert.equal(f.calls[0].url, f.M.URL); assert.equal(f.calls[0].options.credentials, "omit");
  assert.equal(f.values.marketSnapshot.prices[f.M.key("AK-47 | Redline")], 25);
  await assert.rejects(f.api.refresh(), /five minutes/);
  assert.equal(f.calls.length, 1);
});
test("denying optional price permission performs no request and preserves the saved data", async () => {
  const f = loader({ granted: false, saved: { keep: true } });
  await assert.rejects(f.api.refresh(), /not granted/);
  assert.equal(f.calls.length, 0); assert.deepEqual(f.values.marketSnapshot, { keep: true });
});

test("a newer bundled price snapshot replaces an older cached snapshot after an extension update", async () => {
  const { M } = logic();
  const saved = M.build([row("AK-47 | Redline (Field-Tested)", 10, { updated_at: 100 })]);
  const f = loader({ saved });
  const result = await f.api.load();
  assert.equal(result.prices[M.key("AK-47 | Redline")], 20);
  assert.equal(f.permission.length, 0);
});
