"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { randomUUID } = require("node:crypto");
const { parseHTML } = require("linkedom");
const read = file => fs.readFileSync("extension/" + file, "utf8");
const clone = value => JSON.parse(JSON.stringify(value));
const settle = () => new Promise(resolve => setImmediate(resolve));

class Clock {
  constructor() { this.now = 1000000; this.next = 0; this.timers = new Map(); }
  schedule(fn, delay, repeat = false) {
    const id = ++this.next;
    this.timers.set(id, { fn, at: this.now + delay, repeat: repeat ? delay : 0 });
    return id;
  }
  async advance(amount) {
    const end = this.now + amount;
    for (let attempts = 0; attempts < 10000; attempts++) {
      const entry = [...this.timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!entry) break;
      const [id, timer] = entry;
      this.now = timer.at;
      if (timer.repeat) timer.at += timer.repeat; else this.timers.delete(id);
      timer.fn();
      await settle();
    }
    this.now = end;
    await settle();
  }
}

async function harness({ kind = "accept", settings = {}, acknowledge = true, skinFetch, serverReady = false, autoCopyConnect = false, initiallyReady = true } = {}) {
  const clock = new Clock();
  class FakeDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock.now])); }
    static now() { return clock.now; }
  }
  const { document, window } = parseHTML('<!doctype html><html><head></head><body><div id="__nuxt"><main id="queue"></main></div></body></html>');
  const calls = [];
  const clipboardWrites = [];
  const protectionWrites = [];
  let discardable = true;
  const storageListeners = [];
  const state = { local: { settings, autoCopyConnect }, session: {} };
  const readyMatchId = "99c2ea5a-de47-4986-b7f3-7e13fcc82373";
  let runtimeListener;
  const contentListeners = [];
  const area = name => ({
    async get(query) {
      if (typeof query === "string") return state[name][query] === undefined ? {} : { [query]: clone(state[name][query]) };
      return clone({ ...query, ...state[name] });
    },
    async set(value) {
      const changes = {};
      for (const [key, next] of Object.entries(value)) {
        changes[key] = { oldValue: state[name][key], newValue: clone(next) };
        state[name][key] = clone(next);
      }
      for (const fn of storageListeners) fn(changes, name);
    }
  });
  const chrome = {
    storage: { local: area("local"), session: area("session"), onChanged: { addListener(fn) { storageListeners.push(fn); } } },
    tabs: {
      async query() { return [{ id: 1 }]; },
      async get(id) { return { id, autoDiscardable: discardable }; },
      async update(id, options) { discardable = options.autoDiscardable; protectionWrites.push({ id, ...options }); return { id }; },
      sendMessage(id, message) { return new Promise(resolve => contentListeners.forEach(listener => listener(message, { id: "test" }, resolve))); }
    },
    runtime: {
      id: "test",
      getURL(path) { return "chrome-extension://test/" + path; },
      async getContexts() { return []; },
      onMessage: { addListener(fn) { if (!runtimeListener) runtimeListener = fn; else contentListeners.push(fn); } }, onInstalled: { addListener() {} },
      sendMessage(message) {
        if (message.target === "clipboard") { clipboardWrites.push(message.command); return Promise.resolve({ ok: true }); }
        return new Promise(resolve => runtimeListener(message, { url: serverReady ? `https://karasu.live/matches/${readyMatchId}` : "https://karasu.live/play", tab: { id: 1 } }, resolve));
      }
    },
    offscreen: { async createDocument() {}, async closeDocument() {} }
  };
  const base = { document, window, CustomEvent: window.CustomEvent, Date: FakeDate, crypto: { randomUUID }, URL, console,
    setTimeout: (fn, delay) => clock.schedule(fn, delay), clearTimeout: id => clock.timers.delete(id),
    setInterval: (fn, delay) => clock.schedule(fn, delay, true), clearInterval: id => clock.timers.delete(id) };
  const worker = vm.createContext({ chrome, crypto: { randomUUID }, URL, Date: FakeDate, setTimeout: base.setTimeout, clearTimeout: base.clearTimeout });
  worker.importScripts = file => vm.runInContext(read(file), worker);
  vm.runInContext(read("background.js"), worker);

  const match = {
    id: "match-1", status: "Veto", is_captain: true, is_in_lineup: true, region: "Europe",
    lineup_1: { id: "lineup-1", is_on_lineup: true, can_pick_map_veto: true, can_pick_location_veto: true },
    lineup_2: { id: "lineup-2", is_on_lineup: false, can_pick_map_veto: false, can_pick_location_veto: false },
    map_veto_picking_lineup_id: "lineup-1", location_veto_picking_lineup_id: "lineup-1",
    server_location: kind === "location" ? null : "prague", match_maps: [],
    options: { location_veto: true, best_of: 1, veto_pick_timeout: 30 },
    veto_pick_expires_at: new FakeDate(clock.now + 60000).toISOString()
  };
  if (serverReady) Object.assign(match, { id: readyMatchId, status: "Live", is_match_server_available: true, connection_string: "152.233.60.2:26198" });
  const confirmation = { confirmationId: "confirmation-1", isReady: false, expiresAt: new FakeDate(clock.now + 60000).toISOString() };
  const fields = {};
  const proxy = {
    match, isPicking: true, submitting: false, picks: [], pickType: "Ban", isLocationVeto: true, isBanning: kind === "location",
    availableLocations: ["barcelona", "prague", "dusseldorf"],
    mapPool: [{ id: "map-mirage", name: "de_mirage" }, { id: "map-nuke", name: "de_nuke" }, { id: "map-ancient", name: "de_ancient" }],
    form: { values: fields, setFieldValue(key, value) { fields[key] = value; } },
    async vetoPick() {
      calls.push({ kind, ...fields });
      if (acknowledge) {
        if (kind === "location") { proxy.picks.push({ location: fields.location }); proxy.availableLocations = proxy.availableLocations.filter(value => value !== fields.location); }
        else proxy.picks.push({ map: { id: fields.map_id } });
      }
      proxy.submitting = true;
    }
  };
  const readyProxy = { confirmation, shouldShow: initiallyReady, ready() { calls.push({ kind: "accept" }); if (acknowledge) confirmation.isReady = true; } };
  const queue = document.getElementById("queue");
  const vnode = (name, componentProxy, el = queue) => ({ component: { type: { __name: name }, proxy: componentProxy, subTree: { el } } });
  const tree = { children: [vnode("KarasuQueue", {})] };
  if (serverReady) tree.children.push(vnode("index", { match }));
  else if (kind === "accept") tree.children.push(vnode("MatchmakingConfirm", readyProxy));
  else tree.children.push(vnode(kind === "map" ? "MatchMapVeto" : "MatchLocationVeto", proxy));
  document.getElementById("__nuxt").__vue_app__ = { _container: { _vnode: tree } };
  const main = vm.createContext({ ...base, fetch: skinFetch, AbortSignal });
  vm.runInContext(read("common.js"), main);
  vm.runInContext(read("page-adapter.js"), main);
  if (skinFetch) for (const file of ["skins.js", "skins-adapter.js"]) vm.runInContext(read(file), main);
  const isolated = vm.createContext({ ...base, chrome, MutationObserver: window.MutationObserver });
  for (const file of ["common.js", "panel.js", "content.js"]) vm.runInContext(read(file), isolated, { filename: file });
  await settle();
  async function patch(change) { await chrome.runtime.sendMessage({ type: "settings:save", patch: change }); await settle(); }
  function openPanel() {
    const root = document.createElement("main");
    isolated.KarasuPanel.create(root, {
      settings: state.local.settings,
      onPatch: async change => { const result = await chrome.runtime.sendMessage({ type: "settings:save", patch: change }); return result.settings; }
    });
    return root;
  }
  const sendSkins = request => new Promise(resolve => runtimeListener({ type: "skins:request", request }, { id: "test", url: "chrome-extension://test/popup.html" }, resolve));
  const setFaceit = (enabled, style) => chrome.storage.local.set({ faceitRanksEnabled: enabled, ...(style ? { faceitRankStyle: style } : {}) });
  const setAutoCopy = enabled => chrome.storage.local.set({ autoCopyConnect: enabled });
  const suspendIntervals = () => { for (const [id, timer] of clock.timers) if (timer.repeat) clock.timers.delete(id); };
  return { clock, document, window, calls, fields, match, proxy, readyProxy, confirmation, state, patch, openPanel, sendSkins, setFaceit, setAutoCopy, clipboardWrites, protectionWrites, suspendIntervals };
}

test("content, main-world adapter and service worker accept after the configured delay", async () => {
  const f = await harness({ settings: { acceptEnabled: true, acceptDelay: 3 } });
  assert.equal(f.document.getElementById("karasu-auto-toolbar"), null);
  assert.equal(f.document.getElementById("karasu-auto-overlay"), null);
  await f.clock.advance(2999);
  assert.equal(f.calls.length, 0);
  await f.clock.advance(1);
  assert.equal(f.calls.length, 1);
  await f.clock.advance(500);
  assert.equal(f.state.session.history[0].ok, true);
  assert.equal(f.state.session.history[0].text, "Match accepted.");
});

test("a server-rendered ready dialog wakes a hidden tab after six minutes without interval polling", async () => {
  const f = await harness({ settings: { acceptEnabled: true, acceptDelay: 3 }, initiallyReady: false });
  f.suspendIntervals(); await f.clock.advance(360000);
  assert.equal(f.calls.length, 0);
  f.confirmation.expiresAt = new Date(f.clock.now + 30000).toISOString();
  f.readyProxy.shouldShow = true;
  const marker = f.document.createElement("span"); marker.textContent = "Match ready";
  f.document.getElementById("queue").append(marker); await settle();
  await f.clock.advance(2999); assert.equal(f.calls.length, 0);
  await f.clock.advance(1); assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].kind, "accept");
});

test("turning automation off cancels a hidden-tab countdown and restores memory-saver eligibility", async () => {
  const f = await harness({ settings: { acceptEnabled: true, acceptDelay: 3 } });
  f.suspendIntervals(); await f.clock.advance(1000);
  assert.ok(f.protectionWrites.some(write => write.autoDiscardable === false));
  await f.patch({ acceptEnabled: false });
  await f.clock.advance(4000);
  assert.equal(f.calls.length, 0);
  assert.equal(f.protectionWrites.at(-1).autoDiscardable, true);
});

test("hidden-tab wakeups recheck a manual veto selection before taking any action", async () => {
  const f = await harness({ kind: "map", settings: { mapsEnabled: true, vetoDelay: 3 } });
  f.suspendIntervals(); f.fields.map_id = "map-mirage";
  await f.clock.advance(4000);
  assert.equal(f.calls.length, 0);
  assert.equal(f.fields.map_id, "map-mirage");
});

test("editing an accept delay restarts a hidden-tab countdown immediately without waiting for a page interval", async () => {
  const f = await harness({ settings: { acceptEnabled: true, acceptDelay: 3 } });
  f.suspendIntervals(); await f.clock.advance(1000);
  await f.patch({ acceptDelay: 1 });
  await f.clock.advance(999); assert.equal(f.calls.length, 0);
  await f.clock.advance(1); assert.equal(f.calls.length, 1);
  await f.clock.advance(3000); assert.equal(f.calls.length, 1);
});
test("turning Auto Accept off in the extension panel cancels pending execution", async () => {
  const f = await harness({ settings: { acceptEnabled: true } });
  await f.clock.advance(1500);
  const input = f.openPanel().querySelector('[data-toggle="acceptEnabled"] input');
  input.checked = false;
  input.dispatchEvent(new f.window.Event("change"));
  await settle();
  await f.clock.advance(4000);
  assert.equal(f.calls.length, 0);
  assert.equal(f.state.local.settings.acceptEnabled, false);
});
test("editing the map order during countdown restarts it and sends the updated preference", async () => {
  const f = await harness({ kind: "map", settings: { mapsEnabled: true, mapOrder: ["nuke"], vetoDelay: 2 } });
  await f.clock.advance(1000);
  await f.patch({ mapOrder: ["mirage", "nuke"] });
  await f.clock.advance(1500);
  assert.equal(f.calls.length, 0);
  await f.clock.advance(1000);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].map_id, "map-mirage");
  await f.clock.advance(10000);
  assert.equal(f.calls.length, 1);
  assert.match(f.state.session.history[0].text, /Mirage/);
  assert.equal(f.state.session.history[0].ok, true);
});
test("complete location flow uses saved city order and records a server-confirmed ban", async () => {
  const f = await harness({ kind: "location", settings: { locationsEnabled: true, locationOrder: ["madrid", "prague"], vetoDelay: 1 } });
  await f.clock.advance(1500);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].location, "barcelona");
  assert.equal(f.state.session.history[0].ok, true);
  assert.match(f.state.session.history[0].text, /Madrid/);
});
test("permission revoked while waiting prevents the content flow from submitting", async () => {
  const f = await harness({ kind: "map", settings: { mapsEnabled: true } });
  await f.clock.advance(1000);
  f.match.lineup_1.can_pick_map_veto = false;
  await f.clock.advance(5000);
  assert.equal(f.calls.length, 0);
});
test("a manual card selection while waiting pauses the complete flow", async () => {
  const f = await harness({ kind: "location", settings: { locationsEnabled: true } });
  await f.clock.advance(1000);
  f.fields.location = "prague";
  await f.clock.advance(5000);
  assert.equal(f.calls.length, 0);
  assert.equal(f.fields.location, "prague");
  assert.match(f.state.session.statuses[1].text, /manual/);
});
test("a request without server confirmation is reported and is never retried", async () => {
  const f = await harness({ settings: { acceptEnabled: true, acceptDelay: 1 }, acknowledge: false });
  await f.clock.advance(20000);
  assert.equal(f.calls.length, 1);
  assert.equal(f.state.session.history[0].ok, false);
  assert.match(f.state.session.history[0].text, /no server confirmation/);
});
test("extension panel supports adding and moving priority entries without touching site controls", async () => {
  const f = await harness();
  const overlay = f.openPanel();
  overlay.querySelector('[data-tab="maps"]').click();
  overlay.querySelector('[aria-label="Add to ban order: Nuke"]').click();
  await settle();
  overlay.querySelector('[aria-label="Add to ban order: Mirage"]').click();
  await settle();
  assert.deepEqual(f.state.local.settings.mapOrder, ["nuke", "mirage"]);
  overlay.querySelector('[aria-label="Move up: Mirage"]').click();
  await settle();
  assert.deepEqual(f.state.local.settings.mapOrder, ["mirage", "nuke"]);
  overlay.querySelector('[aria-label="Remove: Nuke"]').click();
  await settle();
  assert.deepEqual(f.state.local.settings.mapOrder, ["mirage"]);
  overlay.querySelector(".ka-stop").click();
  await settle();
  assert.equal(f.state.local.settings.mapsEnabled, false);
});

test("rapid priority clicks retain both edits while storage broadcasts are arriving", async () => {
  const f = await harness();
  const panel = f.openPanel();
  panel.querySelector('[data-tab="maps"]').click();
  panel.querySelector('[aria-label="Add to ban order: Nuke"]').click();
  panel.querySelector('[aria-label="Add to ban order: Mirage"]').click();
  for (let n = 0; n < 5; n++) await settle();
  assert.deepEqual(f.state.local.settings.mapOrder, ["nuke", "mirage"]);
  assert.deepEqual([...panel.querySelectorAll(".ka-selected-row .ka-item-name")].map(node => node.textContent), ["Nuke", "Mirage"]);
});

test("craft messages travel through worker, content and main-world adapters without browser automation", async () => {
  const requests = [];
  const f = await harness({ skinFetch: async (url, options) => { requests.push({ url, options }); return { ok: false, status: 401 }; } });
  const result = await f.sendSkins({ type: "craft", action: { operationId: randomUUID(), catalogId: 221, team: "T" } });
  assert.equal(result.reason, "sign-in");
  assert.equal(result.tabId, 1);
  assert.ok(requests.length > 0);
  assert.ok(requests.every(request => request.options.method === "GET" && request.url.startsWith("https://inventory.karasu.live/api/")));
  assert.equal(f.calls.length, 0);
});

test("changing FACEIT display forwards the preference without restarting a match countdown", async () => {
  const f = await harness({ settings: { acceptEnabled: true, acceptDelay: 3 } });
  const messages = [];
  f.document.addEventListener("karasu-auto:request:v1", event => messages.push(JSON.parse(event.detail)));
  await f.clock.advance(1000);
  await f.setFaceit(true, "minimal");
  assert.ok(messages.some(message => message.type === "faceit:config" && message.action.style === "minimal"));
  await f.clock.advance(500);
  await f.setFaceit(false);
  assert.ok(messages.some(message => message.type === "faceit:config" && message.action.enabled === false && message.action.style === "minimal"));
  await f.clock.advance(1500);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].kind, "accept");
});

test("opted-in ready connections pass the full verification pipeline and copy again on address changes", async () => {
  const f = await harness({ serverReady: true });
  await f.clock.advance(1000);
  assert.deepEqual(f.clipboardWrites, []);
  await f.setAutoCopy(true); await f.clock.advance(1000);
  assert.deepEqual(f.clipboardWrites, ["connect 152.233.60.2:26198"]);
  await f.clock.advance(3000);
  assert.equal(f.clipboardWrites.length, 1);
  f.match.connection_string = "152.233.60.2:26200";
  await f.clock.advance(1000);
  assert.deepEqual(f.clipboardWrites, ["connect 152.233.60.2:26198", "connect 152.233.60.2:26200"]);
  await f.setAutoCopy(false);
  f.match.connection_string = "152.233.60.2:26198";
  await f.clock.advance(1000);
  assert.equal(f.clipboardWrites.length, 2);
  await f.setAutoCopy(true); await f.clock.advance(1000);
  assert.equal(f.clipboardWrites.length, 3);
  assert.match(f.state.session.history[0].text, /Connection copied/);
  assert.equal(f.calls.length, 0);
});

test("enabling auto-copy does not restart an existing accept countdown", async () => {
  const f = await harness({ settings: { acceptEnabled: true, acceptDelay: 3 } });
  await f.clock.advance(1500); await f.setAutoCopy(true); await f.clock.advance(1500);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].kind, "accept");
  assert.deepEqual(f.clipboardWrites, []);
});
