"use strict";
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const base = path.resolve("extension");
const manifest = JSON.parse(fs.readFileSync(path.join(base, "manifest.json"), "utf8"));
assert.equal(manifest.manifest_version, 3);
assert.ok(typeof manifest.description === "string" && manifest.description.length <= 132, "Manifest description exceeds 132 characters");
const shared = {};
vm.runInNewContext(fs.readFileSync(path.join(base, "common.js"), "utf8"), shared);
assert.equal(shared.KarasuAuto.VERSION, manifest.version, "Popup and manifest versions differ");
assert.equal(JSON.parse(fs.readFileSync("package.json", "utf8")).version, manifest.version, "Package and manifest versions differ");
assert.deepEqual(manifest.permissions, ["storage", "offscreen", "clipboardWrite"]);
assert.equal(manifest.host_permissions, undefined);
assert.deepEqual(manifest.optional_host_permissions, ["https://api.skinport.com/*"]);
function exists(file) {
  const absolute = path.resolve(base, file);
  assert.ok(absolute.startsWith(base + path.sep), "Asset outside extension: " + file);
  assert.ok(fs.existsSync(absolute), "Missing asset: " + file);
}
for (const script of manifest.content_scripts) {
  assert.deepEqual(script.matches, ["https://karasu.live/*"]);
  for (const file of script.js) exists(file);
  for (const file of script.css || []) exists(file);
}
for (const file of [manifest.action.default_popup, manifest.options_ui.page, manifest.background.service_worker, ...Object.values(manifest.icons)]) exists(file);
exists("fonts/SpaceGrotesk.ttf");
exists("fonts/OFL.txt");
exists("clipboard.html");
exists("clipboard.js");
exists("branding/mark.svg");
exists("data/prices.json");
const marketContext = {};
vm.runInNewContext(fs.readFileSync(path.join(base, "market.js"), "utf8"), marketContext);
assert.equal(marketContext.KarasuMarket.URL, "https://api.skinport.com/v1/items?app_id=730&currency=USD&tradable=0");
assert.ok(marketContext.KarasuMarket.validate(JSON.parse(fs.readFileSync(path.join(base, "data/prices.json"), "utf8"))), "Invalid bundled market snapshot");
for (const resource of manifest.web_accessible_resources || []) for (const file of resource.resources) exists(file);
for (const file of fs.readdirSync(base)) {
  if (file.endsWith(".js")) {
    const code = fs.readFileSync(path.join(base, file), "utf8");
    new vm.Script(code, { filename: file });
    assert.ok(!/\beval\s*\(|new\s+Function\s*\(/.test(code), "Unexpected remote code: " + file);
    if (file === "market-loader.js") {
      assert.equal((code.match(/\bfetch\s*\(/g) || []).length, 2);
      assert.ok(code.includes('fetch(chrome.runtime.getURL("data/prices.json"))'));
      assert.ok(code.includes('fetch(M.URL, { credentials: "omit"'));
      assert.ok(code.includes('chrome.permissions.request({ origins: [M.ORIGIN] })'));
    } else if (file !== "skins-adapter.js") assert.ok(!/\bfetch\s*\(/.test(code), "Unexpected network access: " + file);
    else {
      assert.equal((code.match(/\bfetch\s*\(/g) || []).length, 1);
      assert.ok(code.includes('const API = "https://inventory.karasu.live/api";'));
      assert.ok(code.includes('fetch(API + path,'));
      assert.ok(code.includes('request("/inventory/craft", payload, deadline)'));
      assert.ok(!/method:\s*"(?:DELETE|PATCH)"/.test(code), "Unexpected inventory mutation");
    }
  }
  if (file.endsWith(".html")) {
    const html = fs.readFileSync(path.join(base, file), "utf8");
    for (const asset of html.matchAll(/(?:src|href)="([^"]+)"/g)) exists(asset[1]);
    assert.ok(!/\son[a-z]+\s*=/.test(html), "Inline script handler: " + file);
  }
}
console.log("Manifest MV3, permissions, JS syntax and extension assets: OK.");

