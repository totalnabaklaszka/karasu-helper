"use strict";
const fs = require("node:fs");
const vm = require("node:vm");
(async () => {
  const sandbox = {};
  vm.runInNewContext(fs.readFileSync("extension/market.js", "utf8"), sandbox);
  const M = sandbox.KarasuMarket;
  const response = await fetch(M.URL, { headers: { "Accept-Encoding": "br" }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error("Price source HTTP " + response.status);
  const snapshot = M.build(await response.json());
  fs.mkdirSync("extension/data", { recursive: true });
  fs.writeFileSync("extension/data/prices.json", JSON.stringify(snapshot));
  console.log(JSON.stringify({ source: snapshot.source, currency: snapshot.currency, finishes: Object.keys(snapshot.prices).length, updatedAt: new Date(snapshot.updatedAt).toISOString() }));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
