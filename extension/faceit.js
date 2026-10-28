/* Read-only FACEIT badges from Karasu's existing match component props.
 * No API requests, synchronization mutations, nickname matching, or credentials.
 */
(() => {
  "use strict";
  const K = globalThis.KarasuAuto;
  if (!K || globalThis.__karasuFaceitBadgesV1) return;
  globalThis.__karasuFaceitBadgesV1 = true;
  let enabled = false;
  let style = "badge";
  let interval;
  const badges = new Set();
  const attached = new WeakMap();
  const nameOf = component => component?.type?.__name || component?.type?.name;
  const active = component => component && !component.isUnmounted && !component.isDeactivated;
  function walk(root, visit) {
    const stack = root ? [root] : [];
    const visited = new Set();
    while (stack.length && visited.size < 25000) {
      const node = stack.pop();
      if (!node || typeof node !== "object" || visited.has(node) || node.type?.__isTeleport) continue;
      visited.add(node);
      visit(node);
      if (active(node.component)) stack.push(node.component.subTree);
      if (node.suspense?.activeBranch) stack.push(node.suspense.activeBranch);
      if (Array.isArray(node.children)) stack.push(...[...node.children].reverse());
    }
  }
  function integer(value, min, max) {
    if (value == null || value === "" || !["number", "string"].includes(typeof value)) return null;
    const number = Number(value);
    return Number.isSafeInteger(number) && number >= min && number <= max ? number : null;
  }
  function rank(player) {
    let elo = integer(player.faceit_elo, 0, 1000000);
    let level = integer(player.faceit_skill_level, 1, 10);
    let source = "Stored on Karasu";
    if (elo === null && level === null) {
      const snapshot = player.faceit_rank_history?.[0];
      elo = integer(snapshot?.elo, 0, 1000000);
      level = integer(snapshot?.skill_level, 1, 10);
      if (elo !== null || level !== null) source = "At match start";
    }
    let url = "";
    try {
      const parsed = new URL(String(player.faceit_url || "").replace("{lang}", "en"));
      if (parsed.protocol === "https:" && ["faceit.com", "www.faceit.com"].includes(parsed.hostname) && /^\/[a-z]{2}\/players\/[^/]+\/?$/.test(parsed.pathname) && !parsed.username && !parsed.password) url = parsed.origin + parsed.pathname;
    } catch { /* A profile link is optional. */ }
    return { elo, level, source, url };
  }
  function anchorFor(component) {
    let anchor = null;
    walk(component.subTree, node => {
      const element = node.el;
      if (!anchor && element?.nodeType === 1 && element.tagName === "BUTTON" && element.isConnected) anchor = element;
    });
    return anchor;
  }
  function update(anchor, steamId, value, seen) {
    let badge = attached.get(anchor);
    if (!badge || !badge.isConnected || badge.parentElement !== anchor.parentElement) {
      badge?.remove();
      badge = document.createElement("a");
      badge.className = "ka-faceit-badge";
      badge.target = "_blank"; badge.rel = "noopener noreferrer";
      badge.addEventListener("click", event => event.stopPropagation());
      attached.set(anchor, badge); badges.add(badge);
      anchor.after(badge);
    }
    seen.add(badge);
    badge.dataset.style = style;
    const key = JSON.stringify([steamId, value]);
    if (badge.dataset.key === key) return;
    badge.dataset.key = key;
    badge.dataset.steamId = steamId;
    badge.dataset.level = value.level === null ? "" : String(value.level);
    const available = value.elo !== null || value.level !== null;
    const label = available ? `FACEIT CS2 · Level ${value.level ?? "unknown"} · ${value.elo === null ? "ELO unavailable" : `${value.elo} ELO`} · ${value.source}` : "FACEIT data unavailable on Karasu. This account may not be synced.";
    badge.title = label; badge.setAttribute("aria-label", label);
    if (value.url) { badge.href = value.url; badge.removeAttribute("role"); }
    else { badge.removeAttribute("href"); badge.setAttribute("role", "img"); }
    badge.replaceChildren();
    for (const [className, text, hidden] of [["mark", "F", false], ["level", String(value.level ?? ""), value.level === null], ["elo", String(value.elo ?? "—"), false]]) {
      const part = document.createElement("span");
      part.className = `ka-faceit-${className}`; part.textContent = text; part.hidden = hidden;
      part.setAttribute("aria-hidden", "true"); badge.append(part);
    }
  }
  function clear() { for (const badge of badges) badge.remove(); badges.clear(); }
  function scan() {
    if (!enabled || !/^\/matches\/[a-z0-9-]+\/?$/i.test(window.location.pathname)) { clear(); return; }
    const container = document.getElementById("__nuxt");
    const app = container?.__vue_app__;
    const root = app?._container?._vnode || container?._vnode || app?._instance?.vnode;
    const rows = [];
    walk(root, node => { if (active(node.component) && nameOf(node.component) === "LineupOverviewRow") rows.push(node.component); });
    const seen = new Set();
    for (const row of rows) {
      const member = row.props?.member || row.proxy?.member;
      const player = member?.player;
      const steamId = String(member?.steam_id || player?.steam_id || "");
      if (!player || !/^\d{17}$/.test(steamId) || (player.steam_id && String(player.steam_id) !== steamId)) continue;
      const elos = [];
      let nativeFaceit = false;
      walk(row.subTree, node => {
        if (!active(node.component)) return;
        const name = nameOf(node.component);
        if (name === "PlayerFaceitRank") nativeFaceit = true;
        if (name === "PlayerElo") elos.push(node.component);
      });
      if (nativeFaceit) continue;
      const value = rank(player);
      for (const elo of elos) { const anchor = anchorFor(elo); if (anchor) update(anchor, steamId, value, seen); }
    }
    for (const badge of badges) if (!seen.has(badge)) { badge.remove(); badges.delete(badge); }
  }
  document.addEventListener(K.REQUEST, event => {
    try {
      if (typeof event.detail !== "string" || event.detail.length > 1000) return;
      const message = JSON.parse(event.detail);
      if (message.type !== "faceit:config" || typeof message.action?.enabled !== "boolean") return;
      enabled = message.action.enabled;
      if (Object.hasOwn(message.action, "style")) style = ["label", "minimal"].includes(message.action.style) ? message.action.style : "badge";
      scan();
    } catch { /* Ignore messages outside the display protocol. */ }
  });
  function start() { if (!interval) interval = setInterval(scan, 1500); }
  start();
  window.addEventListener("pagehide", () => { clearInterval(interval); interval = null; });
  window.addEventListener("pageshow", () => { start(); scan(); });
})();
