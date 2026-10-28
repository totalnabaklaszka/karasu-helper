"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { randomUUID } = require("node:crypto");
const clone = value => JSON.parse(JSON.stringify(value));
const sender = tabId => ({ url: "https://karasu.live/play", tab: { id: tabId } });

function background(state = { local: {}, session: {} }, timers = {}) {
  let listener;
  let installed;
  const tabEvents = {};
  const area = name => ({
    async get(query) {
      await new Promise(resolve => setImmediate(resolve));
      if (typeof query === "string") return state[name][query] === undefined ? {} : { [query]: clone(state[name][query]) };
      return clone({ ...query, ...state[name] });
    },
    async set(value) {
      await new Promise(resolve => setImmediate(resolve));
      Object.assign(state[name], clone(value));
    }
  });
  const chrome = {
    storage: { local: area("local"), session: area("session") },
    tabs: { async query() { return [{ id: 1 }]; }, onUpdated: { addListener(fn) { tabEvents.updated = fn; } }, onRemoved: { addListener(fn) { tabEvents.removed = fn; } } },
    runtime: {
      id: "test",
      getURL(path) { return "chrome-extension://test/" + path; },
      onMessage: { addListener(fn) { listener = fn; } },
      onInstalled: { addListener(fn) { installed = fn; } }
    }
  };
  const sandbox = { chrome, crypto: { randomUUID }, URL, Date, setImmediate, ...timers };
  vm.createContext(sandbox);
  sandbox.importScripts = path => vm.runInContext(fs.readFileSync("extension/" + path, "utf8"), sandbox);
  vm.runInContext(fs.readFileSync("extension/background.js", "utf8"), sandbox);
  function message(value, from = sender(1)) { return new Promise(resolve => listener(value, from, result => resolve(clone(result)))); }
  return { state, message, installed, chrome, tabEvents, K: sandbox.KarasuAuto };
}

test("simultaneous tabs get exactly one claim for the same confirmation", async () => {
  const f = background();
  const settings = (await f.message({ type: "settings:save", patch: { acceptEnabled: true } })).settings;
  const request = { type: "claim", kind: "accept", token: "confirmation-1", settingsKey: f.K.settingsKey(settings) };
  const responses = await Promise.all(Array.from({ length: 10 }, (_, index) => f.message(request, sender(index + 1))));
  assert.equal(responses.filter(result => result.ok).length, 1);
  assert.equal(responses.filter(result => result.reason === "duplicate").length, 9);
});
test("claims survive service worker suspension and restart", async () => {
  const f = background();
  const settings = (await f.message({ type: "settings:save", patch: { mapsEnabled: true } })).settings;
  const request = { type: "claim", kind: "map", token: "map-turn-1", settingsKey: f.K.settingsKey(settings) };
  assert.equal((await f.message(request)).ok, true);
  const restarted = background(f.state);
  assert.equal((await restarted.message(request, sender(2))).reason, "duplicate");
});
test("settings edits are merged serially without losing other toggles or priorities", async () => {
  const f = background();
  await Promise.all([
    f.message({ type: "settings:save", patch: { acceptEnabled: true } }),
    f.message({ type: "settings:save", patch: { mapOrder: ["Nuke", "Mirage"] } }),
    f.message({ type: "settings:save", patch: { locationsEnabled: true } })
  ]);
  assert.equal(f.state.local.settings.acceptEnabled, true);
  assert.equal(f.state.local.settings.locationsEnabled, true);
  assert.deepEqual(f.state.local.settings.mapOrder, ["nuke", "mirage"]);
});
test("disabled features and outdated configuration cannot claim actions", async () => {
  const f = background();
  const settings = f.K.normalizeSettings({});
  const request = { type: "claim", kind: "accept", token: "confirmation-1", settingsKey: f.K.settingsKey(settings) };
  assert.equal((await f.message(request)).reason, "disabled");
  await f.message({ type: "settings:save", patch: { acceptEnabled: true } });
  assert.equal((await f.message(request)).reason, "settings-changed");
});
test("unrelated origins cannot claim actions, alter settings or write status", async () => {
  const f = background();
  const badSender = { url: "https://example.com/", tab: { id: 2 } };
  for (const request of [{ type: "claim", kind: "accept", token: "x" }, { type: "settings:save", patch: { acceptEnabled: true } }, { type: "status", text: "spoof" }]) {
    assert.equal((await f.message(request, badSender)).ok, false);
  }
  assert.deepEqual(f.state.local, {});
  assert.deepEqual(f.state.session, {});
});
test("only the owner can release a claim after cancellation", async () => {
  const f = background();
  const settings = (await f.message({ type: "settings:save", patch: { acceptEnabled: true } })).settings;
  const request = { type: "claim", kind: "accept", token: "confirmation-1", settingsKey: f.K.settingsKey(settings) };
  const claimed = await f.message(request);
  await f.message({ type: "release", token: request.token, lease: claimed.lease }, sender(2));
  assert.equal((await f.message(request)).reason, "duplicate");
  await f.message({ type: "release", token: request.token, lease: "wrong" });
  assert.equal((await f.message(request)).reason, "duplicate");
  await f.message({ type: "release", token: request.token, lease: claimed.lease });
  assert.equal((await f.message(request)).ok, true);
});

test("background countdown scheduling is origin checked, bounded, and deduplicated per tab", async () => {
  const callbacks = [], messages = [];
  const f = background({ local: { settings: { acceptEnabled: true } }, session: {} }, {
    setTimeout(fn, delay) { callbacks.push({ fn, delay }); return callbacks.length; }, clearTimeout() {}
  });
  f.chrome.tabs.sendMessage = async (id, message) => { messages.push({ id, message: clone(message) }); };
  const request = { type: "background:schedule", key: "turn-1", delay: 3000 };
  assert.equal((await f.message(request, { url: "https://example.com/", tab: { id: 1 } })).reason, "origin");
  assert.equal((await f.message({ ...request, delay: 60000 })).reason, "invalid");
  assert.equal((await f.message(request)).ok, true);
  assert.equal((await f.message(request)).ok, true);
  assert.equal(callbacks.length, 1); assert.equal(callbacks[0].delay, 3000);
  callbacks[0].fn();
  assert.deepEqual(messages, [{ id: 1, message: { type: "automation:tick" } }]);
});

test("memory-saver protection restores the user's original preference and ignores unrelated Karasu pages", async () => {
  const f = background({ local: { settings: { acceptEnabled: true } }, session: {} });
  const updates = [];
  f.chrome.tabs.get = async () => ({ autoDiscardable: false });
  f.chrome.tabs.update = async (id, value) => { updates.push({ id, ...value }); };
  await f.message({ type: "background:protect", enabled: true });
  await f.message({ type: "background:protect", enabled: true });
  assert.equal(updates.length, 1);
  await f.message({ type: "background:protect", enabled: false });
  assert.deepEqual(updates, [{ id: 1, autoDiscardable: false }, { id: 1, autoDiscardable: false }]);
  await f.message({ type: "background:protect", enabled: true }, { url: "https://karasu.live/apps/inventory", tab: { id: 2 } });
  assert.equal(updates.length, 2);
});

test("navigation restores a protected tab and closing it clears its stored receipt", async () => {
  const f = background({ local: { settings: { acceptEnabled: true } }, session: {} });
  const updates = [];
  f.chrome.tabs.get = async () => ({ autoDiscardable: true });
  f.chrome.tabs.update = async (id, value) => { updates.push({ id, ...value }); };
  await f.message({ type: "background:protect", enabled: true });
  f.tabEvents.updated(1, { status: "loading" }); await f.message({ type: "dashboard" });
  assert.deepEqual(updates.at(-1), { id: 1, autoDiscardable: true });
  assert.deepEqual(f.state.session.protectedTabs, {});
  await f.message({ type: "background:protect", enabled: true });
  f.tabEvents.removed(1); await f.message({ type: "dashboard" });
  assert.deepEqual(f.state.session.protectedTabs, {});
});
test("history contains at most twelve local action results and no account fields", async () => {
  const f = background();
  for (let index = 0; index < 15; index++) await f.message({ type: "history", text: "Ban " + index, ok: true, steam_id: "ignored" });
  const dashboard = await f.message({ type: "dashboard" });
  assert.equal(dashboard.history.length, 12);
  assert.deepEqual(Object.keys(dashboard.history[0]).sort(), ["at", "ok", "text"]);
  assert.equal(dashboard.history[0].text, "Ban 14");
});
test("install/update normalizes preferences and retains existing choices", async () => {
  const f = background({ local: { settings: { acceptEnabled: true, acceptDelay: 7, mapOrder: ["de_nuke"] } }, session: {} });
  f.installed();
  const dashboard = await f.message({ type: "dashboard" });
  assert.equal(dashboard.settings.acceptEnabled, true);
  assert.equal(dashboard.settings.acceptDelay, 7);
  assert.deepEqual(dashboard.settings.mapOrder, ["nuke"]);
});

test("skin requests are restricted to extension pages and pinned to the originating Karasu tab", async () => {
  const f = background();
  await f.message({ type: "status", text: "Waiting" });
  const calls = [];
  f.chrome.tabs.sendMessage = async (id, message) => { calls.push([id, message]); return { ok: true, data: {} }; };
  const request = { type: "skins:request", request: { type: "read", tabId: 1 } };
  assert.equal((await f.message(request, sender(1))).reason, "origin");
  const origin = { url: "chrome-extension://test/popup.html" };
  assert.equal((await f.message(request, origin)).ok, true);
  assert.equal(calls[0][0], 1);
  assert.equal((await f.message({ ...request, request: { type: "apply", tabId: 99 } }, origin)).reason, "no-tab");
  assert.equal(calls.length, 1);
});

test("skin requests accept extension popups with an optional URL while rejecting website senders", async () => {
  const f = background();
  await f.message({ type: "status", text: "Waiting" });
  const calls = [];
  f.chrome.tabs.sendMessage = async (id, request) => { calls.push({ id, request }); return { ok: true }; };
  const message = { type: "skins:request", request: { type: "read" } };
  for (const origin of [
    { id: "test" },
    { id: "test", origin: "chrome-extension://test" },
    { id: "test", url: "chrome-extension://test/popup.html", origin: "chrome-extension://test" },
    { id: "test", url: "chrome-extension://test/options.html", tab: { id: 9 } }
  ]) assert.equal((await f.message(message, origin)).ok, true);
  assert.equal(calls.length, 4);
  for (const origin of [
    {},
    { id: "test", tab: { id: 1 } },
    { id: "foreign", url: "chrome-extension://test/popup.html" },
    { id: "test", origin: "https://karasu.live", tab: { id: 1 } },
    { id: "test", url: "https://karasu.live/apps/inventory", tab: { id: 1 } },
    { id: "test", url: "chrome-extension://test.evil/popup.html" },
    { id: "test", nativeApplication: "unrelated" }
  ]) assert.equal((await f.message(message, origin)).reason, "origin");
  assert.equal(calls.length, 4);
});

test("craft requests use the same trusted panel and tab checks as other skin actions", async () => {
  const f = background();
  await f.message({ type: "status", text: "Ready" });
  const calls = [];
  f.chrome.tabs.sendMessage = async (id, message) => { calls.push({ id, message }); return { ok: true, created: true }; };
  const request = { type: "skins:request", request: { type: "craft", tabId: 1, action: { operationId: randomUUID(), catalogId: 221, team: "T" } } };
  assert.equal((await f.message(request, sender(1))).reason, "origin");
  assert.equal(calls.length, 0);
  assert.equal((await f.message(request, { id: "test" })).ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].id, 1);
  assert.deepEqual(clone(calls[0].message), request);
});

test("a slow skin API request does not block match claims or settings", async () => {
  const f = background();
  await f.message({ type: "status", text: "Waiting" });
  let finish;
  f.chrome.tabs.sendMessage = () => new Promise(resolve => { finish = resolve; });
  const slow = f.message({ type: "skins:request", request: { type: "read" } }, { url: "chrome-extension://test/popup.html" });
  for (let n = 0; n < 10 && !finish; n++) await new Promise(resolve => setImmediate(resolve));
  assert.ok(finish);
  const settings = (await f.message({ type: "settings:save", patch: { acceptEnabled: true } })).settings;
  const claim = await f.message({ type: "claim", kind: "accept", token: "fast-match", settingsKey: f.K.settingsKey(settings) });
  assert.equal(claim.ok, true);
  finish({ ok: true });
  assert.equal((await slow).ok, true);
});
