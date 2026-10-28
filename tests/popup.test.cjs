"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { randomUUID } = require("node:crypto");
const { parseHTML } = require("linkedom");
const version = JSON.parse(fs.readFileSync("extension/manifest.json", "utf8")).version;
const settle = () => new Promise(resolve => setImmediate(resolve));

function popup({ installed = version, workerVersion = version, supported = true, status, storage = { values: {}, listeners: [] } } = {}) {
  const { document, window } = parseHTML('<!doctype html><html><body><main id="app"></main></body></html>');
  const messages = [];
  const chrome = {
    runtime: {
      getManifest() { return { version: installed }; },
      async sendMessage(message) {
        messages.push(message);
        if (message.type === "dashboard") return { ok: true, version: workerVersion, capabilities: supported ? { skins: true } : undefined, settings: storage.values.settings || {}, history: [], status };
        if (message.type === "settings:save") {
          storage.values.settings = { ...storage.values.settings, ...message.patch };
          return { ok: true, settings: storage.values.settings };
        }
        if (message.type === "skins:request") {
          const data = { weapons: [{ name: "M4A1-S", model: "m4a1_silencer" }], inventory: [], loadout: [], skinBase: "/apps/inventory", personal: false };
          const item = { id: 1, name: "M4A1-S | Hot Rod", model: "m4a1_silencer", type: "weapon", teams: ["CT"] };
          return message.request.action?.catalogWeapon ? { ok: true, items: [item], tabId: 1 } : { ok: true, data, tabId: 1 };
        }
        throw new Error("Unexpected message: " + message.type);
      }
    },
    storage: {
      local: {
        async get(query) { return { ...query, ...storage.values }; },
        async set(patch) {
          const changes = {};
          for (const [key, value] of Object.entries(patch)) {
            changes[key] = { oldValue: storage.values[key], newValue: value };
            storage.values[key] = value;
          }
          for (const listener of storage.listeners) listener(changes, "local");
        }
      },
      onChanged: { addListener(fn) { storage.listeners.push(fn); } }
    }
  };
  const context = vm.createContext({ chrome, document, window, crypto: { randomUUID }, Date, URL, setInterval() {} });
  for (const file of ["appearance.js", "common.js", "skins.js", "skins-panel.js", "panel.js", "popup.js"]) vm.runInContext(fs.readFileSync("extension/" + file, "utf8"), context);
  return { document, window, messages };
}

test("a popup with matching worker capabilities loads the catalog through the real popup controller", async () => {
  const f = popup();
  await settle();
  f.document.querySelector('[data-tab="skins"]').click();
  await settle();
  assert.equal(f.document.querySelectorAll(".ka-skin-result").length, 1);
  assert.equal(f.document.querySelector(".ka-skin-controls").disabled, false);
  assert.equal(f.messages.filter(message => message.type === "skins:request").length, 2);
});

test("new popup files with an old installed manifest request an extension reload before skin messaging", async () => {
  const f = popup({ installed: "1.0.0" });
  f.document.querySelector('[data-tab="skins"]').click();
  await settle();
  assert.match(f.document.querySelector(".ka-status").textContent, /Reload Karasu Helper/);
  assert.match(f.document.querySelector(".ka-skins-status").textContent, /Reload Karasu Helper/);
  assert.equal(f.messages.some(message => message.type === "skins:request"), false);
});

test("a stale worker without skin support is detected instead of surfacing a misleading origin error", async () => {
  for (const worker of [{ workerVersion: "1.0.0", supported: false }, { workerVersion: "1.1.1", supported: true }]) {
    const f = popup(worker);
    await settle();
    f.document.querySelector('[data-tab="skins"]').click();
    await settle();
    assert.match(f.document.querySelector(".ka-skins-status").textContent, /Extensions page/);
    assert.equal(f.messages.some(message => message.type === "skins:request"), false);
  }
});

test("theme choice persists when reopening, synchronizes panels, and leaves match settings intact", async () => {
  const settings = { acceptEnabled: true, acceptDelay: 7, mapOrder: ["cache", "mirage"], locationsEnabled: true };
  const storage = { values: { settings: { ...settings } }, listeners: [] };
  const f = popup({ storage });
  await settle();
  f.document.querySelector('[data-theme-choice="light"]').click();
  await settle();
  assert.equal(f.document.documentElement.dataset.theme, "light");
  assert.equal(storage.values.theme, "light");
  assert.deepEqual(storage.values.settings, settings);
  const reopened = popup({ storage });
  await settle();
  assert.equal(reopened.document.documentElement.dataset.theme, "light");
  assert.equal(reopened.document.querySelector('[data-theme-choice="light"]').getAttribute("aria-pressed"), "true");
  reopened.document.querySelector('[data-theme-choice="dark"]').click();
  await settle();
  assert.equal(f.document.documentElement.dataset.theme, "dark");
  assert.equal(reopened.document.documentElement.dataset.theme, "dark");
  assert.equal(storage.values.theme, "dark");
  assert.deepEqual(storage.values.settings, settings);
  assert.equal([...f.messages, ...reopened.messages].some(message => message.type === "settings:save" || message.type === "claim"), false);
});

test("routine waiting text is hidden, attribution survives saving, and reload errors stay visible", async () => {
  const f = popup({ status: { text: "Waiting for a match or your turn.", level: "active" } });
  await settle();
  assert.equal(f.document.querySelector(".ka-status").hidden, true);
  assert.equal(f.document.querySelector(".ka-status span").textContent, "");
  assert.equal(f.document.querySelector(".ka-credit").textContent, "made by : totalnabaklaszka");
  const toggle = f.document.querySelector('[data-toggle="acceptEnabled"] input');
  toggle.checked = true;
  toggle.dispatchEvent(new f.window.Event("change"));
  await settle();
  assert.equal(f.document.querySelector(".ka-credit").textContent, "made by : totalnabaklaszka");
  assert.doesNotMatch(f.document.body.textContent, /Saved on this device/);
  assert.equal(f.document.querySelector(".ka-background-note"), null);
  assert.doesNotMatch(f.document.body.textContent, /Background assist ready|Keep Karasu open/);
  const stale = popup({ installed: "1.0.0" });
  await settle();
  assert.equal(stale.document.querySelector(".ka-status").hidden, false);
  assert.match(stale.document.querySelector(".ka-status span").textContent, /Reload Karasu Helper/);
});

test("FACEIT visibility and rank style persist separately from automation and synchronize panels", async () => {
  const settings = { acceptEnabled: true, acceptDelay: 7 };
  const storage = { values: { settings: { ...settings }, faceitRanksEnabled: false }, listeners: [] };
  const f = popup({ storage });
  await settle();
  const input = f.document.querySelector("[data-faceit-enabled]");
  assert.equal(input.checked, false);
  input.checked = true; input.dispatchEvent(new f.window.Event("change")); await settle();
  assert.equal(storage.values.faceitRanksEnabled, true);
  assert.deepEqual(storage.values.settings, settings);
  const second = popup({ storage }); await settle();
  assert.equal(second.document.querySelector("[data-faceit-enabled]").checked, true);
  const styles = f.document.querySelector("[data-faceit-style]");
  for (const option of styles.querySelectorAll("option")) option.selected = option.value === "minimal";
  styles.dispatchEvent(new f.window.Event("change")); await settle();
  assert.equal(storage.values.faceitRankStyle, "minimal");
  assert.equal(second.document.querySelector("[data-faceit-style]").value, "minimal");
  const reopened = popup({ storage }); await settle();
  assert.equal(reopened.document.querySelector("[data-faceit-style]").value, "minimal");
  assert.deepEqual(storage.values.settings, settings);
  const other = second.document.querySelector("[data-faceit-enabled]");
  other.checked = false; other.dispatchEvent(new second.window.Event("change")); await settle();
  assert.equal(input.checked, false);
  assert.equal(styles.disabled, true);
  assert.equal(f.messages.some(message => message.type === "settings:save" || message.type === "claim"), false);
});

test("Auto-copy connect is opt-in and persists without changing match settings", async () => {
  const settings = { acceptEnabled: true, acceptDelay: 7 };
  const storage = { values: { settings: { ...settings } }, listeners: [] };
  const f = popup({ storage }); await settle();
  const input = f.document.querySelector("[data-auto-copy-connect]");
  assert.equal(input.checked, false);
  input.checked = true; input.dispatchEvent(new f.window.Event("change")); await settle();
  const reopened = popup({ storage }); await settle();
  assert.equal(reopened.document.querySelector("[data-auto-copy-connect]").checked, true);
  assert.equal(storage.values.autoCopyConnect, true);
  assert.deepEqual(storage.values.settings, settings);
  assert.equal(f.messages.some(message => message.type === "settings:save" || message.type === "claim"), false);
});

test("Disable all also switches off automatic clipboard copying while keeping FACEIT display preferences", async () => {
  const storage = { values: { settings: { acceptEnabled: true, mapsEnabled: true, locationsEnabled: true }, autoCopyConnect: true, faceitRanksEnabled: true }, listeners: [] };
  const f = popup({ storage }); await settle();
  f.document.querySelector(".ka-stop").click(); await settle();
  assert.equal(storage.values.autoCopyConnect, false);
  assert.equal(storage.values.settings.acceptEnabled, false);
  assert.equal(storage.values.settings.mapsEnabled, false);
  assert.equal(storage.values.settings.locationsEnabled, false);
  assert.equal(storage.values.faceitRanksEnabled, true);
});
