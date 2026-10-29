/* Shared pure logic. No network access, browser UI control, or account data. */
(() => {
  "use strict";
  const VERSION = "1.2.4";
  const MAPS = Object.freeze([
    { id: "mirage", label: "Mirage" },
    { id: "nuke", label: "Nuke" },
    { id: "dust2", label: "Dust2" },
    { id: "ancient", label: "Ancient" },
    { id: "inferno", label: "Inferno" },
    { id: "cache", label: "Cache" },
    { id: "anubis", label: "Anubis" }
  ]);
  const LOCATIONS = Object.freeze([
    { id: "madrid", label: "Madrid", country: "ES" },
    { id: "dusseldorf", label: "Düsseldorf", country: "DE" },
    { id: "istanbul", label: "Istanbul", country: "TR" },
    { id: "prague", label: "Prague", country: "CZ" },
    { id: "stockholm", label: "Stockholm", country: "SE" }
  ]);
  const DEFAULTS = Object.freeze({
    acceptEnabled: false,
    acceptDelay: 3,
    mapsEnabled: false,
    locationsEnabled: false,
    vetoDelay: 2,
    mapOrder: [],
    locationOrder: []
  });
  const REQUEST = "karasu-auto:request:v1";
  const RESPONSE = "karasu-auto:response:v1";

  function connectCommand(value) {
    if (typeof value !== "string" || value.length > 80 || /[\r\n]/.test(value)) return null;
    const match = value.trim().match(/^(?:connect\s+)?(\d{1,3}(?:\.\d{1,3}){3}):(\d{1,5})$/i);
    if (!match) return null;
    const parts = match[1].split(".").map(Number);
    const port = Number(match[2]);
    if (parts.some(part => part < 0 || part > 255) || port < 1 || port > 65535) return null;
    return `connect ${parts.join(".")}:${port}`;
  }

  function canonical(value, kind) {
    let text = String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    text = text.replace(/^de[_ -]/, "").replace(/[^a-z0-9]/g, "");
    if (kind === "map") return ({ dustii: "dust2", dust: "dust2" })[text] || text;
    return ({ barcelona: "madrid", praha: "prague", warszawa: "warsaw", londyn: "london", milano: "milan", bucarest: "bucharest" })[text] || text;
  }

  function normalizeOrder(value, kind) {
    if (!Array.isArray(value)) return [];
    const catalog = kind === "map" ? MAPS : LOCATIONS;
    return [...new Set(value.filter(item => typeof item === "string" && item.length <= 80).map(item => canonical(item, kind)).filter(item => catalog.some(entry => entry.id === item)))];
  }

  function seconds(value, fallback) {
    const number = typeof value === "number" ? value : NaN;
    return Number.isFinite(number) ? Math.min(10, Math.max(1, Math.round(number))) : fallback;
  }

  function normalizeSettings(value) {
    const input = value && typeof value === "object" ? value : {};
    return {
      acceptEnabled: input.acceptEnabled === true,
      acceptDelay: seconds(input.acceptDelay, DEFAULTS.acceptDelay),
      mapsEnabled: input.mapsEnabled === true,
      locationsEnabled: input.locationsEnabled === true,
      vetoDelay: seconds(input.vetoDelay, DEFAULTS.vetoDelay),
      mapOrder: normalizeOrder(input.mapOrder, "map"),
      locationOrder: normalizeOrder(input.locationOrder, "location")
    };
  }

  function settingsKey(settings) {
    return JSON.stringify(normalizeSettings(settings));
  }

  function chooseCandidate(available, order, kind) {
    if (!Array.isArray(available) || available.length < 2) return null;
    const catalog = kind === "map" ? MAPS : LOCATIONS;
    const priority = [...new Set([...normalizeOrder(order, kind), ...catalog.map(item => item.id)])];
    return available.filter(item => item && typeof item.id === "string" && item.id.length > 0 && item.id.length <= 120)
      .map(item => ({ ...item, canonical: canonical(item.name || item.label || item.id, kind) }))
      .filter(item => kind !== "map" || item.canonical !== "vertigo")
      .sort((a, b) => {
        const aIndex = priority.indexOf(a.canonical);
        const bIndex = priority.indexOf(b.canonical);
        const difference = (aIndex < 0 ? priority.length : aIndex) - (bIndex < 0 ? priority.length : bIndex);
        if (difference) return difference;
        return a.canonical < b.canonical ? -1 : a.canonical > b.canonical ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      })[0] || null;
  }

  function makePlan(snapshot, input, now = Date.now()) {
    const settings = normalizeSettings(input);
    if (!snapshot?.connected) return null;
    const ready = snapshot.ready;
    if (settings.acceptEnabled && ready?.canAccept === true && ready.token && ready.expiresAt > now) {
      return { kind: "accept", token: ready.token, label: "Match", delayMs: settings.acceptDelay * 1000, expiresAt: ready.expiresAt };
    }
    const veto = snapshot.veto;
    if (!veto?.canAct || !veto.token || veto.selectedId || (veto.deadline && veto.deadline <= now)) return null;
    if (veto.kind === "map" && !settings.mapsEnabled) return null;
    if (veto.kind === "location" && !settings.locationsEnabled) return null;
    if (veto.kind !== "map" && veto.kind !== "location") return null;
    const candidate = chooseCandidate(veto.available, veto.kind === "map" ? settings.mapOrder : settings.locationOrder, veto.kind);
    if (!candidate) return null;
    return { kind: veto.kind, token: veto.token, targetId: candidate.id, label: candidate.label, delayMs: settings.vetoDelay * 1000, expiresAt: veto.deadline || null };
  }

  function planKey(plan) {
    return plan ? JSON.stringify([plan.kind, plan.token, plan.targetId || ""]) : "";
  }

  class Countdown {
    constructor() { this.cancel(); }
    cancel() { this.key = ""; this.startedAt = 0; this.issued = false; }
    update(plan, settings, now) {
      if (!plan) { this.cancel(); return null; }
      const key = planKey(plan) + settingsKey(settings);
      if (key !== this.key) { this.key = key; this.startedAt = now; this.issued = false; }
      const remaining = Math.max(0, plan.delayMs - (now - this.startedAt));
      // Preserve the requested delay; do not shorten it near the deadline.
      if (plan.expiresAt && now + remaining >= plan.expiresAt) return { blocked: true, remaining };
      if (remaining > 0 || this.issued) return { remaining, issued: this.issued };
      this.issued = true;
      return { remaining: 0, execute: true };
    }
  }

  globalThis.KarasuAuto = Object.freeze({ VERSION, MAPS, LOCATIONS, DEFAULTS, REQUEST, RESPONSE, connectCommand, canonical, normalizeSettings, settingsKey, chooseCandidate, makePlan, planKey, Countdown });
})();

