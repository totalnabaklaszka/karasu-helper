"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

class CustomEvent extends Event {
  constructor(type, options = {}) { super(type); this.detail = options.detail; }
}
function fixture(kind = "map") {
  const events = new EventTarget();
  const calls = [];
  const fields = {};
  const match = {
    id: "match-1", status: "Veto", is_captain: true, is_in_lineup: true,
    lineup_1: { id: "lineup-1", is_on_lineup: true, can_pick_map_veto: true, can_pick_location_veto: true },
    lineup_2: { id: "lineup-2", is_on_lineup: false, can_pick_map_veto: false, can_pick_location_veto: false },
    map_veto_picking_lineup_id: "lineup-1", location_veto_picking_lineup_id: "lineup-1",
    region: "Europe", server_location: kind === "location" ? null : "prague",
    options: { location_veto: true, region_veto: false, best_of: 1, veto_pick_timeout: 30 },
    match_maps: [], veto_pick_expires_at: new Date(Date.now() + 60000).toISOString()
  };
  const proxy = {
    match, isPicking: true, submitting: false, picks: [], pickType: "Ban", isLocationVeto: true, isBanning: kind === "location",
    availableLocations: ["barcelona", "prague", "dusseldorf"],
    mapPool: [{ id: "map-mirage", name: "de_mirage" }, { id: "map-nuke", name: "de_nuke" }, { id: "map-ancient", name: "de_ancient" }],
    form: { values: fields, setFieldValue(field, value) { fields[field] = value; calls.push(["select", field, value]); } },
    async vetoPick() { calls.push(["veto", { ...fields }]); proxy.submitting = true; }
  };
  const confirmation = { confirmationId: "confirmation-1", isReady: false, expiresAt: new Date(Date.now() + 60000).toISOString() };
  const readyProxy = { confirmation, shouldShow: true, ready() { calls.push(["ready", confirmation.confirmationId]); } };
  const element = { nodeType: 1, isConnected: true, attributes: new Set(), hasAttribute(name) { return this.attributes.has(name); }, setAttribute(name) { this.attributes.add(name); } };
  const component = { type: { __name: kind === "location" ? "MatchLocationVeto" : "MatchMapVeto" }, proxy, subTree: { el: element } };
  const readyComponent = { type: { __name: "MatchmakingConfirm" }, proxy: readyProxy, subTree: {} };
  const queueComponent = { type: { __name: "KarasuQueue" }, proxy: {}, subTree: { el: element } };
  const root = { children: [{ component }, { component: readyComponent }, { component: queueComponent }] };
  const container = { __vue_app__: { _container: { _vnode: root } } };
  const document = {
    getElementById(name) { return name === "__nuxt" ? container : null; },
    addEventListener: events.addEventListener.bind(events), dispatchEvent: events.dispatchEvent.bind(events)
  };
  const sandbox = { document, CustomEvent, Date, Set, Map };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync("extension/common.js", "utf8"), sandbox);
  vm.runInContext(fs.readFileSync("extension/page-adapter.js", "utf8"), sandbox);
  const K = sandbox.KarasuAuto;
  let sequence = 0;
  async function request(type, action) {
    const requestId = String(++sequence);
    return new Promise(resolve => {
      function response(event) {
        const result = JSON.parse(event.detail);
        if (result.id === requestId) { events.removeEventListener(K.RESPONSE, response); resolve(result); }
      }
      events.addEventListener(K.RESPONSE, response);
      events.dispatchEvent(new CustomEvent(K.REQUEST, { detail: JSON.stringify({ id: requestId, type, action }) }));
    });
  }
  async function snapshot() { return (await request("snapshot")).snapshot; }
  return { match, proxy, readyProxy, confirmation, component, readyComponent, root, container, fields, calls, element, snapshot, request };
}

test("adapter finds Nuxt production component tree, including the Queue anchor", async () => {
  const f = fixture();
  const s = await f.snapshot();
  assert.equal(s.connected, true);
  assert.equal(s.queue, true);
  assert.equal(f.element.hasAttribute("data-karasu-auto-queue"), true);
  assert.equal(s.veto.kind, "map");
  assert.equal(s.veto.canAct, true);
});

test("ready connection is exposed only for a participating player and an available match server", async () => {
  const f = fixture();
  f.component.isUnmounted = true;
  Object.assign(f.match, { status: "Live", is_match_server_available: true, connection_string: "152.233.60.2:26198" });
  f.root.children.push({ component: { type: { __name: "index" }, proxy: { match: f.match }, subTree: {} } });
  assert.deepEqual((await f.snapshot()).connection, { matchId: "match-1", command: "connect 152.233.60.2:26198" });
  f.match.is_in_lineup = false;
  assert.equal((await f.snapshot()).connection, null);
  f.match.is_in_lineup = true; f.match.status = "Finished";
  assert.equal((await f.snapshot()).connection, null);
  f.match.status = "Live"; f.match.is_match_server_available = false;
  assert.equal((await f.snapshot()).connection, null);
  f.match.is_match_server_available = true; f.match.connection_string += ";quit";
  assert.equal((await f.snapshot()).connection, null);
  assert.equal(f.calls.length, 0);
});
test("ready action uses current confirmation and is sent only once", async () => {
  const f = fixture();
  const s = await f.snapshot();
  const action = { kind: "accept", token: s.ready.token };
  assert.equal((await f.request("act", action)).ok, true);
  assert.equal((await f.request("act", action)).reason, "duplicate");
  assert.deepEqual(f.calls, [["ready", "confirmation-1"]]);
});
test("already accepted, closed, expired and replaced confirmations are refused", async () => {
  for (const change of ["accepted", "closed", "expired", "replaced"]) {
    const f = fixture();
    const s = await f.snapshot();
    if (change === "accepted") f.confirmation.isReady = true;
    if (change === "closed") f.readyProxy.shouldShow = false;
    if (change === "expired") f.confirmation.expiresAt = "2000-01-01T00:00:00Z";
    if (change === "replaced") f.confirmation.confirmationId = "another-confirmation";
    assert.equal((await f.request("act", { kind: "accept", token: s.ready.token })).ok, false, change);
    assert.equal(f.calls.length, 0);
  }
});
test("map action sets the selected map, clears side and calls the existing confirmation action", async () => {
  const f = fixture();
  const s = await f.snapshot();
  const result = await f.request("act", { kind: "map", token: s.veto.token, targetId: "map-nuke" });
  assert.equal(result.ok, true);
  assert.deepEqual(f.calls, [["select", "side", undefined], ["select", "map_id", "map-nuke"], ["veto", { side: undefined, map_id: "map-nuke" }]]);
});
test("location action preserves Karasu's internal identifier for Madrid", async () => {
  const f = fixture("location");
  const s = await f.snapshot();
  assert.equal(s.veto.available.find(item => item.id === "barcelona").label, "Madrid");
  assert.equal((await f.request("act", { kind: "location", token: s.veto.token, targetId: "barcelona" })).ok, true);
  assert.equal(f.fields.location, "barcelona");
  assert.equal(f.calls.filter(call => call[0] === "veto").length, 1);
});
test("server permissions are checked again after the countdown, even when the visible banner is active", async () => {
  const f = fixture();
  const s = await f.snapshot();
  f.match.lineup_1.can_pick_map_veto = false;
  f.proxy.isPicking = true;
  assert.equal((await f.request("act", { kind: "map", token: s.veto.token, targetId: "map-nuke" })).reason, "stale");
  assert.equal(f.calls.length, 0);
});
test("spectators, non-captains, organizer overrides and the wrong picking lineup cannot ban", async () => {
  for (const change of ["spectator", "non-captain", "organizer", "wrong-lineup"]) {
    const f = fixture();
    if (change === "spectator") f.match.is_in_lineup = false;
    if (change === "non-captain") f.match.is_captain = false;
    if (change === "organizer") { f.match.is_organizer = true; f.match.lineup_1.can_pick_map_veto = false; }
    if (change === "wrong-lineup") f.match.map_veto_picking_lineup_id = "lineup-2";
    assert.equal((await f.snapshot()).veto.canAct, false, change);
  }
});
test("a manual selection made during the countdown is preserved", async () => {
  const f = fixture("location");
  const s = await f.snapshot();
  f.fields.location = "prague";
  assert.equal((await f.request("act", { kind: "location", token: s.veto.token, targetId: "barcelona" })).ok, false);
  assert.equal(f.fields.location, "prague");
  assert.equal(f.calls.length, 0);
});
test("previous bans are excluded; a stale token cannot ban a different card", async () => {
  const f = fixture();
  const s = await f.snapshot();
  f.proxy.picks.push({ map: { id: "map-mirage" } });
  const updated = await f.snapshot();
  assert.equal(updated.veto.available.some(item => item.id === "map-mirage"), false);
  assert.notEqual(s.veto.token, updated.veto.token);
  assert.equal((await f.request("act", { kind: "map", token: s.veto.token, targetId: "map-nuke" })).ok, false);
  assert.equal(f.calls.length, 0);
});
test("BAN does not execute during PICK, SIDE, Live or after veto is complete", async () => {
  for (const change of ["Pick", "Side", "Live", "finished", "server-pending"]) {
    const f = fixture();
    if (change === "Pick" || change === "Side") f.proxy.pickType = change;
    if (change === "Live") f.match.status = "Live";
    if (change === "finished") f.match.match_maps.push({ id: "result-map" });
    if (change === "server-pending") f.match.server_location = null;
    assert.equal((await f.snapshot()).veto, null, change);
  }
});
test("submitting state, invalid deadline and last remaining card block actions", async () => {
  for (const change of ["submitting", "deadline", "last"]) {
    const f = fixture();
    if (change === "submitting") f.proxy.submitting = true;
    if (change === "deadline") f.match.veto_pick_expires_at = "invalid-date";
    if (change === "last") f.proxy.picks = [{ map: { id: "map-mirage" } }, { map: { id: "map-ancient" } }];
    const s = await f.snapshot();
    assert.equal((await f.request("act", { kind: "map", token: s.veto.token, targetId: "map-nuke" })).ok, false, change);
    assert.equal(f.calls.length, 0);
  }
});
test("deadline extensions and reordered location history do not create another action token", async () => {
  const f = fixture("location");
  f.proxy.picks = [{ location: "milan" }, { location: "warsaw" }];
  const s = await f.snapshot();
  f.proxy.picks.reverse();
  f.match.veto_pick_expires_at = new Date(Date.now() + 120000).toISOString();
  assert.equal((await f.snapshot()).veto.token, s.veto.token);
});
test("active suspense branches are traversed and cached deactivated components are ignored", async () => {
  const f = fixture();
  f.root.suspense = { activeBranch: { component: f.component } };
  f.root.children = [{ component: f.readyComponent }];
  assert.equal((await f.snapshot()).veto.kind, "map");
  f.component.isDeactivated = true;
  assert.equal((await f.snapshot()).veto, null);
});
test("missing app and components fail closed without guessing buttons", async () => {
  const f = fixture();
  f.root.children = [];
  let s = await f.snapshot();
  assert.equal(s.veto, null);
  assert.equal(s.ready, null);
  f.container.__vue_app__ = null;
  s = await f.snapshot();
  assert.equal(s.connected, false);
  assert.equal(f.calls.length, 0);
});
