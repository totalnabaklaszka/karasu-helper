"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { parseHTML } = require("linkedom");

function scoreboard() {
  const { document, window } = parseHTML('<!doctype html><html><body><div id="__nuxt"><table><tbody></tbody></table></div></body></html>');
  const timers = [];
  const surface = { location: { pathname: "/matches/4a28952f-cbef-4ca2-b525-ac7f994da91b" }, addEventListener() {} };
  const root = { children: [] };
  document.getElementById("__nuxt").__vue_app__ = { _container: { _vnode: root } };
  let networkCalls = 0;
  const context = vm.createContext({ document, window: surface, URL, CustomEvent: window.CustomEvent,
    setInterval(fn) { timers.push(fn); return timers.length; }, clearInterval() {},
    fetch() { networkCalls++; throw new Error("FACEIT badges must not make API calls"); }
  });
  for (const file of ["common.js", "faceit.js"]) vm.runInContext(fs.readFileSync("extension/" + file, "utf8"), context);
  function add({ steamId = "76561198296741282", player = {}, native = false, deactivated = false } = {}) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    const elo = document.createElement("button"); elo.type = "button"; elo.textContent = "615";
    td.append(elo); tr.append(td); document.querySelector("tbody").append(tr);
    const member = { steam_id: steamId, player: { steam_id: steamId, name: "Test player", faceit_skill_level: 8, faceit_elo: 1664, faceit_url: "https://www.faceit.com/en/players/ThenightXD", ...player } };
    const eloNode = { component: { type: { __name: "PlayerElo" }, subTree: { el: document.createComment("fragment"), children: [{ type: "button", el: elo }] } } };
    const children = [eloNode];
    if (native) children.push({ component: { type: { __name: "PlayerFaceitRank" }, subTree: { el: document.createElement("a") } } });
    const component = { type: { __name: "LineupOverviewRow" }, props: { member }, isDeactivated: deactivated, subTree: { type: "tr", el: tr, children } };
    root.children.push({ component });
    return { tr, td, elo, member, component };
  }
  function enabled(value) { document.dispatchEvent(new window.CustomEvent(context.KarasuAuto.REQUEST, { detail: JSON.stringify({ type: "faceit:config", action: { enabled: value } }) })); }
  return { document, surface, root, add, enabled, tick: () => timers[0](), networkCalls: () => networkCalls };
}

test("FACEIT level and ELO appear beside the native ELO with a validated profile link", () => {
  const f = scoreboard();
  const row = f.add();
  f.enabled(true);
  const badge = f.document.querySelector(".ka-faceit-badge");
  assert.equal(row.elo.nextElementSibling, badge);
  assert.equal(row.elo.textContent, "615");
  assert.equal(badge.querySelector(".ka-faceit-level").textContent, "8");
  assert.equal(badge.querySelector(".ka-faceit-elo").textContent, "1664");
  assert.match(badge.title, /FACEIT CS2.*Level 8.*1664 ELO.*Stored on Karasu/);
  assert.equal(badge.href, "https://www.faceit.com/en/players/ThenightXD");
  assert.equal(badge.rel, "noopener noreferrer");
  let parentClicks = 0;
  row.td.addEventListener("click", () => parentClicks++);
  badge.click();
  assert.equal(parentClicks, 0);
  assert.equal(f.networkCalls(), 0);
});

test("badge updates follow Steam IDs through row reuse, sorting, and Vue rerendering", () => {
  const f = scoreboard();
  const first = f.add();
  const second = f.add({ steamId: "76561198000000001", player: { faceit_elo: 2400, faceit_skill_level: 10 } });
  f.enabled(true);
  f.tick(); f.tick();
  assert.equal(f.document.querySelectorAll(".ka-faceit-badge").length, 2);
  f.root.children.reverse();
  second.tr.before(first.tr);
  first.member.steam_id = "76561198000000002";
  first.member.player = { steam_id: first.member.steam_id, faceit_elo: 1900, faceit_skill_level: 9 };
  f.tick();
  const badge = first.elo.nextElementSibling;
  assert.equal(badge.dataset.steamId, first.member.steam_id);
  assert.equal(badge.querySelector(".ka-faceit-elo").textContent, "1900");
  badge.remove(); f.tick();
  assert.equal(f.document.querySelectorAll(".ka-faceit-badge").length, 2);
  assert.equal(first.elo.nextElementSibling.querySelector(".ka-faceit-elo").textContent, "1900");
});

test("missing or invalid data use a dash, and snapshot fallback is labelled", () => {
  const f = scoreboard();
  const missing = f.add({ player: { faceit_skill_level: null, faceit_elo: "invalid", faceit_url: "javascript:alert(1)" } });
  const history = f.add({ steamId: "76561198000000001", player: { faceit_skill_level: null, faceit_elo: null, faceit_rank_history: [{ skill_level: 9, elo: 1788 }] } });
  f.enabled(true);
  assert.equal(missing.elo.nextElementSibling.querySelector(".ka-faceit-elo").textContent, "—");
  assert.equal(missing.elo.nextElementSibling.querySelector(".ka-faceit-level").hidden, true);
  assert.equal(missing.elo.nextElementSibling.hasAttribute("href"), false);
  assert.match(missing.elo.nextElementSibling.title, /unavailable/);
  assert.equal(history.elo.nextElementSibling.querySelector(".ka-faceit-elo").textContent, "1788");
  assert.match(history.elo.nextElementSibling.title, /At match start/);
});

test("existing native FACEIT, inactive rows and mismatched accounts are not annotated", () => {
  const f = scoreboard();
  f.add({ native: true });
  f.add({ deactivated: true });
  f.add({ player: { steam_id: "76561198000000009" } });
  f.add({ steamId: "not-a-steam-id" });
  f.enabled(true);
  assert.equal(f.document.querySelectorAll(".ka-faceit-badge").length, 0);
});

test("turning badges off or leaving the match removes them without changing native cells", () => {
  const f = scoreboard();
  const row = f.add();
  f.enabled(true); f.enabled(true);
  assert.equal(f.document.querySelectorAll(".ka-faceit-badge").length, 1);
  f.enabled(false);
  assert.equal(f.document.querySelectorAll(".ka-faceit-badge").length, 0);
  f.enabled(true);
  f.surface.location.pathname = "/apps/inventory"; f.tick();
  assert.equal(f.document.querySelectorAll(".ka-faceit-badge").length, 0);
  assert.equal(row.elo.textContent, "615");
  f.surface.location.pathname = "/matches/test"; f.tick();
  assert.equal(f.document.querySelectorAll(".ka-faceit-badge").length, 1);
  assert.equal(f.networkCalls(), 0);
});
