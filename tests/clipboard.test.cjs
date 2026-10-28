"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { randomUUID } = require("node:crypto");
const read = file => fs.readFileSync("extension/" + file, "utf8");
const clone = value => JSON.parse(JSON.stringify(value));
const matchId = "99c2ea5a-de47-4986-b7f3-7e13fcc82373";
const command = "connect 152.233.60.2:26198";
const source = (tabId = 1) => ({ id: "test", url: `https://karasu.live/matches/${matchId}`, tab: { id: tabId } });

function worker({ state = { local: {}, session: {} }, verified = true, copyOk = true, interrupted = false, existing = false, olderChrome = false, deferCopy = false } = {}) {
  let listener;
  let finish;
  const writes = [];
  const documents = [];
  const area = name => ({
    async get(query) { return clone(typeof query === "string" ? { [query]: state[name][query] } : { ...query, ...state[name] }); },
    async set(value) { Object.assign(state[name], clone(value)); }
  });
  const chrome = {
    storage: { local: area("local"), session: area("session") },
    tabs: { async query() { return [{ id: 1 }]; }, async sendMessage(id, message) { assert.equal(message.type, "connect:verify"); return { ok: verified }; } },
    offscreen: { async createDocument(details) { documents.push(details); }, async closeDocument() { documents.push("closed"); } },
    runtime: {
      id: "test", getURL: path => "chrome-extension://test/" + path,
      onMessage: { addListener(fn) { listener = fn; } }, onInstalled: { addListener() {} },
      async sendMessage(message) {
        assert.equal(message.target, "clipboard"); assert.equal(message.type, "clipboard:write");
        writes.push(message.command);
        if (interrupted) throw new Error("port closed after submission");
        if (deferCopy) return new Promise(resolve => { finish = resolve; });
        return { ok: copyOk };
      }
    }
  };
  if (!olderChrome) chrome.runtime.getContexts = async () => existing ? [{}] : [];
  const context = vm.createContext({ chrome, URL, Date, crypto: { randomUUID }, clients: { async matchAll() { return existing ? [{ url: chrome.runtime.getURL("clipboard.html") }] : []; } } });
  context.importScripts = file => vm.runInContext(read(file), context);
  vm.runInContext(read("background.js"), context);
  const send = (message, sender = source()) => new Promise(resolve => listener(message, sender, result => resolve(clone(result))));
  const copy = (value = command, sender = source()) => send({ type: "connect:copy", matchId, command: value }, sender);
  return { state, writes, documents, send, copy, K: context.KarasuAuto, finish: () => finish?.({ ok: true }) };
}

test("connection validation accepts only a single IPv4 connect command", () => {
  const f = worker();
  assert.equal(f.K.connectCommand("152.233.60.2:26198"), command);
  assert.equal(f.K.connectCommand(command), command);
  for (const value of ["connect 256.1.1.1:27015", "connect 1.1.1.1:0", "connect 1.1.1.1:65536", command + "; quit", command + "\nquit", "steam://run/730", "echo hacked", null]) assert.equal(f.K.connectCommand(value), null);
});

test("auto-copy defaults to off and does not create a clipboard document", async () => {
  const f = worker();
  assert.equal((await f.copy()).reason, "disabled");
  assert.deepEqual(f.writes, []); assert.deepEqual(f.documents, []);
});

test("same address is copied once across tabs, then copied again whenever the address changes", async () => {
  const f = worker({ state: { local: { autoCopyConnect: true }, session: {} } });
  const results = await Promise.all([f.copy(), f.copy(command, source(2))]);
  assert.equal(results.filter(result => result.duplicate).length, 1);
  assert.deepEqual(f.writes, [command]);
  const changed = "connect 152.233.60.2:26200";
  assert.equal((await f.copy(changed)).ok, true);
  assert.equal((await f.copy(command)).ok, true);
  assert.deepEqual(f.writes, [command, changed, command]);
  assert.equal(f.state.session.history.length, 3);
  const restarted = worker({ state: f.state });
  assert.equal((await restarted.copy()).duplicate, true);
  assert.deepEqual(restarted.writes, []);
});

test("unrelated origins, wrong match URLs, stale servers and injected commands cannot write", async () => {
  const f = worker({ state: { local: { autoCopyConnect: true }, session: {} } });
  assert.equal((await f.copy(command, { id: "test", url: "https://example.com/", tab: { id: 1 } })).reason, "origin");
  assert.equal((await f.copy(command, { ...source(), url: "https://karasu.live/play" })).reason, "invalid");
  assert.equal((await f.copy(command + "; quit")).reason, "invalid");
  assert.deepEqual(f.writes, []);
  const stale = worker({ state: f.state, verified: false });
  assert.equal((await stale.copy()).reason, "stale");
  assert.deepEqual(stale.documents, []);
});

test("unconfirmed clipboard submissions are not automatically repeated or logged as successful", async () => {
  const f = worker({ state: { local: { autoCopyConnect: true }, session: {} }, interrupted: true });
  assert.equal((await f.copy()).uncertain, true);
  assert.equal((await f.copy()).duplicate, true);
  assert.deepEqual(f.writes, [command]);
  assert.equal(f.state.session.history, undefined);
  assert.equal(f.documents.at(-1), "closed");
});

test("known clipboard failures report failure and do not claim the command was copied", async () => {
  const f = worker({ state: { local: { autoCopyConnect: true }, session: {} }, copyOk: false });
  assert.equal((await f.copy()).reason, "clipboard-failed");
  assert.equal(f.state.session.connectionCopies[matchId], undefined);
  assert.equal(f.state.session.history, undefined);
});

test("Chrome 111 fallback reuses the clipboard document without opening another", async () => {
  const f = worker({ state: { local: { autoCopyConnect: true }, session: {} }, olderChrome: true, existing: true });
  assert.equal((await f.copy()).ok, true);
  assert.deepEqual(f.documents, ["closed"]);
});

test("clipboard work does not block a match acceptance claim", { timeout: 2000 }, async () => {
  const f = worker({ state: { local: { autoCopyConnect: true }, session: {} }, deferCopy: true });
  const pending = f.copy();
  for (let n = 0; n < 10 && !f.writes.length; n++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.writes.length, 1);
  const saved = await f.send({ type: "settings:save", patch: { acceptEnabled: true } });
  const claim = await f.send({ type: "claim", kind: "accept", token: "match-confirmation", settingsKey: f.K.settingsKey(saved.settings) });
  assert.equal(claim.ok, true);
  f.finish();
  assert.equal((await pending).ok, true);
});

test("offscreen writer validates sender and command and clears its temporary field", () => {
  let listener;
  const writes = [];
  const field = { value: "", select() {} };
  const chrome = { runtime: { id: "test", onMessage: { addListener(fn) { listener = fn; } } } };
  const document = { getElementById: () => field, execCommand(type) { assert.equal(type, "copy"); writes.push(field.value); return true; } };
  const context = vm.createContext({ chrome, document });
  for (const file of ["common.js", "clipboard.js"]) vm.runInContext(read(file), context);
  function send(value, sender) { let result; listener({ target: "clipboard", type: "clipboard:write", command: value }, sender, next => { result = next; }); return result; }
  assert.equal(send(command, { id: "test", tab: { id: 1 } }).reason, "origin");
  assert.equal(send(command + ";quit", { id: "test" }).reason, "invalid");
  assert.equal(send(command, { id: "test" }).ok, true);
  assert.deepEqual(writes, [command]);
  assert.equal(field.value, "");
});
