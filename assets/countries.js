/* Muse Invite Hub country map: world boundaries are bundled from Natural Earth (public domain).
 * Confirmed markets come only from Meta-sourced cards; press-reported expectations
 * use separate markup and colors and NEVER count as launched. Unknown regions
 * are NEVER labelled unavailable. No analytics or external map SDK. */
(() => {
  "use strict";
  const svg = document.getElementById("availability-map");
  const countriesLayer = document.getElementById("map-countries");
  const markerLayer = document.getElementById("map-markers");
  const gridLayer = document.getElementById("map-graticule");
  const status = document.getElementById("map-loading");
  const confirmedCards = [...document.querySelectorAll(".country-card:not(.expected-card)[data-code]")];
  const expectedCards = [...document.querySelectorAll(".expected-card[data-code]")];
  const cards = [...confirmedCards, ...expectedCards];
  if (!svg || !countriesLayer || !markerLayer || !status || !confirmedCards.length) return;

  const NS = "http://www.w3.org/2000/svg";
  const confirmedMarkets = new Map(confirmedCards.map(card => [card.dataset.code, card]));
  const expectedMarkets = new Map(expectedCards.map(card => [card.dataset.code, card]));
  const markets = new Map([...confirmedMarkets, ...expectedMarkets]);
  // Label placement only, NOT evidence of rollout. Rollout data stays in the
  // source-linked HTML list shared with the homepage editorial checks.
  const markers = {
    US: { longitude: -99, latitude: 38, label: "United States", dx: 15, dy: -10 },
    CA: { longitude: -108, latitude: 57, label: "Canada", dx: 15, dy: -10 },
    JP: { longitude: 138, latitude: 36, label: "Japan", dx: -17, dy: -10, anchor: "end" },
    SG: { longitude: 103.82, latitude: 1.35, label: "Singapore", dx: 15, dy: -10 },
    MX: { longitude: -102, latitude: 24, label: "Mexico", dx: 15, dy: 20 },
    GB: { longitude: -2.5, latitude: 54, label: "UK (expected)", dx: 15, dy: -10 }
  };
  const views = {
    world: "0 0 1000 500",
    americas: "0 45 500 400",
    europe: "405 42 250 260",
    asia: "525 40 470 410"
  };
  let selected = "US";
  const project = ([longitude, latitude]) => [
    ((longitude + 180) / 360) * 1000,
    ((90 - latitude) / 180) * 500
  ];
  function el(tag, attributes = {}, parent) {
    const node = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
    if (parent) parent.append(node);
    return node;
  }
  function makeRing(points) {
    return points.map((point, i) => {
      const [x, y] = project(point);
      return (i === 0 ? "M" : "L") + x.toFixed(2) + " " + y.toFixed(2);
    }).join(" ") + " Z";
  }
  function geometryPath(geometry) {
    if (geometry.type === "Polygon") return geometry.coordinates.map(makeRing).join(" ");
    if (geometry.type === "MultiPolygon") {
      return geometry.coordinates.flatMap(polygon => polygon.map(makeRing)).join(" ");
    }
    return "";
  }
  function setRegion(region) {
    if (!Object.hasOwn(views, region)) return;
    svg.setAttribute("viewBox", views[region]);
    for (const button of document.querySelectorAll("[data-region]")) {
      const active = button.dataset.region === region;
      button.classList.toggle("is-current", active);
      button.setAttribute("aria-pressed", String(active));
    }
  }
  function setSelected(code, adjustRegion = false) {
    if (!markets.has(code)) return;
    selected = code;
    for (const card of cards) {
      const active = card.dataset.code === code;
      card.classList.toggle("is-selected", active);
      card.querySelector("[data-select]")?.setAttribute("aria-pressed", String(active));
    }
    for (const path of countriesLayer.querySelectorAll("[data-market]")) {
      path.classList.toggle("is-focused", path.dataset.market === code);
    }
    for (const marker of markerLayer.querySelectorAll("[data-marker]")) {
      const active = marker.dataset.marker === code;
      marker.classList.toggle("is-selected", active);
      marker.setAttribute("aria-pressed", String(active));
    }
    if (adjustRegion) setRegion(code === "GB" ? "europe" : ["US", "CA", "MX"].includes(code) ? "americas" : "asia");
  }
  function buildGraticule() {
    for (const x of [125, 250, 375, 500, 625, 750, 875]) {
      el("line", { x1: x, y1: 0, x2: x, y2: 500, class: "map-gridline" }, gridLayer);
    }
    for (const y of [83.33, 166.67, 250, 333.33, 416.67]) {
      el("line", { x1: 0, y1: y, x2: 1000, y2: y, class: "map-gridline" }, gridLayer);
    }
  }
  function buildMarkers() {
    for (const [code, marker] of Object.entries(markers)) {
      if (!markets.has(code)) continue;
      const [x, y] = project([marker.longitude, marker.latitude]);
      const group = el("g", {
        class: expectedMarkets.has(code) ? "map-marker map-marker-expected" : "map-marker",
        "data-marker": code, tabindex: "0", role: "button",
        "aria-label": "Select " + marker.label +
          (expectedMarkets.has(code) ? " — press report, not launched" : " — Meta-confirmed"),
        "aria-pressed": "false"
      }, markerLayer);
      el("circle", { cx: x, cy: y, r: 11, class: "map-marker-halo" }, group);
      el("circle", { cx: x, cy: y, r: 5.5, class: "map-marker-pin" }, group);
      const label = el("text", {
        x: x + marker.dx, y: y + marker.dy,
        "text-anchor": marker.anchor || "start", class: "map-marker-text"
      }, group);
      label.textContent = marker.label;
      el("title", {}, group).textContent = marker.label + (expectedMarkets.has(code)
        ? " — press-reported launch plans; not Meta-confirmed" : " — Meta-confirmed rollout");
      group.addEventListener("click", () => setSelected(code, false));
      group.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setSelected(code, false);
        }
      });
    }
  }
  for (const card of cards) {
    card.querySelector("[data-select]")?.addEventListener("click", () => setSelected(card.dataset.code, true));
  }
  for (const button of document.querySelectorAll("[data-region]")) {
    button.addEventListener("click", () => setRegion(button.dataset.region));
  }
  async function renderMap() {
    try {
      const response = await fetch("../data/world-countries.json", { cache: "force-cache" });
      if (!response.ok) throw new Error("Map boundaries unavailable");
      const data = await response.json();
      if (data.type !== "FeatureCollection" || !Array.isArray(data.features) || data.features.length < 100) {
        throw new Error("Invalid map boundaries");
      }
      const fragment = document.createDocumentFragment();
      for (const country of data.features) {
        if (!country.geometry) continue;
        const d = geometryPath(country.geometry);
        if (!d) continue;
        const code = country.code;
        const confirmed = confirmedMarkets.has(code);
        const expected = expectedMarkets.has(code);
        const path = el("path", {
          d, "fill-rule": "evenodd",
          class: confirmed ? "map-land map-land-confirmed" :
            expected ? "map-land map-land-expected" : "map-land",
          ...(confirmed || expected ? { "data-market": code } : {})
        }, fragment);
        if (confirmed || expected) {
          path.addEventListener("click", () => setSelected(code, false));
          el("title", {}, path).textContent =
            markets.get(code).querySelector(".country-copy strong").textContent +
            (expected ? " — reported only, not yet launched" : " — Meta-confirmed rollout");
        }
      }
      countriesLayer.append(fragment);
      buildMarkers();
      setSelected(selected);
      status.hidden = true;
    } catch {
      status.textContent = "The map could not load. The five Meta-confirmed markets and separate UK press report are still listed below.";
    }
  }
  buildGraticule();
  renderMap();
})();
