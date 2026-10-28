"use strict";
importScripts("common.js");
importScripts("background-assist.js");
const K = globalThis.KarasuAuto;
let work = Promise.resolve();
let skinsWork = Promise.resolve();
let clipboardWork = Promise.resolve();

function fromExtensionPage(sender) {
  if (sender.id && sender.id !== chrome.runtime.id) return false;
  const base = chrome.runtime.getURL("");
  if (sender.origin && sender.origin !== base.replace(/\/$/, "")) return false;
  // MessageSender.url is optional. Popup requests may only carry the extension
  // ID/origin; content-script requests also carry the website URL or a tab.
  if (sender.url) return sender.url.startsWith(base);
  if (sender.origin) return sender.origin === base.replace(/\/$/, "");
  return sender.id === chrome.runtime.id && !sender.tab && !sender.nativeApplication;
}

async function forwardSkins(message, sender) {
  if (!fromExtensionPage(sender)) return { ok: false, reason: "origin" };
  if (!["read", "apply", "craft"].includes(message.request?.type)) return { ok: false, reason: "invalid" };
  const [tabs, session] = await Promise.all([
    chrome.tabs.query({ active: true, currentWindow: true }),
    chrome.storage.session.get({ statuses: {} })
  ]);
  const candidates = Object.entries(session.statuses).filter(([, status]) => Date.now() - status.at < 30000).sort((a, b) => b[1].at - a[1].at).map(([id]) => Number(id));
  const activeId = tabs[0]?.id;
  const requestedId = message.request.tabId;
  const target = Number.isInteger(requestedId) ? (candidates.includes(requestedId) ? requestedId : null) : candidates.includes(activeId) ? activeId : candidates[0];
  if (!Number.isInteger(target)) return { ok: false, reason: "no-tab" };
  try {
    return { ...await chrome.tabs.sendMessage(target, { type: "skins:request", request: message.request }), tabId: target };
  } catch { return { ok: false, reason: "no-tab" }; }
}

function fromKarasu(sender) {
  try { return Number.isInteger(sender.tab?.id) && new URL(sender.url).origin === "https://karasu.live"; }
  catch { return false; }
}

async function copyConnection(message, sender) {
  if (!fromKarasu(sender)) return { ok: false, reason: "origin" };
  const matchId = message.matchId;
  const command = K.connectCommand(message.command);
  if (typeof matchId !== "string" || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(matchId) || !command || new URL(sender.url).pathname.replace(/\/$/, "") !== `/matches/${matchId}`) return { ok: false, reason: "invalid" };
  const preference = await chrome.storage.local.get({ autoCopyConnect: false });
  if (preference.autoCopyConnect !== true) return { ok: false, reason: "disabled" };
  const token = matchId;
  const session = await chrome.storage.session.get({ connectionCopies: {} });
  if (session.connectionCopies[token]?.command === command) return { ok: true, duplicate: true };
  let offscreenReady = false;
  let submitted = false;
  try {
    const verified = await chrome.tabs.sendMessage(sender.tab.id, { type: "connect:verify", matchId, command });
    if (verified?.ok !== true) return { ok: false, reason: "stale" };
    const url = chrome.runtime.getURL("clipboard.html");
    const contexts = typeof chrome.runtime.getContexts === "function"
      ? await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"], documentUrls: [url] })
      : typeof clients !== "undefined" ? (await clients.matchAll()).filter(client => client.url === url) : [];
    if (!contexts.length) await chrome.offscreen.createDocument({ url: "clipboard.html", reasons: ["CLIPBOARD"], justification: "Copy the player's ready-match connect command after they enable Auto-copy connect." });
    offscreenReady = true;
    const latest = await chrome.storage.local.get({ autoCopyConnect: false });
    if (latest.autoCopyConnect !== true) return { ok: false, reason: "disabled" };
    const copies = Object.fromEntries(Object.entries(session.connectionCopies).slice(-63));
    copies[token] = { at: Date.now(), command, state: "pending" };
    await chrome.storage.session.set({ connectionCopies: copies });
    submitted = true;
    const result = await chrome.runtime.sendMessage({ target: "clipboard", type: "clipboard:write", command });
    if (result?.ok !== true) {
      delete copies[token];
      await chrome.storage.session.set({ connectionCopies: copies });
      return { ok: false, reason: "clipboard-failed" };
    }
    copies[token] = { at: Date.now(), command, state: "copied" };
    await chrome.storage.session.set({ connectionCopies: copies });
    const log = work.then(() => handle({ type: "history", text: `Connection copied: ${command}`, ok: true }, sender));
    work = log.catch(() => {});
    await log;
    return { ok: true, command };
  } catch { return { ok: false, reason: "clipboard-failed", uncertain: submitted }; }
  finally { if (offscreenReady) try { await chrome.offscreen.closeDocument(); } catch { /* The browser may already have closed it. */ } }
}

async function handle(message, sender) {
  if (!message || typeof message.type !== "string") return { ok: false };
  if (message.type === "settings:save") {
    if (sender.tab && !fromKarasu(sender) && !sender.url?.startsWith(chrome.runtime.getURL(""))) return { ok: false };
    const previous = await chrome.storage.local.get("settings");
    const patch = {};
    for (const key of Object.keys(K.DEFAULTS)) if (Object.hasOwn(message.patch || {}, key)) patch[key] = message.patch[key];
    const settings = K.normalizeSettings({ ...K.normalizeSettings(previous.settings), ...patch });
    await chrome.storage.local.set({ settings });
    return { ok: true, settings };
  }
  if (message.type === "dashboard") {
    const [local, session, tabs] = await Promise.all([
      chrome.storage.local.get("settings"),
      chrome.storage.session.get({ statuses: {}, history: [] }),
      chrome.tabs.query({ active: true, currentWindow: true })
    ]);
    const active = session.statuses[tabs[0]?.id];
    const recent = Object.values(session.statuses).sort((a, b) => b.at - a.at)[0];
    const status = active || recent;
    return { ok: true, version: K.VERSION, capabilities: { skins: true, craft: true, clipboard: true }, settings: K.normalizeSettings(local.settings), status: status && Date.now() - status.at < 15000 ? status : null, history: session.history };
  }
  if (!fromKarasu(sender)) return { ok: false, reason: "origin" };
  if (message.type === "background:schedule") return globalThis.KarasuBackground.schedule(message, sender);
  if (message.type === "background:protect") return globalThis.KarasuBackground.protect(message, sender);
  if (message.type === "claim") {
    const local = await chrome.storage.local.get("settings");
    const settings = K.normalizeSettings(local.settings);
    if (K.settingsKey(settings) !== message.settingsKey) return { ok: false, reason: "settings-changed" };
    const enabled = { accept: settings.acceptEnabled, map: settings.mapsEnabled, location: settings.locationsEnabled };
    if (!enabled[message.kind] || typeof message.token !== "string" || message.token.length > 16000) return { ok: false, reason: "disabled" };
    const session = await chrome.storage.session.get({ claims: {} });
    if (Object.hasOwn(session.claims, message.token)) return { ok: false, reason: "duplicate" };
    const lease = crypto.randomUUID();
    const claims = Object.fromEntries(Object.entries(session.claims).slice(-255));
    claims[message.token] = { tabId: sender.tab.id, lease };
    await chrome.storage.session.set({ claims });
    return { ok: true, lease };
  }
  if (message.type === "release") {
    const session = await chrome.storage.session.get({ claims: {} });
    const claim = session.claims[message.token];
    if (claim?.tabId === sender.tab.id && claim.lease === message.lease) {
      delete session.claims[message.token];
      await chrome.storage.session.set({ claims: session.claims });
    }
    return { ok: true };
  }
  if (message.type === "status") {
    const session = await chrome.storage.session.get({ statuses: {} });
    const statuses = { ...session.statuses, [sender.tab.id]: {
      text: String(message.text || "").slice(0, 200),
      level: ["idle", "active", "success", "warning", "error"].includes(message.level) ? message.level : "idle",
      at: Date.now()
    } };
    for (const [tabId, status] of Object.entries(statuses)) if (Date.now() - status.at > 30000) delete statuses[tabId];
    await chrome.storage.session.set({ statuses });
    return { ok: true };
  }
  if (message.type === "history") {
    const session = await chrome.storage.session.get({ history: [] });
    const entry = { text: String(message.text || "").slice(0, 160), at: Date.now(), ok: message.ok === true };
    await chrome.storage.session.set({ history: [entry, ...session.history].slice(0, 12) });
    return { ok: true };
  }
  return { ok: false };
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.target === "clipboard") return;
  if (message?.type === "connect:copy") {
    const next = clipboardWork.then(() => copyConnection(message, sender));
    clipboardWork = next.catch(() => {});
    next.then(respond, () => respond({ ok: false, reason: "clipboard-failed" }));
    return true;
  }
  if (message?.type === "skins:request") {
    // Skin requests have their own queue: cosmetic API latency must not delay
    // match acceptance, veto claims, or settings changes.
    const next = skinsWork.then(() => forwardSkins(message, sender));
    skinsWork = next.catch(() => {});
    next.then(respond, () => respond({ ok: false, reason: "request-failed" }));
    return true;
  }
  // Serialize storage mutations so two tabs cannot claim the same turn.
  const next = work.then(() => handle(message, sender));
  work = next.catch(() => {});
  next.then(respond, () => respond({ ok: false, reason: "storage-error" }));
  return true;
});

chrome.runtime.onInstalled.addListener(() => {
  work = work.then(async () => {
    const local = await chrome.storage.local.get("settings");
    await chrome.storage.local.set({ settings: K.normalizeSettings(local.settings) });
    await chrome.storage.session.set({ statuses: {}, history: [] });
  }).catch(() => {});
});

chrome.tabs.onRemoved?.addListener(tabId => {
  work = work.then(() => globalThis.KarasuBackground.release(tabId, true)).catch(() => {});
});
chrome.tabs.onUpdated?.addListener((tabId, change) => {
  if (change.status === "loading") work = work.then(() => globalThis.KarasuBackground.release(tabId)).catch(() => {});
});

