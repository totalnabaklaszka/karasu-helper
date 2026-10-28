"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const sandbox = {};
vm.runInNewContext(fs.readFileSync("extension/common.js", "utf8"), sandbox);
const K = sandbox.KarasuAuto;
const plain = value => JSON.parse(JSON.stringify(value));
const available = [
  { id: "uuid-mirage", name: "de_mirage", label: "Mirage" },
  { id: "uuid-nuke", name: "de_nuke", label: "Nuke" },
  { id: "uuid-dust2", name: "de_dust2", label: "Dust2" }
];
const ready = () => ({ connected: true, ready: { token: "accept-1", canAccept: true, expiresAt: 50000 } });
const veto = kind => ({ connected: true, veto: { kind, token: "turn-1", canAct: true, available, deadline: 50000 } });

test("all features are off on first installation; delays match the requested controls", () => {
  assert.deepEqual(plain(K.normalizeSettings()), { acceptEnabled: false, acceptDelay: 3, mapsEnabled: false, locationsEnabled: false, vetoDelay: 2, mapOrder: [], locationOrder: [] });
});
test("settings reject string booleans, clamp seconds, deduplicate preferences", () => {
  const result = K.normalizeSettings({ acceptEnabled: "true", mapsEnabled: true, acceptDelay: 99, vetoDelay: -1, mapOrder: ["de_mirage", "Mirage", "Dust II", 4], locationOrder: ["Barcelona", "Madrid", "Düsseldorf"] });
  assert.equal(result.acceptEnabled, false);
  assert.equal(result.mapsEnabled, true);
  assert.equal(result.acceptDelay, 10);
  assert.equal(result.vetoDelay, 1);
  assert.deepEqual(plain(result.mapOrder), ["mirage", "dust2"]);
  assert.deepEqual(plain(result.locationOrder), ["madrid", "dusseldorf"]);
});
test("non-finite delays use defaults", () => {
  assert.equal(K.normalizeSettings({ acceptDelay: Infinity }).acceptDelay, 3);
  assert.equal(K.normalizeSettings({ vetoDelay: NaN }).vetoDelay, 2);
});

test("migration removes Vertigo and unsupported servers without losing saved priorities", () => {
  const settings = K.normalizeSettings({ mapOrder: ["de_vertigo", "nuke", "mirage"], locationOrder: ["frankfurt", "barcelona", "stockholm"] });
  assert.deepEqual(plain(settings.mapOrder), ["nuke", "mirage"]);
  assert.deepEqual(plain(settings.locationOrder), ["madrid", "stockholm"]);
  assert.equal(K.MAPS.length, 7);
  assert.deepEqual(plain(K.LOCATIONS.map(item => item.id)), ["madrid", "dusseldorf", "istanbul", "prague", "stockholm"]);
  assert.equal(K.chooseCandidate([{ id: "v", name: "de_vertigo" }, { id: "n", name: "de_nuke" }], [], "map").id, "n");
});
test("first listed available map is banned first, independent of the page card order", () => {
  assert.equal(K.chooseCandidate([...available].reverse(), ["nuke", "mirage"], "map").id, "uuid-nuke");
});
test("unavailable preferences are skipped and deterministic fallback follows the saved list", () => {
  assert.equal(K.chooseCandidate(available, ["anubis", "dust2"], "map").id, "uuid-dust2");
  assert.equal(K.chooseCandidate([...available].reverse(), ["anubis"], "map").id, "uuid-mirage");
});
test("Madrid display preference selects Karasu's barcelona server identifier", () => {
  const locations = [{ id: "dusseldorf", name: "dusseldorf", label: "Düsseldorf" }, { id: "barcelona", name: "barcelona", label: "Madrid" }];
  assert.equal(K.chooseCandidate(locations, ["madrid"], "location").id, "barcelona");
});
test("unlisted maps fall back alphabetically after the catalog", () => {
  assert.equal(K.chooseCandidate([{ id: "z", name: "de_zeta" }, { id: "a", name: "de_alpha" }], [], "map").id, "a");
});
test("last remaining option is never banned", () => {
  assert.equal(K.chooseCandidate([available[0]], [], "map"), null);
  assert.equal(K.chooseCandidate([], [], "location"), null);
});
test("acceptance requires an enabled feature, connected adapter and unexpired ready state", () => {
  assert.equal(K.makePlan(ready(), {}, 1000), null);
  assert.equal(K.makePlan({ ...ready(), connected: false }, { acceptEnabled: true }, 1000), null);
  assert.equal(K.makePlan(ready(), { acceptEnabled: true }, 50000), null);
  assert.equal(K.makePlan(ready(), { acceptEnabled: true }, 1000).kind, "accept");
});
test("map and location switches are independent", () => {
  assert.equal(K.makePlan(veto("map"), { locationsEnabled: true }, 1000), null);
  assert.equal(K.makePlan(veto("location"), { mapsEnabled: true }, 1000), null);
  assert.equal(K.makePlan(veto("map"), { mapsEnabled: true }, 1000).targetId, "uuid-mirage");
});
test("opponent's turn, expired veto and manual selection cancel automation", () => {
  for (const change of [{ canAct: false }, { deadline: 900 }, { selectedId: "uuid-nuke" }]) {
    const snapshot = veto("map");
    Object.assign(snapshot.veto, change);
    assert.equal(K.makePlan(snapshot, { mapsEnabled: true }, 1000), null);
  }
});
test("map picks and side choices are never handled as bans", () => {
  assert.equal(K.makePlan(veto("pick"), { mapsEnabled: true, locationsEnabled: true }, 1000), null);
  assert.equal(K.makePlan(veto("side"), { mapsEnabled: true }, 1000), null);
});
test("countdown respects full delay and issues a single action", () => {
  const timer = new K.Countdown();
  const settings = { acceptEnabled: true, acceptDelay: 3 };
  const plan = K.makePlan(ready(), settings, 1000);
  assert.equal(timer.update(plan, settings, 1000).remaining, 3000);
  assert.equal(timer.update(plan, settings, 3999).execute, undefined);
  assert.equal(timer.update(plan, settings, 4000).execute, true);
  assert.equal(timer.update(plan, settings, 4500).execute, undefined);
});
test("disabling during countdown cancels an otherwise due accept", () => {
  const timer = new K.Countdown();
  const on = { acceptEnabled: true };
  timer.update(K.makePlan(ready(), on, 1000), on, 1000);
  assert.equal(timer.update(K.makePlan(ready(), {}, 4000), {}, 4000), null);
  assert.equal(timer.update(K.makePlan(ready(), on, 4100), on, 4100).remaining, 3000);
});
test("a new turn or preference edit restarts the countdown", () => {
  const timer = new K.Countdown();
  const settings = { mapsEnabled: true, mapOrder: ["nuke"] };
  const plan = K.makePlan(veto("map"), settings, 1000);
  timer.update(plan, settings, 1000);
  assert.equal(timer.update({ ...plan, token: "turn-2" }, settings, 2900).remaining, 2000);
  assert.equal(timer.update({ ...plan, token: "turn-2" }, { ...settings, mapOrder: ["mirage"] }, 4800).remaining, 2000);
});
test("insufficient deadline never silently shortens the chosen delay", () => {
  const timer = new K.Countdown();
  const settings = { acceptEnabled: true, acceptDelay: 3 };
  const plan = { ...K.makePlan(ready(), settings, 1000), expiresAt: 3500 };
  assert.equal(timer.update(plan, settings, 1000).blocked, true);
  assert.equal(timer.update(plan, settings, 3400).execute, undefined);
});
