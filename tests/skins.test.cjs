"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { randomUUID } = require("node:crypto");
const { parseHTML } = require("linkedom");
const clone = value => JSON.parse(JSON.stringify(value));
const settle = () => new Promise(resolve => setImmediate(resolve));
const read = file => fs.readFileSync("extension/" + file, "utf8");
function logic() {
  const context = vm.createContext({});
  vm.runInContext(read("skins.js"), context);
  return context.KarasuSkins;
}
const S = logic();
function fixture() {
  const item = (id, name, model, teams, category = "rifle", type = "weapon") => ({ id, name, model, type, category, teams, image: "/images/test.webp" });
  const items = [
    item(10, "M4A1-S | Hot Rod", "m4a1_silencer", ["CT"]),
    item(11, "M4A1-S | Cyrex", "m4a1_silencer", ["CT"]),
    item(12, "AK-47 | Redline", "ak47", ["T"]),
    item(13, "AK-47 | Blue Laminate", "ak47", ["T"]),
    item(14, "Desert Eagle | Code Red", "deagle", ["CT", "T"], "secondary"),
    item(15, "Karambit | Slaughter", "karambit", ["CT", "T"], "melee", "melee"),
    item(16, "Sport Gloves | Crimson Kimono", "sporty", ["CT", "T"], "glove", "glove")
  ];
  return {
    weapons: [
      { model: "ak47", name: "AK-47", teams: ["T"], category: "rifle" },
      { model: "m4a1_silencer", name: "M4A1-S", teams: ["CT"], category: "rifle" },
      { model: "deagle", name: "Desert Eagle", teams: ["CT", "T"], category: "secondary" }
    ],
    inventory: items.map((item, index) => ({ id: index + 100, item_id: item.id, item, slot: item.type === "melee" ? "knife" : item.type === "glove" ? "gloves" : item.model })),
    loadout: [{ team: "CT", slot: "r2", item_instance_id: 100, item_id: 10, item: items[0] }],
    preset: "preset-1", skinBase: "/apps/inventory", assetOrigin: "https://inventory.karasu.live/cdn", personal: true
  };
}
function fullCatalog(data) {
  return [...data.inventory.map(entry => entry.item),
    { id: 20, name: "M4A1-S | Printstream", model: "m4a1_silencer", type: "weapon", category: "rifle", teams: ["CT"] },
    { id: 9000, name: "AK-47 | Bloodsport", model: "ak47", type: "weapon", category: "rifle", teams: ["T"] }
  ];
}
function dopplerCatalog() {
  // Public Karasu catalog identities: equal finish names have distinct variants/IDs.
  const variants = [
    [1342, "Doppler", "Ruby", "am_ruby_marbleized"],
    [1343, "Doppler", "Sapphire", "am_sapphire_marbleized"],
    [1344, "Doppler", "Black Pearl", "am_blackpearl_marbleized"],
    ...[1, 2, 3, 4].map(phase => [1344 + phase, "Doppler", `Phase ${phase}`, `am_doppler_phase${phase}`]),
    [1351, "Gamma Doppler", "Emerald", "am_emerald_marbleized"],
    ...[1, 2, 3, 4].map(phase => [1351 + phase, "Gamma Doppler", `Phase ${phase}`, `am_gamma_doppler_phase${phase}`])
  ];
  return variants.map(([id, finish, altName, material]) => ({
    id, name: `Karambit | ${finish}`, altName, model: "knife_karambit", type: "melee", teams: ["CT", "T"],
    image: `/images/weapon_knife_karambit_${material}_test.webp`
  }));
}

test("Doppler and Gamma Doppler labels distinguish all catalog phases and gems without changing identity", () => {
  const items = dopplerCatalog();
  const names = items.map(item => S.displayName(item));
  assert.equal(new Set(names).size, 12);
  for (const item of items) assert.equal(S.displayName(item), `${item.name} — ${item.altName}`);
  assert.equal(S.displayName({ ...items[0], image: items[1].image }), "Karambit | Doppler — Ruby", "catalog metadata takes precedence over a filename");
  assert.equal(S.displayName({ ...items[0], name: "Karambit | Doppler (Ruby)" }), "Karambit | Doppler (Ruby)");
  assert.equal(S.displayName({ ...items[0], name: "Karambit | Damascus Steel" }), "Karambit | Damascus Steel");
  assert.equal(S.displayName({ ...items[0], altName: "", image: "/images/unknown.webp" }), "Karambit | Doppler");
});

test("older owned Doppler items retain their variant using known asset filenames", () => {
  for (const item of dopplerCatalog()) {
    const owned = { id: 10000 + item.id, item: { ...item, altName: "" } };
    assert.equal(S.displayName(owned), `${item.name} — ${item.altName}`);
  }
});

test("phase aliases and gem colours select the intended Doppler variants", () => {
  const items = dopplerCatalog();
  for (const phase of [1, 2, 3, 4]) {
    const expected = [1344 + phase, 1351 + phase];
    for (const query of [`P${phase}`, `Phase ${phase}`]) assert.deepEqual(items.filter(item => S.matches(item, { query })).map(item => item.id), expected);
  }
  for (const [query, color, id] of [["ruby", "red", 1342], ["sapphire", "blue", 1343], ["emerald", "green", 1351], ["black pearl", "black", 1344]]) {
    assert.deepEqual(items.filter(item => S.matches(item, { query, color })).map(item => item.id), [id]);
  }
  assert.equal(S.matches(items[1], { color: "red" }), false);
});

test("owned equip and catalog random loadout previews keep the selected variant and its original ID", () => {
  const data = fixture(), item = dopplerCatalog()[1];
  data.inventory.push({ id: 800, item_id: item.id, slot: "knife", item });
  const owned = S.plan(data, { mode: "equip", itemId: 800, team: "both", query: "Sapphire" });
  assert.equal(owned.entries.length, 2);
  assert.ok(owned.entries.every(entry => entry.itemId === 800 && entry.name === "Karambit | Doppler — Sapphire"));
  const catalog = S.catalogPlan(data, [item], { team: "both" });
  assert.equal(catalog.entries.length, 2);
  assert.ok(catalog.entries.every(entry => entry.catalogId === 1343 && entry.name === "Karambit | Doppler — Sapphire"));
});

test("colour search matches finish tags rather than rarity and combines weapon, text and team", () => {
  const data = fixture();
  data.inventory[3].item.rarity = "#eb4b4b";
  assert.equal(S.matches(data.inventory[2], { query: "red AK", team: "T" }), true);
  assert.equal(S.matches(data.inventory[3], { color: "red" }), false);
  assert.equal(S.matches(data.inventory[2], { team: "CT" }), false);
  assert.equal(S.matches(data.inventory[0], { weapon: "ak47" }), false);
});
test("random loadout uses owned skins, keeps weapon models and only fills matching slots", () => {
  const data = fixture();
  const plan = S.plan(data, { mode: "loadout", team: "both", color: "red" }, () => 0);
  assert.ok(plan.entries.some(entry => entry.team === "CT" && entry.slot === "r2" && entry.itemId === 101));
  assert.ok(plan.entries.some(entry => entry.team === "T" && entry.slot === "r2" && entry.itemId === 102));
  assert.equal(new Set(plan.entries.map(entry => `${entry.team}:${entry.slot}`)).size, plan.entries.length);
  assert.ok(plan.entries.every(entry => data.inventory.some(item => item.id === entry.itemId)));
  assert.equal(plan.entries.some(entry => entry.model === "ak47" && entry.team === "CT"), false);
  assert.ok(plan.skipped > 0);
  assert.equal(S.validate(data, plan), true);
});
test("roster repair avoids duplicate default weapons after a custom position", () => {
  const data = fixture();
  data.loadout.push({ team: "CT", slot: "p1", item: { model: "deagle" } });
  const roster = S.roster(data, "CT");
  assert.equal(roster.p1, "deagle");
  assert.equal(new Set([roster.p1, roster.p2, roster.p3, roster.p4]).size, 4);
});
test("preview validation rejects changed presets, wrong teams, unknown instances and repeated slots", () => {
  const data = fixture();
  const plan = S.plan(data, { mode: "equip", itemId: 102, team: "T" });
  assert.equal(S.validate(data, plan), true);
  assert.equal(S.validate({ ...data, preset: "preset-2" }, plan), false);
  assert.equal(S.validate(data, { ...plan, entries: [{ ...plan.entries[0], team: "CT" }] }), false);
  assert.equal(S.validate(data, { ...plan, entries: [{ ...plan.entries[0], itemId: 999 }] }), false);
  assert.equal(S.validate(data, { ...plan, entries: [...plan.entries, ...plan.entries] }), false);
});

test("catalog loadout can include unowned skins and keeps selection targets separate from owned equip plans", () => {
  const data = fixture();
  const plan = S.catalogPlan(data, fullCatalog(data), { team: "both", color: "red" }, () => .999);
  assert.equal(plan.source, "catalog");
  assert.ok(plan.entries.some(entry => entry.team === "T" && entry.slot === "r2" && entry.catalogId === 9000));
  assert.equal(plan.entries.some(entry => Object.hasOwn(entry, "itemId")), false);
  assert.equal(S.validate(data, plan), false);
});

function adapter({ failAt = 0, signIn = true, switchPreset = false, confirmWrites = true, confirmCraft = true, extraCatalog = [] } = {}) {
  const data = fixture();
  const publicCatalog = [...fullCatalog(data), ...extraCatalog].map(item => ({ ...item, wearMin: .02, wearMax: .4, seedMin: 1, seedMax: 1000 }));
  const requests = [];
  const events = new EventTarget();
  class CustomEvent extends Event { constructor(type, options) { super(type); this.detail = options.detail; } }
  const document = {
    addEventListener: events.addEventListener.bind(events), dispatchEvent: events.dispatchEvent.bind(events)
  };
  let writes = 0;
  let presetReads = 0;
  const fetch = async (url, options) => {
    assert.equal(new URL(url).origin, "https://inventory.karasu.live");
    assert.equal(options.credentials, "include");
    const path = new URL(url).pathname;
    const body = options.body && JSON.parse(options.body);
    requests.push({ path, method: options.method, body });
    if (!signIn && !path.startsWith("/api/catalog")) return { ok: false, status: 401 };
    if (options.method === "POST") {
      writes++;
      if (writes === failAt) return { ok: false, status: 500 };
      if (path === "/api/inventory/craft") {
        const item = publicCatalog.find(item => item.id === body.item_id);
        assert.ok(item);
        const instance = { id: 500, item_id: item.id, item: clone(item), slot: S.modelOf(item), ...body };
        if (confirmCraft) data.inventory.push(instance);
        return { ok: true, json: async () => clone(instance) };
      }
      assert.equal(path, "/api/loadout");
      if (confirmWrites) {
        const inst = data.inventory.find(item => item.id === body.item_instance_id);
        data.loadout = data.loadout.filter(row => row.team !== body.team || row.slot !== body.slot);
        data.loadout.push({ ...body, item_id: inst.item_id, item: clone(inst.item) });
      }
      return { ok: true, json: async () => ({ ok: true }) };
    }
    const response = path === "/api/catalog" ? { weapons: data.weapons } : path === "/api/inventory" ? data.inventory : path === "/api/loadout" ? data.loadout : path === "/api/loadout/presets" ? [{ id: switchPreset && ++presetReads >= 3 ? "preset-2" : "preset-1", active: true }] : path === "/api/catalog/skins" ? { skins: publicCatalog.filter(entry => S.modelOf(entry) === new URL(url).searchParams.get("slot")) } : path === "/api/catalog/items" ? publicCatalog.filter(item => String(item.id) === new URL(url).searchParams.get("ids")).map(({ teams, category, ...item }) => item) : null;
    assert.ok(response, "Unexpected endpoint: " + path);
    return { ok: true, json: async () => clone(response) };
  };
  const context = vm.createContext({ document, CustomEvent, fetch, AbortSignal, URL, Date, console });
  for (const file of ["common.js", "skins.js", "skins-adapter.js"]) vm.runInContext(read(file), context);
  let sequence = 0;
  function send(type, action) {
    const id = String(++sequence);
    return new Promise(resolve => {
      const listener = event => {
        const result = JSON.parse(event.detail);
        if (result.id === id) { events.removeEventListener(context.KarasuAuto.RESPONSE, listener); resolve(result); }
      };
      events.addEventListener(context.KarasuAuto.RESPONSE, listener);
      events.dispatchEvent(new CustomEvent(context.KarasuAuto.REQUEST, { detail: JSON.stringify({ id, type, action }) }));
    });
  }
  return { data, requests, send, S: context.KarasuSkins };
}
test("skin reads are read-only, return only skin fields and use the confirmed plugin route", async () => {
  const f = adapter();
  f.data.inventory[0].private_test_field = "must not leave adapter";
  const result = await f.send("skins:read");
  assert.equal(result.ok, true);
  assert.equal(result.data.skinBase, "/apps/inventory");
  assert.equal(result.data.inventory[0].private_test_field, undefined);
  assert.ok(f.requests.every(request => request.method === "GET"));
});

test("full catalog browsing requires no private inventory reads and caches each weapon", async () => {
  const f = adapter({ signIn: false });
  const info = await f.send("skins:read", { catalogOnly: true });
  assert.equal(info.ok, true);
  assert.equal(info.data.personal, false);
  assert.equal(info.data.skinBase, "/apps/inventory");
  const result = await f.send("skins:read", { catalogWeapon: "all" });
  assert.equal(result.ok, true);
  assert.equal(result.items.length, 9);
  assert.ok(result.items.some(item => item.id === 9000));
  const calls = f.requests.length;
  await f.send("skins:read", { catalogWeapon: "all" });
  assert.equal(f.requests.length, calls);
  assert.ok(f.requests.every(request => request.method === "GET" && request.path.startsWith("/api/catalog")));
});
test("catalog relay preserves Doppler metadata and crafts the selected gem catalog ID", async () => {
  const f = adapter({ extraCatalog: dopplerCatalog() });
  const catalog = await f.send("skins:read", { catalogWeapon: "knife" });
  const sapphire = catalog.items.find(item => item.id === 1343);
  assert.equal(sapphire.altName, "Sapphire");
  assert.equal(f.S.displayName(sapphire), "Karambit | Doppler — Sapphire");
  const result = await f.send("skins:craft", { operationId: randomUUID(), catalogId: sapphire.id, team: "both" });
  assert.equal(result.ok, true);
  assert.equal(f.requests.find(request => request.path === "/api/inventory/craft").body.item_id, 1343);
  assert.equal(result.data.inventory.find(entry => entry.item_id === 1343).item.altName, "Sapphire");
});

test("apply uses owned instance IDs, verifies the saved loadout, and never repeats an operation", async () => {
  const f = adapter();
  const { data } = await f.send("skins:read");
  const plan = f.S.plan(data, { mode: "equip", itemId: 101, team: "CT" });
  const action = { operationId: randomUUID(), plan };
  const result = await f.send("skins:apply", action);
  assert.equal(result.ok, true);
  assert.equal(result.applied, 1);
  assert.deepEqual(f.requests.find(request => request.method === "POST").body, { team: "CT", slot: "r2", item_instance_id: 101 });
  assert.equal((await f.send("skins:apply", action)).reason, "duplicate");
  assert.equal(f.requests.filter(request => request.method === "POST").length, 1);
});
test("stale loadouts and foreign instances cannot submit a skin mutation", async () => {
  for (const mode of ["preset", "foreign"]) {
    const f = adapter();
    const { data } = await f.send("skins:read");
    const plan = f.S.plan(data, { mode: "equip", itemId: 101, team: "CT" });
    if (mode === "preset") plan.revision = "stale"; else plan.entries[0].itemId = 99999;
    assert.equal((await f.send("skins:apply", { operationId: randomUUID(), plan })).reason, "stale");
    assert.equal(f.requests.filter(request => request.method === "POST").length, 0);
  }
});
test("a preset switch between preview and submission prevents all writes", async () => {
  const f = adapter({ switchPreset: true });
  const { data } = await f.send("skins:read");
  const plan = f.S.plan(data, { mode: "equip", itemId: 101, team: "CT" });
  assert.equal((await f.send("skins:apply", { operationId: randomUUID(), plan })).reason, "stale");
  assert.equal(f.requests.filter(request => request.method === "POST").length, 0);
});
test("partial failures stop a loadout batch and never retry a failed POST", async () => {
  const f = adapter({ failAt: 2 });
  const { data } = await f.send("skins:read");
  const plan = f.S.plan(data, { mode: "loadout", team: "both" }, () => 0);
  const result = await f.send("skins:apply", { operationId: randomUUID(), plan });
  assert.equal(result.ok, false);
  assert.equal(result.applied, 1);
  assert.equal(result.uncertain, true);
  assert.equal(f.requests.filter(request => request.method === "POST").length, 2);
});
test("HTTP success without observed changes is not reported as confirmed", async () => {
  const f = adapter({ confirmWrites: false });
  const { data } = await f.send("skins:read");
  const plan = f.S.plan(data, { mode: "equip", itemId: 101, team: "CT" });
  const result = await f.send("skins:apply", { operationId: randomUUID(), plan });
  assert.equal(result.ok, false); assert.equal(result.applied, 0); assert.equal(result.reason, "unconfirmed");
});
test("signed-out reads return an actionable error and cannot mutate loadouts", async () => {
  const f = adapter({ signIn: false });
  const result = await f.send("skins:read");
  assert.equal(result.reason, "sign-in");
  assert.equal(f.requests.filter(request => request.method === "POST").length, 0);
});

test("craft and equip uses server catalog defaults, infers team restrictions, and submits only once", async () => {
  const f = adapter();
  const action = { operationId: randomUUID(), catalogId: 13, team: "both", wear: 1, stickers: [{ id: 999 }] };
  const result = await f.send("skins:craft", action);
  assert.equal(result.ok, true);
  assert.equal(result.created, true);
  assert.deepEqual(result.equipped, ["T"]);
  const posts = f.requests.filter(request => request.method === "POST");
  assert.deepEqual(posts.map(request => request.path), ["/api/inventory/craft", "/api/loadout"]);
  assert.deepEqual(posts[0].body, { item_id: 13, wear: .02, seed: 1, stattrak: false, nametag: null, stickers: Array(5).fill(null), patches: Array(3).fill(null), charm_id: null, charm_offset: null });
  assert.deepEqual(posts[1].body, { team: "T", slot: "r2", item_instance_id: 500 });
  assert.equal((await f.send("skins:craft", action)).reason, "duplicate");
  assert.equal(f.requests.filter(request => request.method === "POST").length, 2);
});

test("Both crafts one shared skin and equips the same instance for CT and T", async () => {
  const f = adapter();
  const result = await f.send("skins:craft", { operationId: randomUUID(), catalogId: 14, team: "both" });
  assert.equal(result.ok, true);
  assert.deepEqual(result.equipped, ["CT", "T"]);
  const posts = f.requests.filter(request => request.method === "POST");
  assert.equal(posts.filter(request => request.path === "/api/inventory/craft").length, 1);
  assert.deepEqual(posts.filter(request => request.path === "/api/loadout").map(request => request.body), [
    { team: "CT", slot: "p4", item_instance_id: 500 }, { team: "T", slot: "p4", item_instance_id: 500 }
  ]);
});

test("incompatible teams, unknown catalog items, and signed-out requests cannot craft", async () => {
  for (const [options, id, team, reason] of [[{}, 13, "CT", "incompatible-team"], [{}, 99999, "T", "invalid"], [{ signIn: false }, 13, "T", "sign-in"]]) {
    const f = adapter(options);
    const result = await f.send("skins:craft", { operationId: randomUUID(), catalogId: id, team });
    assert.equal(result.reason, reason);
    assert.equal(f.requests.some(request => request.method === "POST"), false);
  }
});

test("failed or unconfirmed crafts do not equip or automatically repeat creation", async () => {
  for (const options of [{ failAt: 1 }, { confirmCraft: false }]) {
    const f = adapter(options);
    const action = { operationId: randomUUID(), catalogId: 13, team: "T" };
    const result = await f.send("skins:craft", action);
    assert.equal(result.ok, false);
    assert.equal(result.uncertain, true);
    assert.equal((await f.send("skins:craft", action)).reason, "duplicate");
    assert.deepEqual(f.requests.filter(request => request.method === "POST").map(request => request.path), ["/api/inventory/craft"]);
  }
});

test("equip failure preserves the created item and stops the rest of a Both request", async () => {
  const f = adapter({ failAt: 2 });
  const result = await f.send("skins:craft", { operationId: randomUUID(), catalogId: 14, team: "both" });
  assert.equal(result.ok, false);
  assert.equal(result.created, true);
  assert.equal(result.uncertain, true);
  assert.ok(f.data.inventory.some(entry => entry.id === 500));
  assert.deepEqual(f.requests.filter(request => request.method === "POST").map(request => request.path), ["/api/inventory/craft", "/api/loadout"]);
});

test("a preset switch after creation prevents equipping into the changed preset", async () => {
  const f = adapter({ switchPreset: true });
  const result = await f.send("skins:craft", { operationId: randomUUID(), catalogId: 14, team: "both" });
  assert.equal(result.ok, false);
  assert.equal(result.created, true);
  assert.equal(result.reason, "stale");
  assert.deepEqual(f.requests.filter(request => request.method === "POST").map(request => request.path), ["/api/inventory/craft"]);
});

test("HTTP success without saved equipment is not shown as Crafted and equipped", async () => {
  const f = adapter({ confirmWrites: false });
  const result = await f.send("skins:craft", { operationId: randomUUID(), catalogId: 13, team: "T" });
  assert.equal(result.ok, false);
  assert.equal(result.created, true);
  assert.equal(result.reason, "unconfirmed");
  assert.deepEqual(result.equipped, []);
});

function panel({ craftResult, extraCatalog = [], marketSnapshot, studioStore, craftHandler, mutateData } = {}) {
  const { document, window } = parseHTML('<!doctype html><html><body><main id="app"></main></body></html>');
  const data = fixture();
  mutateData?.(data);
  const requests = [];
  const context = vm.createContext({ document, window, crypto: { randomUUID }, Date, console });
  for (const file of ["common.js", "skins.js", "market.js", "studio.js", "skins-panel.js", "panel.js"]) vm.runInContext(read(file), context);
  const root = document.getElementById("app");
  context.KarasuPanel.create(root, {
    settings: {}, onPatch: async patch => patch,
    studio: studioStore,
    market: marketSnapshot ? { load: async () => marketSnapshot } : undefined,
    onSkins: async request => {
      requests.push(clone(request));
      if (request.type === "craft") return craftHandler ? craftHandler(request) : craftResult || { ok: true, created: true, equipped: request.action.team === "both" ? ["CT", "T"] : [request.action.team], data, tabId: 9 };
      const catalog = [...fullCatalog(data), ...extraCatalog];
      const items = request.action?.catalogWeapon === "all" ? catalog : catalog.filter(entry => S.modelOf(entry) === request.action?.catalogWeapon);
      const metadata = request.action?.catalogOnly ? { ...data, inventory: [], loadout: [], preset: "", personal: false } : data;
      return request.type === "apply" ? { ok: true, applied: request.action.plan.entries.length, data, tabId: 9 } : request.action?.catalogWeapon ? { ok: true, items, tabId: 9 } : { ok: true, data: clone(metadata), tabId: 9 };
    }
  });
  return { root, document, window, data, requests };
}
test("minimal English panel loads skins only when its tab is opened", async () => {
  const f = panel();
  assert.equal(f.requests.length, 0);
  assert.equal(f.root.querySelectorAll('[data-list="map"] .ka-add').length, 7);
  assert.equal(f.root.querySelectorAll('[data-list="location"] .ka-add').length, 5);
  assert.equal(/Vertigo|Ustawienia|Bany/.test(f.root.textContent), false);
  f.root.querySelector('[data-tab="skins"]').click(); await settle();
  assert.equal(f.requests.length, 2);
  assert.equal(f.requests[0].action.catalogOnly, true);
  assert.equal(f.requests[1].action.catalogWeapon, "all");
  assert.equal(f.root.querySelector('[data-source="catalog"]').getAttribute("aria-pressed"), "true");
  assert.equal(f.root.querySelectorAll(".ka-skin-result").length, 9);
  assert.equal(f.root.querySelector(".ka-skin-controls").disabled, false);
});
test("skin results and craft preview show the gem while submitting its unchanged catalog ID", async () => {
  const f = panel({ extraCatalog: dopplerCatalog() });
  f.root.querySelector('[data-tab="skins"]').click(); await settle();
  const input = f.root.querySelector("[data-search]");
  input.value = "Karambit Sapphire"; input.dispatchEvent(new f.window.Event("input"));
  const results = [...f.root.querySelectorAll(".ka-skin-result")];
  assert.equal(results.length, 1);
  assert.equal(results[0].textContent, "Karambit | Doppler — Sapphire");
  results[0].click();
  assert.equal(f.root.querySelector(".ka-preview-name").textContent, "Karambit | Doppler — Sapphire");
  f.root.querySelector('[data-craft-team="both"]').click(); await settle();
  assert.equal(f.requests.find(request => request.type === "craft").action.catalogId, 1343);
});

test("catalog-only panel has no My inventory entry and does not request personal inventory on opening", async () => {
  const f = panel();
  f.root.querySelector('[data-tab="skins"]').click(); await settle();
  assert.equal(f.root.querySelector('[data-source="owned"]'), null);
  assert.doesNotMatch(f.root.textContent, /My inventory/);
  assert.ok(f.requests.every(request => request.type === "read" && (request.action?.catalogOnly === true || request.action?.catalogWeapon)));
  assert.equal(f.root.querySelectorAll(".ka-skin-result").length, 9);
});
test("catalog browsing waits for a team button and disables incompatible teams", async () => {
  const f = panel();
  f.root.querySelector('[data-tab="skins"]').click(); await settle();
  const weapon = f.root.querySelector("[data-weapon]");
  for (const option of weapon.querySelectorAll("option")) option.selected = false;
  weapon.querySelector('[value="m4a1_silencer"]').selected = true;
  weapon.dispatchEvent(new f.window.Event("change")); await settle();
  f.root.querySelector(".ka-skin-result").click();
  assert.equal(f.root.querySelector("[data-apply]").hidden, true);
  assert.equal(f.root.querySelector("[data-craft-actions]").hidden, false);
  assert.equal(f.root.querySelector('[data-craft-team="T"]').disabled, true);
  assert.equal(f.root.querySelector('[data-craft-team="CT"]').disabled, false);
  assert.equal(f.requests.filter(request => request.type === "apply").length, 0);
  assert.equal(f.requests.filter(request => request.type === "craft").length, 0);
  f.root.querySelector('[data-craft-team="both"]').click();
  f.root.querySelector('[data-craft-team="CT"]').click();
  await settle();
  const crafts = f.requests.filter(request => request.type === "craft");
  assert.equal(crafts.length, 1);
  assert.equal(crafts[0].tabId, 9);
  assert.equal(crafts[0].action.team, "both");
  assert.ok([10, 11, 20].includes(crafts[0].action.catalogId));
  assert.ok([...f.root.querySelectorAll("[data-craft-team]")].every(button => button.disabled));
  assert.match(f.root.querySelector(".ka-skins-status").textContent, /Crafted and equipped/);
  assert.equal(f.root.querySelector('a[target="_blank"][href*="/craft/"]'), null);
});

test("random weapon previews an unowned skin and uses the clicked Craft for T action", async () => {
  const f = panel();
  assert.equal(f.root.querySelector("[data-open-site]").href, "https://karasu.live/apps/inventory");
  f.root.querySelector('[data-tab="skins"]').click(); await settle();
  const input = f.root.querySelector("[data-search]"); input.value = "Bloodsport"; input.dispatchEvent(new f.window.Event("input"));
  const team = f.root.querySelector("[data-team]");
  for (const option of team.querySelectorAll("option")) option.selected = option.value === "T";
  team.dispatchEvent(new f.window.Event("change"));
  f.root.querySelector("[data-random]").click();
  assert.match(f.root.querySelector(".ka-preview-name").textContent, /Bloodsport/);
  assert.equal(f.requests.some(request => request.type === "craft"), false);
  f.root.querySelector('[data-craft-team="T"]').click(); await settle();
  const craft = f.requests.find(request => request.type === "craft");
  assert.equal(craft.action.catalogId, 9000);
  assert.equal(craft.action.team, "T");
  assert.equal(f.requests.some(request => request.type === "apply"), false);
});

test("each Craft for button sends its own team choice, independently of the catalog filter", async () => {
  for (const team of ["T", "CT", "both"]) {
    const f = panel();
    f.root.querySelector('[data-tab="skins"]').click(); await settle();
    const input = f.root.querySelector("[data-search]"); input.value = "Code Red"; input.dispatchEvent(new f.window.Event("input"));
    f.root.querySelector(".ka-skin-result").click();
    assert.deepEqual([...f.root.querySelectorAll("[data-craft-team]")].map(button => button.textContent), ["Craft for T", "Craft for CT", "Craft for Both"]);
    f.root.querySelector(`[data-craft-team="${team}"]`).click(); await settle();
    const craft = f.requests.find(request => request.type === "craft");
    assert.equal(craft.action.catalogId, 14);
    assert.equal(craft.action.team, team);
    assert.ok([...f.root.querySelectorAll("[data-craft-team]")].every(button => button.disabled));
  }
});

test("catalog random loadout equips only the row the user selects", async () => {
  const f = panel();
  f.root.querySelector('[data-tab="skins"]').click(); await settle();
  f.root.querySelector("[data-loadout]").click(); await settle();
  const buttons = [...f.root.querySelectorAll(".ka-catalog-equip")];
  assert.ok(buttons.length > 3);
  assert.equal(f.root.querySelector("[data-apply]").hidden, true);
  assert.equal(f.requests.some(request => request.type === "craft"), false);
  buttons[0].click(); await settle();
  assert.equal(f.requests.filter(request => request.type === "craft").length, 1);
  assert.ok(["CT", "T"].includes(f.requests.find(request => request.type === "craft").action.team));
  assert.equal(buttons[0].disabled, true);
  assert.equal(buttons[1].disabled, false);
  assert.equal(f.requests.some(request => request.type === "apply"), false);
});

test("uncertain craft results block another click and ask the user to check inventory", async () => {
  const f = panel({ craftResult: { ok: false, created: true, uncertain: true, reason: "timeout" } });
  f.root.querySelector('[data-tab="skins"]').click(); await settle();
  f.root.querySelector(".ka-skin-result").click();
  const button = f.root.querySelector('[data-craft-team="both"]');
  button.click(); await settle();
  f.root.querySelector('[data-craft-team="CT"]').click(); await settle();
  assert.equal(f.requests.filter(request => request.type === "craft").length, 1);
  assert.equal(button.disabled, true);
  assert.match(f.root.querySelector(".ka-skins-status").textContent, /Skin created.*Check your inventory/);
});

test("selection actions live outside the scrolling list and remain available for a result near its end", async () => {
  const f = panel(); f.root.querySelector('[data-tab="skins"]').click(); await settle();
  const results = [...f.root.querySelectorAll(".ka-skin-result")];
  results.at(-1).click();
  const dock = f.root.querySelector(".ka-selection-dock");
  assert.equal(dock.hidden, false);
  assert.equal(dock.querySelector(".ka-skin-preview").hidden, false);
  assert.equal(f.root.querySelector(".ka-body").contains(dock), false);
  assert.equal(dock.querySelectorAll("[data-craft-team]").length, 3);
  f.root.querySelector('[data-tab="maps"]').click(); assert.equal(dock.hidden, true);
  f.root.querySelector('[data-tab="skins"]').click(); assert.equal(dock.hidden, false);
});

test("Studio filters use real attached values, and unknown or cheap skins cannot enter a minimum-value loadout", async () => {
  const f = panel({ marketSnapshot: { prices: { "ak 47 bloodsport::": 100, "ak 47 redline::": 20 } } });
  f.root.querySelector('[data-tab="skins"]').click(); await settle();
  const value = f.root.querySelector("[data-min-value]"); value.value = "50"; value.dispatchEvent(new f.window.Event("change"));
  assert.equal(f.root.querySelectorAll(".ka-skin-result").length, 1);
  assert.match(f.root.querySelector(".ka-skin-result").textContent, /Bloodsport/);
  f.root.querySelector("[data-loadout]").click(); await settle();
  const rows = [...f.root.querySelectorAll(".ka-skin-preview li")];
  assert.equal(rows.length, 1); assert.match(rows[0].textContent, /Bloodsport/);
  assert.equal(rows[0].querySelector(".ka-preview-team").textContent, "T");
  assert.equal(f.requests.some(request => request.type === "craft"), false);
});

test("a locked loadout slot survives rerolling while an unlocked slot gets a different compatible skin", async () => {
  const f = panel(); f.root.querySelector('[data-tab="skins"]').click(); await settle();
  f.root.querySelector("[data-loadout]").click(); await settle();
  const first = f.root.querySelector('[data-slot-key="CT:r2"]');
  const lockedName = first.querySelector(".ka-preview-name").textContent;
  first.querySelector(".ka-slot-lock").click();
  const unlocked = f.root.querySelector('[data-slot-key="T:r2"]');
  const oldName = unlocked.querySelector(".ka-preview-name").textContent;
  f.root.querySelector("[data-reroll]").click();
  assert.equal(f.root.querySelector('[data-slot-key="CT:r2"] .ka-preview-name').textContent, lockedName);
  assert.notEqual(f.root.querySelector('[data-slot-key="T:r2"] .ka-preview-name').textContent, oldName);
  assert.equal(f.root.querySelector("[data-locked-count]").textContent, "1 locked");
  assert.equal(f.requests.some(request => request.type === "craft"), false);
});

test("favorite selections and saved loadouts persist and reopen as previews without automatically crafting", async () => {
  let state = { preferences: {}, favorites: [], presets: [] };
  const studioStore = { async load() { return clone(state); }, async update(patch) { state = clone({ ...state, ...patch }); return clone(state); } };
  const f = panel({ studioStore }); f.root.querySelector('[data-tab="skins"]').click(); await settle();
  f.root.querySelector(".ka-favorite").click(); await settle();
  assert.equal(state.favorites.length, 1);
  f.root.querySelector("[data-loadout]").click(); await settle();
  f.root.querySelector("[data-set-name]").value = "Red setup";
  f.root.querySelector("[data-save-set]").click(); await settle();
  assert.equal(state.presets.length, 1); assert.ok(state.presets[0].entries.length);
  const second = panel({ studioStore }); second.root.querySelector('[data-tab="skins"]').click(); await settle();
  const select = second.root.querySelector("[data-saved-set]");
  for (const option of select.querySelectorAll("option")) option.selected = option.value === state.presets[0].id;
  second.root.querySelector("[data-load-set]").click(); await settle();
  assert.equal(second.root.querySelectorAll(".ka-skin-preview li").length, state.presets[0].entries.length);
  assert.equal(second.requests.some(request => request.type === "craft"), false);
  assert.match(second.root.querySelector("[data-dock-status]").textContent, /as a preview/);
});

test("crafting a Studio loadout groups identical CT/T skins and submits each catalog ID once", async () => {
  const f = panel(); f.root.querySelector('[data-tab="skins"]').click(); await settle();
  f.root.querySelector("[data-loadout]").click(); await settle();
  f.root.querySelector("[data-craft-batch]").click(); await settle();
  const requests = f.requests.filter(request => request.type === "craft");
  assert.ok(requests.length > 2);
  assert.equal(new Set(requests.map(request => request.action.catalogId)).size, requests.length);
  const shared = requests.find(request => request.action.catalogId === 14);
  assert.equal(shared.action.team, "both");
  assert.equal(f.root.querySelector("[data-craft-batch]").disabled, true);
});

test("an uncertain craft stops the entire batch and blocks another batch until inventory is checked", async () => {
  const f = panel({ craftResult: { ok: false, uncertain: true, created: true, reason: "timeout" } });
  f.root.querySelector('[data-tab="skins"]').click(); await settle();
  f.root.querySelector("[data-loadout]").click(); await settle();
  f.root.querySelector("[data-craft-batch]").click(); await settle();
  assert.equal(f.requests.filter(request => request.type === "craft").length, 1);
  assert.equal(f.root.querySelector("[data-craft-batch]").disabled, true);
  assert.match(f.root.querySelector("[data-dock-status]").textContent, /Check inventory/);
});

test("Stop waits for the in-flight craft and never submits another skin", async () => {
  let finish;
  const f = panel({ craftHandler: () => new Promise(resolve => { finish = resolve; }) });
  f.root.querySelector('[data-tab="skins"]').click(); await settle();
  f.root.querySelector("[data-loadout]").click(); await settle();
  f.root.querySelector("[data-craft-batch]").click(); await settle();
  f.root.querySelector("[data-cancel]").click();
  finish({ ok: true, created: true, equipped: ["CT"] }); await settle();
  assert.equal(f.requests.filter(request => request.type === "craft").length, 1);
  assert.match(f.root.querySelector("[data-dock-status]").textContent, /Stopped after 1/);
});
