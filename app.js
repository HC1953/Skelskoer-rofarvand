/* ============================================================
   CONFIG — edit MID if the club ever moves to a different My Maps map
   ============================================================ */
const MID = "1gDs8klI6_od136Da73EF5AhGZRY3sfk";
const KML_SOURCE_URL = `https://www.google.com/maps/d/kml?mid=${MID}&forcekml=1`;

// Public CORS proxies, tried in order. Google's KML export endpoint doesn't
// send CORS headers, so a proxy is required for a browser-side fetch to work.
// See README.md for a more reliable self-hosted alternative.
const PROXIES = [
  (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url) => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
];

const STORAGE_KEY = "hazard-chart:last-kml";
const STORAGE_TS_KEY = "hazard-chart:last-fetch";
const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // re-sync every 5 min while app is open
const STALE_AFTER_MS = 30 * 60 * 1000;     // flag as "stale" after 30 min without a fresh sync

/* ============================================================
   MAP SETUP
   ============================================================ */
const map = L.map("map", { zoomControl: false, attributionControl: false });
L.control.zoom({ position: "bottomleft" }).addTo(map);
L.control.attribution({ position: "bottomright", prefix: false })
  .addAttribution('Map data &copy; OpenStreetMap contributors')
  .addTo(map);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
}).addTo(map);

// Fallback view (roughly centered on Denmark) until real data or geolocation arrives.
map.setView([55.4, 11.35], 12);

const markersLayer = L.layerGroup().addTo(map);
let allPlacemarks = [];
let activeFolder = "All";

/* ============================================================
   KML PARSING
   ============================================================ */
function stripHtml(str) {
  const div = document.createElement("div");
  div.innerHTML = str || "";
  return div.textContent || div.innerText || "";
}

function folderClass(name) {
  const n = (name || "").toLowerCase();
  if (n.includes("hazard") || n.includes("danger") || n.includes("warn")) return "folder-hazard";
  return "folder-landmark";
}

function parseKML(kmlText) {
  const xml = new DOMParser().parseFromString(kmlText, "text/xml");
  if (xml.querySelector("parsererror")) throw new Error("KML parse error");

  const results = [];

  function walk(node, folderName) {
    for (const child of Array.from(node.children)) {
      if (child.tagName === "Folder") {
        const fName = child.querySelector(":scope > name")?.textContent?.trim() || folderName;
        walk(child, fName);
      } else if (child.tagName === "Placemark") {
        const point = child.querySelector("Point > coordinates");
        if (!point) continue; // skip lines/polygons for a hazard-pin map
        const [lng, lat] = point.textContent.trim().split(",").map(Number);
        if (Number.isNaN(lat) || Number.isNaN(lng)) continue;

        const name = child.querySelector(":scope > name")?.textContent?.trim() || "Untitled point";
        const rawDesc = child.querySelector(":scope > description")?.textContent?.trim() || "";

        results.push({
          name,
          description: stripHtml(rawDesc),
          lat,
          lng,
          folder: folderName || "General",
        });
      }
    }
  }

  walk(xml.documentElement, "General");
  return results;
}

/* ============================================================
   MARKERS
   ============================================================ */
function hazardIconSVG(color) {
  return `
    <svg width="30" height="30" viewBox="0 0 30 30" xmlns="http://www.w3.org/2000/svg">
      <polygon points="15,2 28,15 15,28 2,15" fill="${color}" stroke="#16202B" stroke-width="1.5"/>
      <rect x="13.2" y="8.5" width="3.6" height="9" rx="1.8" fill="#16202B"/>
      <circle cx="15" cy="20.3" r="2.1" fill="#16202B"/>
    </svg>`;
}

function makeIcon(folder) {
  const color = folderClass(folder) === "folder-hazard" ? "#C1442C" : "#3E6E63";
  return L.divIcon({
    className: "hazard-pin",
    html: hazardIconSVG(color),
    iconSize: [30, 30],
    iconAnchor: [15, 22],
    popupAnchor: [0, -20],
  });
}

function renderMarkers() {
  markersLayer.clearLayers();
  const visible = allPlacemarks.filter(
    (p) => activeFolder === "All" || p.folder === activeFolder
  );

  visible.forEach((p) => {
    const marker = L.marker([p.lat, p.lng], { icon: makeIcon(p.folder) });
    marker.on("click", () => openSheet(p));
    marker.addTo(markersLayer);
  });

  if (visible.length && allPlacemarks.length === visible.length) {
    // Only auto-fit on first full render, not on every filter change,
    // so the map doesn't jump around while someone is exploring.
  }
}

function fitToData() {
  if (!allPlacemarks.length) return;
  const bounds = L.latLngBounds(allPlacemarks.map((p) => [p.lat, p.lng]));
  map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
}

/* ============================================================
   FILTER CHIPS
   ============================================================ */
const chipsEl = document.getElementById("chips");

function renderChips() {
  const folders = ["All", ...new Set(allPlacemarks.map((p) => p.folder))];
  chipsEl.innerHTML = "";
  folders.forEach((f) => {
    const btn = document.createElement("button");
    btn.className = "chip" + (f === activeFolder ? " active" : "");
    btn.textContent = f;
    btn.addEventListener("click", () => {
      activeFolder = f;
      renderChips();
      renderMarkers();
    });
    chipsEl.appendChild(btn);
  });
}

/* ============================================================
   BOTTOM SHEET
   ============================================================ */
const sheet = document.getElementById("sheet");
const backdrop = document.getElementById("sheetBackdrop");
const sheetTag = document.getElementById("sheetTag");
const sheetTitle = document.getElementById("sheetTitle");
const sheetBody = document.getElementById("sheetBody");
const sheetCoords = document.getElementById("sheetCoords");
const sheetDirections = document.getElementById("sheetDirections");

function openSheet(p) {
  sheetTag.textContent = p.folder;
  sheetTag.className = "sheet-tag " + folderClass(p.folder);
  sheetTitle.textContent = p.name;
  sheetBody.innerHTML = p.description
    ? `<p>${p.description.replace(/\n/g, "<br>")}</p>`
    : `<p style="opacity:0.6">No further details on the chart for this point.</p>`;
  sheetCoords.textContent = `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;
  sheetDirections.href = `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;

  sheet.classList.add("open");
  backdrop.classList.add("open");
}

function closeSheet() {
  sheet.classList.remove("open");
  backdrop.classList.remove("open");
}

backdrop.addEventListener("click", closeSheet);

/* ============================================================
   LIVE SYNC
   ============================================================ */
const syncDot = document.getElementById("syncDot");
const syncLabel = document.getElementById("syncLabel");
const refreshBtn = document.getElementById("refreshBtn");
const mapMessage = document.getElementById("mapMessage");

function setSyncStatus(state, label) {
  syncDot.className = "sync-dot" + (state === "ok" ? "" : ` ${state}`);
  syncLabel.textContent = label;
}

function formatAgo(ts) {
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return "just now";
  if (mins === 1) return "1 min ago";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  return `${hrs}h ago`;
}

async function fetchLiveKML() {
  let lastErr;
  for (const buildUrl of PROXIES) {
    try {
      const res = await fetch(buildUrl(KML_SOURCE_URL), { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (!text.includes("<kml")) throw new Error("Unexpected response");
      return text;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error("All proxies failed");
}

async function sync({ isManual = false } = {}) {
  if (isManual) refreshBtn.classList.add("spinning");
  setSyncStatus("ok", isManual ? "Syncing…" : syncLabel.textContent);

  try {
    const kmlText = await fetchLiveKML();
    const parsed = parseKML(kmlText);
    if (!parsed.length) throw new Error("No points found in map");

    const isFirstLoad = allPlacemarks.length === 0;
    allPlacemarks = parsed;
    localStorage.setItem(STORAGE_KEY, kmlText);
    localStorage.setItem(STORAGE_TS_KEY, String(Date.now()));

    renderChips();
    renderMarkers();
    mapMessage.classList.add("hidden");
    if (isFirstLoad) fitToData();

    setSyncStatus("ok", `Synced ${formatAgo(Date.now())}`);
  } catch (err) {
    console.error("Sync failed:", err);
    const lastTs = Number(localStorage.getItem(STORAGE_TS_KEY) || 0);
    if (allPlacemarks.length) {
      setSyncStatus("error", `Sync failed · showing cached data`);
    } else {
      setSyncStatus("error", "Sync failed · no cached data");
      mapMessage.innerHTML = `Couldn't load the hazard chart.<br>Check your connection and tap refresh.`;
      mapMessage.classList.remove("hidden");
    }
  } finally {
    if (isManual) refreshBtn.classList.remove("spinning");
  }
}

function loadFromCache() {
  const cached = localStorage.getItem(STORAGE_KEY);
  const ts = Number(localStorage.getItem(STORAGE_TS_KEY) || 0);
  if (!cached) return false;
  try {
    allPlacemarks = parseKML(cached);
    renderChips();
    renderMarkers();
    fitToData();
    const stale = Date.now() - ts > STALE_AFTER_MS;
    setSyncStatus(stale ? "stale" : "ok", `Synced ${formatAgo(ts)}`);
    return true;
  } catch {
    return false;
  }
}

refreshBtn.addEventListener("click", () => sync({ isManual: true }));

/* ============================================================
   INSTALL HINT (iOS has no beforeinstallprompt, so show manual steps)
   ============================================================ */
function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function maybeShowInstallHint() {
  if (isStandalone()) return;
  if (localStorage.getItem("hazard-chart:hint-dismissed")) return;

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const hint = document.getElementById("installHint");
  hint.innerHTML = isIOS
    ? `<button class="close-hint" id="hintClose">✕</button><b>Add to Home Screen:</b> tap Share <span style="font-family:sans-serif">⬆︎</span>, then "Add to Home Screen".`
    : `<button class="close-hint" id="hintClose">✕</button><b>Install this app:</b> open the browser menu and choose "Add to Home screen" or "Install app".`;
  hint.classList.add("show");
  document.getElementById("hintClose").addEventListener("click", () => {
    hint.classList.remove("show");
    localStorage.setItem("hazard-chart:hint-dismissed", "1");
  });
}

/* ============================================================
   BOOT
   ============================================================ */
loadFromCache();
sync();
setInterval(() => sync(), REFRESH_INTERVAL_MS);
setTimeout(maybeShowInstallHint, 1800);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((e) => console.warn("SW failed:", e));
  });
}
