(() => {
  "use strict";
  const K = globalThis.KarasuAuto;
  if (globalThis.__karasuAutoContentV2) return;
  globalThis.__karasuAutoContentV2 = true;
  let settings = K.normalizeSettings({});
  let settingsLoaded = false;
  let generation = 0;
  let busy = false;
  let repoll = false;
  let interval;
  let pending = null;
  let flash = null;
  let status = { text: "Connecting to Karasu…", level: "idle" };
  let lastReport = 0;
  let autoCopyConnect = false;
  let copyingConnection = false;
  let lastConnectionKey = "";
  let wakeKey = "";
  let protection;
  const countdown = new K.Countdown();
  const handled = new Set();
  const requests = new Map();
  let faceitDisplay = { enabled: true, style: "badge" };
  function configureFaceit(change) {
    faceitDisplay = { ...faceitDisplay, ...change };
    document.dispatchEvent(new CustomEvent(K.REQUEST, { detail: JSON.stringify({ type: "faceit:config", action: faceitDisplay }) }));
  }
  function configureAutoCopy(value) {
    const next = value === true;
    if (next !== autoCopyConnect) lastConnectionKey = "";
    autoCopyConnect = next;
    if (settingsLoaded) Promise.resolve().then(poll);
  }
  function copyReadyConnection(connection) {
    if (!autoCopyConnect || copyingConnection || !connection) return;
    const command = K.connectCommand(connection.command);
    if (!command || typeof connection.matchId !== "string") return;
    const key = `${connection.matchId}|${command}`;
    if (key === lastConnectionKey) return;
    lastConnectionKey = key; copyingConnection = true;
    chrome.runtime.sendMessage({ type: "connect:copy", matchId: connection.matchId, command }).then(result => {
      if (!autoCopyConnect || result?.duplicate || result?.reason === "disabled" || result?.reason === "stale") return;
      flash = result?.ok ? { text: `Copied: ${command}`, level: "success", until: Date.now() + 5000 }
        : { text: "Could not confirm copying the server command. Use Karasu's copy button.", level: "warning", until: Date.now() + 8000 };
    }).catch(() => {
      if (autoCopyConnect) flash = { text: "Connection copy interrupted. Use Karasu's copy button.", level: "warning", until: Date.now() + 8000 };
    }).finally(() => { copyingConnection = false; });
  }

  function applySettings(value) {
    const next = K.normalizeSettings(value);
    if (K.settingsKey(next) !== K.settingsKey(settings)) {
      settings = next;
      generation++;
      countdown.cancel();
      wakeKey = "";
      flash = null;
      if (settingsLoaded) Promise.resolve().then(poll);
    }
    protectTab();
  }
  function protectTab() {
    const enabled = settings.acceptEnabled || settings.mapsEnabled || settings.locationsEnabled;
    const key = `${enabled}|${globalThis.location?.pathname || "/play"}`;
    if (key !== protection) {
      protection = key;
      chrome.runtime.sendMessage({ type: "background:protect", enabled }).catch(() => {});
    }
  }

  function report(text, level = "idle") {
    const changed = status.text !== text || status.level !== level;
    status = { text, level };
    if (changed || Date.now() - lastReport > 5000) {
      lastReport = Date.now();
      try { chrome.runtime.sendMessage({ type: "status", ...status }).catch(() => {}); }
      catch { /* An extension update invalidates an already loaded content script. */ }
    }
  }

  function remember(token) {
    handled.add(token);
    if (handled.size > 300) handled.delete(handled.values().next().value);
  }

  async function record(text, ok) {
    try {
      await chrome.runtime.sendMessage({ type: "history", text, ok });
    } catch { /* History does not gate an action. */ }
  }

  function page(type, action) {
    return new Promise((resolve, reject) => {
      const requestId = crypto.randomUUID();
      const timer = setTimeout(() => {
        requests.delete(requestId);
        reject(new Error("adapter-timeout"));
      }, type.startsWith("skins:") ? 60000 : 6000);
      requests.set(requestId, { resolve, timer });
      document.dispatchEvent(new CustomEvent(K.REQUEST, { detail: JSON.stringify({ id: requestId, type, action }) }));
    });
  }

  document.addEventListener(K.RESPONSE, event => {
    try {
      if (typeof event.detail !== "string" || event.detail.length > 2000000) return;
      const response = JSON.parse(event.detail);
      const request = requests.get(response.id);
      if (!request) return;
      clearTimeout(request.timer);
      requests.delete(response.id);
      request.resolve(response);
    } catch { /* Ignore messages that are not part of the adapter protocol. */ }
  });

  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== chrome.runtime.id) return;
    if (message?.type === "automation:tick") { wakeKey = ""; poll().then(() => respond({ ok: true })); return true; }
    if (message?.type === "connect:verify") {
      page("snapshot").then(result => {
        const connection = result?.snapshot?.connection;
        respond({ ok: result?.ok === true && connection?.matchId === message.matchId && connection?.command === message.command });
      }, () => respond({ ok: false }));
      return true;
    }
    if (message?.type !== "skins:request") return;
    const request = message.request;
    if (!request || !["read", "apply", "craft"].includes(request.type)) { respond({ ok: false, reason: "invalid" }); return; }
    page(`skins:${request.type}`, request.action).then(respond, () => respond({ ok: false, reason: "timeout" }));
    return true;
  });

  function observePending(snapshot, now) {
    if (!pending) return false;
    const sameMatch = pending.matchId && pending.matchId === snapshot.matchId;
    const confirmed = pending.kind === "accept"
      ? snapshot.ready?.token === pending.token && (snapshot.ready.isReady || !!snapshot.ready.matchId)
      : sameMatch && (pending.kind === "map" ? snapshot.observed?.mapPicks : snapshot.observed?.locationPicks)?.includes(pending.targetId);
    if (confirmed) {
      const text = pending.kind === "accept" ? "Match accepted." : `${pending.kind === "map" ? "Map" : "Server"} banned: ${pending.label}.`;
      remember(pending.token);
      pending = null;
      flash = { text, level: "success", until: now + 5000 };
      record(text, true);
      return false;
    }
    if (pending.kind === "accept" && (!snapshot.ready || snapshot.ready.token !== pending.token)) {
      remember(pending.token);
      pending = null;
      flash = { text: "Accept sent; the match dialog closed.", level: "idle", until: now + 5000 };
      record(flash.text, false);
      return false;
    }
    if (now - pending.at > 12000) {
      remember(pending.token);
      const actionLabel = pending.kind === "accept" ? "Accept" : `Ban: ${pending.label}`;
      pending = null;
      flash = { text: `${actionLabel} — no server confirmation. Check manually.`, level: "warning", until: now + 10000 };
      record(flash.text, false);
      return false;
    }
    report(pending.kind === "accept" ? "Accept sent. Waiting for server…" : `Ban sent: ${pending.label}. Waiting for server…`, "active");
    return true;
  }

  function idleStatus(snapshot) {
    if (!snapshot.connected) return report("Waiting for Karasu. Refresh the page if needed.");
    if (!settings.acceptEnabled && !settings.mapsEnabled && !settings.locationsEnabled) return report("Ready. Enable the features you want.");
    if (snapshot.ready?.isReady) return report("Accepted. Waiting for other players.", "success");
    if (snapshot.veto?.selectedId) return report("Your selection is waiting for manual confirmation.");
    if (snapshot.veto && !snapshot.veto.canAct) return report("Waiting for your captain turn.");
    if (snapshot.phase === "manual") return report("Choose the map pick or side manually.");
    if (snapshot.phase === "map" && !settings.mapsEnabled) return report("Map bans are off.");
    if (snapshot.phase === "location" && !settings.locationsEnabled) return report("Server bans are off.");
    report("", "idle");
  }

  async function execute(plan, snapshot) {
    const revision = generation;
    const fingerprint = K.settingsKey(settings);
    const fresh = await page("snapshot");
    if (!fresh.ok || revision !== generation || K.planKey(K.makePlan(fresh.snapshot, settings)) !== K.planKey(plan)) {
      countdown.cancel();
      return;
    }
    const claim = await chrome.runtime.sendMessage({ type: "claim", kind: plan.kind, token: plan.token, settingsKey: fingerprint });
    if (!claim?.ok) {
      if (claim?.reason === "duplicate") {
        remember(plan.token);
        flash = { text: "This action is being handled in another tab.", level: "idle", until: Date.now() + 5000 };
      }
      countdown.cancel();
      return;
    }
    if (revision !== generation) {
      await chrome.runtime.sendMessage({ type: "release", token: plan.token, lease: claim.lease });
      countdown.cancel();
      return;
    }
    pending = { ...plan, matchId: snapshot.matchId, at: Date.now() };
    report(plan.kind === "accept" ? "Accepting match…" : `Banning ${plan.label}…`, "active");
    try {
      const result = await page("act", plan);
      if (!result.ok) {
        pending = null;
        remember(plan.token);
        // Stale means the page did not submit an action.
        if (result.reason === "stale") await chrome.runtime.sendMessage({ type: "release", token: plan.token, lease: claim.lease });
        flash = { text: result.reason === "stale" ? "Turn or selection changed. Action cancelled." : "Action failed. Check the selection manually.", level: "warning", until: Date.now() + 6000 };
      }
    } catch {
      // A timeout can still mean the server is processing the request.
      // Keep the claim and wait for evidence instead of submitting twice.
      report("Waiting for the submitted action…", "warning");
    }
  }

  async function poll() {
    if (!settingsLoaded) return;
    if (busy) { repoll = true; return; }
    busy = true;
    try {
      const response = await page("snapshot");
      if (!response.ok) throw new Error("adapter-error");
      const snapshot = response.snapshot;
      protectTab();
      copyReadyConnection(snapshot.connection);
      const now = Date.now();
      if (observePending(snapshot, now)) return;
      const plan = K.makePlan(snapshot, settings, now);
      if (plan && !handled.has(plan.token)) {
        const tick = countdown.update(plan, settings, now);
        if (tick.blocked) report("Not enough time for your delay. Choose manually.", "warning");
        else if (tick.execute) await execute(plan, snapshot);
        else {
          const key = `${K.planKey(plan)}|${generation}|${countdown.startedAt}`;
          if (wakeKey !== key && tick.remaining > 0 && tick.remaining <= 10000) {
            wakeKey = key;
            chrome.runtime.sendMessage({ type: "background:schedule", key, delay: tick.remaining }).catch(() => {});
          }
          report(plan.kind === "accept" ? `Accepting in ${Math.ceil(tick.remaining / 1000)}s…` : `Banning ${plan.label} in ${Math.ceil(tick.remaining / 1000)}s…`, "active");
        }
      } else {
        countdown.cancel();
        wakeKey = "";
        if (flash && now < flash.until) report(flash.text, flash.level);
        else if (plan && handled.has(plan.token)) report("Action already sent. Choose manually if needed.");
        else idleStatus(snapshot);
      }
    } catch {
      countdown.cancel();
      report("Extension disconnected. Refresh the Karasu tab.", "error");
    } finally { busy = false; if (repoll) { repoll = false; Promise.resolve().then(poll); } }
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.settings) applySettings(changes.settings.newValue);
    if (area === "local" && changes.autoCopyConnect) configureAutoCopy(changes.autoCopyConnect.newValue);
    if (area === "local" && (changes.faceitRanksEnabled || changes.faceitRankStyle)) configureFaceit({
      ...(changes.faceitRanksEnabled ? { enabled: changes.faceitRanksEnabled.newValue !== false } : {}),
      ...(changes.faceitRankStyle ? { style: ["label", "minimal"].includes(changes.faceitRankStyle.newValue) ? changes.faceitRankStyle.newValue : "badge" } : {})
    });
  });
  chrome.storage.local.get({ settings: {}, faceitRanksEnabled: true, faceitRankStyle: "badge", autoCopyConnect: false }).then(result => {
    applySettings(result.settings);
    configureAutoCopy(result.autoCopyConnect);
    configureFaceit({ enabled: result.faceitRanksEnabled !== false, style: ["label", "minimal"].includes(result.faceitRankStyle) ? result.faceitRankStyle : "badge" });
    settingsLoaded = true;
    poll();
  }).catch(() => report("Could not read settings. Refresh the Karasu tab.", "error"));
  function start() { if (!interval) { if (settingsLoaded) protectTab(); interval = setInterval(poll, 500); poll(); } }
  // Server-driven DOM changes wake the adapter even if hidden-tab intervals are
  // heavily throttled. Coalesce mutation bursts without another timer chain.
  let queued = false;
  const wake = () => {
    if (queued) return;
    queued = true;
    Promise.resolve().then(() => { queued = false; poll(); });
  };
  if (typeof MutationObserver === "function") {
    const observer = new MutationObserver(wake);
    const target = document.getElementById("__nuxt") || document.documentElement;
    if (target) observer.observe(target, { childList: true, subtree: true, characterData: true });
  }
  document.addEventListener("visibilitychange", wake);
  window.addEventListener("online", wake);
  start();
  window.addEventListener("pagehide", () => { clearInterval(interval); interval = null; countdown.cancel(); protection = undefined; chrome.runtime.sendMessage({ type: "background:protect", enabled: false }).catch(() => {}); });
  window.addEventListener("pageshow", start);
})();
