/* Runs inside the page only after the user installs the extension.
 * Uses Karasu's existing Nuxt component actions and server-provided turn flags.
 * No fetch, token access, login changes, generic button matching, or input events.
 */
(() => {
  "use strict";
  const K = globalThis.KarasuAuto;
  if (!K || globalThis.__karasuAutoAdapterV1) return;
  globalThis.__karasuAutoAdapterV1 = true;
  const issued = new Set();

  function findComponents() {
    const container = document.getElementById("__nuxt");
    const app = container?.__vue_app__;
    const root = app?._container?._vnode || container?._vnode || app?._instance?.vnode;
    const found = new Map();
    const visited = new Set();
    const stack = root ? [root] : [];
    while (stack.length && visited.size < 25000) {
      const node = stack.pop();
      if (!node || typeof node !== "object" || visited.has(node)) continue;
      visited.add(node);
      const component = node.component;
      if (component && !component.isUnmounted && !component.isDeactivated) {
        const name = component.type?.__name || component.type?.name;
        if (name && component.proxy) found.set(name, component);
        if (component.subTree) stack.push(component.subTree);
      }
      if (node.suspense?.activeBranch) stack.push(node.suspense.activeBranch);
      if (Array.isArray(node.children)) stack.push(...node.children);
    }
    return { connected: !!root, found };
  }

  function date(value) {
    const parsed = typeof value === "string" || typeof value === "number" ? new Date(value).getTime() : NaN;
    return Number.isFinite(parsed) ? parsed : null;
  }
  function id(value) { return typeof value === "string" && value.length > 0 && value.length <= 120 ? value : null; }
  function label(value) { return String(value ?? "").slice(0, 80); }
  function token(parts) { return JSON.stringify(parts); }

  function ownTurn(match, kind) {
    if (match?.status !== "Veto" || match.is_captain !== true || match.is_in_lineup !== true) return false;
    const field = kind === "map" ? "can_pick_map_veto" : "can_pick_location_veto";
    const pickingId = kind === "map" ? match.map_veto_picking_lineup_id : match.location_veto_picking_lineup_id;
    return [match.lineup_1, match.lineup_2].some(lineup => lineup?.is_on_lineup === true && lineup[field] === true && id(lineup.id) && lineup.id === pickingId);
  }

  function inspect() {
    const { connected, found } = findComponents();
    const snapshot = { connected, queue: false, ready: null, veto: null, connection: null, phase: "idle", observed: { mapPicks: [], locationPicks: [] } };
    for (const component of found.values()) {
      const match = component.proxy?.match || component.props?.match;
      if (!match || !id(match.id) || match.is_in_lineup !== true || match.is_match_server_available !== true || !["WaitingForServer", "Live"].includes(match.status)) continue;
      const command = K.connectCommand(match.connection_string);
      if (command) { snapshot.connection = { matchId: match.id, command }; break; }
    }
    const contexts = {};
    const queue = found.get("KarasuQueue");
    const queueElement = queue?.subTree?.el;
    if (queueElement?.nodeType === 1 && queueElement.isConnected) {
      snapshot.queue = true;
      if (!queueElement.hasAttribute("data-karasu-auto-queue")) queueElement.setAttribute("data-karasu-auto-queue", "");
    }
    const confirm = found.get("MatchmakingConfirm")?.proxy;
    const confirmation = confirm?.confirmation;
    if (confirmation && id(confirmation.confirmationId)) {
      const expiresAt = date(confirmation.expiresAt);
      snapshot.ready = {
        token: token(["accept", confirmation.confirmationId]),
        canAccept: confirm.shouldShow === true && confirmation.isReady !== true && !confirmation.matchId && typeof confirm.ready === "function" && !!expiresAt,
        isReady: confirmation.isReady === true,
        matchId: id(confirmation.matchId),
        expiresAt
      };
      contexts.accept = confirm;
      if (snapshot.ready.canAccept) snapshot.phase = "ready";
    }

    const location = found.get("MatchLocationVeto")?.proxy;
    const map = found.get("MatchMapVeto")?.proxy;
    const match = location?.match || map?.match;
    snapshot.matchId = id(match?.id);
    if (Array.isArray(location?.picks)) snapshot.observed.locationPicks = location.picks.map(pick => pick.location).filter(value => id(value));
    if (Array.isArray(map?.picks)) snapshot.observed.mapPicks = map.picks.map(pick => pick.map?.id).filter(value => id(value));

    if (location?.isLocationVeto === true && location.isBanning === true && match?.options?.location_veto === true && !match.server_location) {
      snapshot.phase = "location";
      const available = (Array.isArray(location.availableLocations) ? location.availableLocations : []).filter(value => id(value)).map(value => {
        const known = K.LOCATIONS.find(item => item.id === K.canonical(value, "location"));
        return { id: value, name: value, label: known?.label || label(value) };
      });
      const canAct = ownTurn(location.match, "location") && location.isPicking === true && location.submitting === false && (!location.match.options.veto_pick_timeout || !!date(location.match.veto_pick_expires_at)) && typeof location.vetoPick === "function" && typeof location.form?.setFieldValue === "function";
      snapshot.veto = {
        kind: "location", canAct, available, selectedId: id(location.form?.values?.location),
        deadline: location.match.options.veto_pick_timeout ? date(location.match.veto_pick_expires_at) : null,
        token: token(["location", match.id, match.location_veto_picking_lineup_id, [...snapshot.observed.locationPicks].sort(), available.map(item => item.id).sort()])
      };
      contexts.location = location;
    } else if (map && map.match?.status === "Veto") {
      const currentMatch = map.match;
      const phaseReady = (!currentMatch.options?.region_veto || !!currentMatch.region) && (!currentMatch.options?.location_veto || !!currentMatch.server_location);
      const stillVetoing = Array.isArray(currentMatch.match_maps) && currentMatch.match_maps.length < currentMatch.options?.best_of;
      snapshot.phase = phaseReady && stillVetoing ? (map.pickType === "Ban" ? "map" : "manual") : "waiting";
      if (phaseReady && stillVetoing && map.pickType === "Ban" && Array.isArray(map.picks) && Array.isArray(map.mapPool)) {
        const used = new Set(snapshot.observed.mapPicks);
        const available = map.mapPool.filter(item => id(item.id) && !used.has(item.id)).map(item => {
          const known = K.MAPS.find(entry => entry.id === K.canonical(item.name || item.label, "map"));
          return { id: item.id, name: label(item.name || item.label), label: known?.label || label(item.label || item.name) };
        });
        snapshot.veto = {
          kind: "map",
          canAct: ownTurn(currentMatch, "map") && map.isPicking === true && map.submitting === false && (!currentMatch.options?.veto_pick_timeout || !!date(currentMatch.veto_pick_expires_at)) && typeof map.vetoPick === "function" && typeof map.form?.setFieldValue === "function",
          selectedId: id(map.form?.values?.map_id),
          available,
          deadline: currentMatch.options?.veto_pick_timeout ? date(currentMatch.veto_pick_expires_at) : null,
          token: token(["map", currentMatch.id, currentMatch.map_veto_picking_lineup_id, [...snapshot.observed.mapPicks].sort(), available.map(item => item.id).sort()])
        };
        contexts.map = map;
      }
    }
    return { snapshot, contexts };
  }

  async function act(action) {
    const { snapshot, contexts } = inspect();
    if (!action || !["accept", "map", "location"].includes(action.kind)) return { ok: false, reason: "invalid" };
    if (issued.has(action.token)) return { ok: false, reason: "duplicate" };
    if (action.kind === "accept") {
      const ready = snapshot.ready;
      if (!ready?.canAccept || ready.token !== action.token || ready.expiresAt <= Date.now()) return { ok: false, reason: "stale" };
      issued.add(action.token);
      contexts.accept.ready();
    } else {
      const veto = snapshot.veto;
      if (!veto?.canAct || veto.selectedId || veto.kind !== action.kind || veto.token !== action.token || veto.available.length < 2 || (veto.deadline && veto.deadline <= Date.now()) || !veto.available.some(item => item.id === action.targetId)) return { ok: false, reason: "stale" };
      const context = contexts[action.kind];
      issued.add(action.token);
      if (action.kind === "map") context.form.setFieldValue("side", undefined);
      context.form.setFieldValue(action.kind === "map" ? "map_id" : "location", action.targetId);
      await context.vetoPick();
    }
    if (issued.size > 300) issued.delete(issued.values().next().value);
    return { ok: true, sent: true };
  }

  document.addEventListener(K.REQUEST, async event => {
    let request;
    try {
      if (typeof event.detail !== "string" || event.detail.length > 20000) return;
      request = JSON.parse(event.detail);
      if (typeof request.id !== "string" || request.id.length > 100) return;
      let result;
      if (request.type === "snapshot") result = { ok: true, snapshot: inspect().snapshot };
      else if (request.type === "act") result = await act(request.action);
      else return;
      document.dispatchEvent(new CustomEvent(K.RESPONSE, { detail: JSON.stringify({ id: request.id, ...result }) }));
    } catch {
      if (request?.id) document.dispatchEvent(new CustomEvent(K.RESPONSE, { detail: JSON.stringify({ id: request.id, ok: false, reason: "adapter-error" }) }));
    }
  });
})();
