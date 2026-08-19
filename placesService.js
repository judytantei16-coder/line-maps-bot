"use strict";

const GOOGLE_API_KEY =
  process.env.GOOGLE_MAPS_API_KEY || "AIzaSyBjnXNH_yOh687RqZhszfeldxYAc0iLRoY";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

const genreCache = new Map();

/* ============ 1. 短縮URLを展開 ============ */
async function expandUrl(shortUrl) {
  let current = shortUrl;
  let html = "";
  for (let i = 0; i < 10; i++) {
    let res;
    try {
      res = await fetch(current, {
        redirect: "manual",
        headers: { "User-Agent": UA, "Accept-Language": "ja-JP,ja;q=0.9" },
      });
    } catch (e) {
      console.error("[expand] fetch失敗:", e.message);
      break;
    }
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      current = new URL(loc, current).toString();
      continue;
    }
    try {
      const ct = res.headers.get("content-type") || "";
      if (ct.includes("text/html")) html = await res.text();
    } catch (e) {}
    break;
  }
  console.log("[expand] finalUrl =", current);
  return { finalUrl: current, html };
}

/* ============ 2. URLから手がかりを抽出 ============ */
function parseMapsUrl(finalUrl, html) {
  const info = { ftid: null, placeId: null, query: null, name: null, lat: null, lng: null };
  const hay = finalUrl + "\n" + (html || "");

  let u = null;
  try { u = new URL(finalUrl); } catch (e) {}

  if (u) {
    const p = u.searchParams;
    info.ftid = p.get("ftid");
    info.placeId = p.get("place_id") || p.get("query_place_id");
    info.query = p.get("q") || p.get("query");
    const ll = p.get("ll") || p.get("center");
    if (ll && /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(ll)) {
      const parts = ll.split(",");
      info.lat = Number(parts[0]);
      info.lng = Number(parts[1]);
    }
    const mp = u.pathname.match(/\/place\/([^/@]+)/);
    if (mp) {
      try { info.name = decodeURIComponent(mp[1].replace(/\+/g, " ")); } catch (e) {}
    }
  }

  if (!info.ftid) {
    const m =
      hay.match(/[?&]ftid=(0x[0-9a-f]+:0x[0-9a-f]+)/i) ||
      hay.match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i);
    if (m) info.ftid = m[1];
  }

  if (!info.placeId) {
    const m =
      hay.match(/[?&](?:query_)?place_id=([^&"'\s]+)/) ||
      hay.match(/"(ChI[A-Za-z0-9_\-]{20,})"/);
    if (m) info.placeId = m[1];
  }

  if (info.lat === null) {
    const m =
      hay.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) ||
      hay.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
    if (m) { info.lat = Number(m[1]); info.lng = Number(m[2]); }
  }

  if (info.query && /^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(info.query.trim())) {
    const parts = info.query.split(",");
    if (info.lat === null) { info.lat = Number(parts[0]); info.lng = Number(parts[1]); }
  }

  console.log("[parse]", JSON.stringify(info));
  return info;
}

/* ============ 3. Google API ============ */
async function placeIdFromFtid(ftid) {
  const url =
    "https://maps.googleapis.com/maps/api/place/details/json" +
    "?ftid=" + encodeURIComponent(ftid) +
    "&language=ja&fields=place_id,name,formatted_address,types&key=" + GOOGLE_API_KEY;
  try {
    const res = await fetch(url);
    const json = await res.json();
    console.log("[ftid->placeId] status =", json.status, json.error_message || "");
    if (json.status === "OK" && json.result && json.result.place_id) return json.result.place_id;
  } catch (e) {
    console.error("[ftid->placeId] 例外:", e.message);
  }
  return null;
}

async function getPlaceDetails(placeId) {
  const url =
    "https://places.googleapis.com/v1/places/" + encodeURIComponent(placeId) +
    "?languageCode=ja&regionCode=JP";
  try {
    const res = await fetch(url, {
      headers: {
        "X-Goog-Api-Key": GOOGLE_API_KEY,
        "X-Goog-FieldMask":
          "id,displayName,formattedAddress,addressComponents," +
          "primaryTypeDisplayName,primaryType,types,location",
      },
    });
    const json = await res.json();
    if (!res.ok) {
      console.error("[details] エラー:", JSON.stringify(json).slice(0, 400));
      return null;
    }
    console.log("[details] name =", json.displayName && json.displayName.text,
      "/ primaryType =", json.primaryType,
      "/ genre =", json.primaryTypeDisplayName && json.primaryTypeDisplayName.text);
    return json;
  } catch (e) {
    console.error("[details] 例外:", e.message);
    return null;
  }
}

async function searchText(query, lat, lng) {
  const body = { textQuery: query, languageCode: "ja", regionCode: "JP", maxResultCount: 1 };
  if (lat !== null && lng !== null) {
    body.locationBias = { circle: { center: { latitude: lat, longitude: lng }, radius: 300 } };
  }
  try {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_API_KEY,
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.formattedAddress,places.addressComponents," +
          "places.primaryTypeDisplayName,places.primaryType,places.types,places.location",
      },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok || !json.places || json.places.length === 0) {
      console.log("[searchText] ヒットなし:", JSON.stringify(json).slice(0, 300));
      return null;
    }
    console.log("[searchText] OK:", json.places[0].displayName.text);
    return json.places[0];
  } catch (e) {
    console.error("[searchText] 例外:", e.message);
    return null;
  }
}

async function geocodeAddress(text) {
  const url =
    "https://maps.googleapis.com/maps/api/geocode/json?address=" +
    encodeURIComponent(text) + "&language=ja&region=jp&key=" + GOOGLE_API_KEY;
  try {
    const res = await fetch(url);
    const json = await res.json();
    console.log("[geocode] status =", json.status);
    if (json.status === "OK" && json.results[0]) return json.results[0].formatted_address;
  } catch (e) {
    console.error("[geocode] 例外:", e.message);
  }
  return null;
}

async function reverseGeocode(lat, lng) {
  const url =
    "https://maps.googleapis.com/maps/api/geocode/json?latlng=" + lat + "," + lng +
    "&language=ja&key=" + GOOGLE_API_KEY;
  try {
    const res = await fetch(url);
    const json = await res.json();
    console.log("[reverseGeocode] status =", json.status);
    if (json.status === "OK" && json.results[0]) return json.results[0].formatted_address;
  } catch (e) {
    console.error("[reverseGeocode] 例外:", e.message);
  }
  return null;
}

/* ====== 4. APIがジャンルを返さない時：マップページから表示ジャンルを読む ====== */
async function genreFromMapsPage(placeId, placeName) {
  if (!placeId) return null;
  if (genreCache.has(placeId)) return genreCache.get(placeId);

  const url =
    "https://www.google.com/maps/place/?q=place_id:" +
    encodeURIComponent(placeId) + "&hl=ja&gl=JP";
  let html = "";
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        "Accept-Language": "ja-JP,ja;q=0.9",
        Cookie: "CONSENT=YES+jp",
      },
    });
    html = await res.text();
  } catch (e) {
    console.error("[genrePage] fetch失敗:", e.message);
    return null;
  }

  const counts = new Map();
  const add = (s) => {
    if (!s) return;
    const t = s.trim();
    if (t.length < 2 || t.length > 20) return;
    if (!/[ぁ-んァ-ヶ一-龥]/.test(t)) return;
    if (placeName && t === placeName.trim()) return;
    if (/[0-9０-９]{3,}|http|営業|時間|レビュー|口コミ/.test(t)) return;
    counts.set(t, (counts.get(t) || 0) + 1);
  };

  let m;
  const re1 = /gcid:[a-z0-9_]+\\?",\\?"([^"\\]{2,20})\\?"/g;
  while ((m = re1.exec(html)) !== null) add(m[1]);
  const re2 = /\\"([^"\\]{2,20})\\",\\"gcid:[a-z0-9_]+/g;
  while ((m = re2.exec(html)) !== null) add(m[1]);

  if (counts.size === 0) {
    console.log("[genrePage] 抽出できず");
    genreCache.set(placeId, null);
    return null;
  }

  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  console.log("[genrePage] 候補 =", JSON.stringify([...counts.keys()].slice(0, 8)), "→ 採用:", best);
  genreCache.set(placeId, best);
  return best;
}

/* ====== 5. 並記カテゴリを1語に絞る ====== */
function shortenGenre(genre, placeName) {
  if (!genre) return "";
  const raw = String(genre).trim();
  const parts = raw.split(/[・･、,／\/]/).map((s) => s.trim()).filter(Boolean);
  if (parts.length <= 1) return raw;
  const name = String(placeName || "").replace(/\s|　/g, "");
  const hits = parts.filter((p) => name && name.includes(p)).sort((a, b) => b.length - a.length);
  const picked = hits.length > 0 ? hits[0] : parts[0];
  console.log("[genre] 並記 =", raw, "→ 採用:", picked);
  return picked;
}

/* ============ 6. 住所整形 ============ */
const norm = (s) => String(s || "").replace(/\s|　/g, "");

// 共通の下処理（「日本、」と郵便番号を除去）
function baseAddress(s) {
  if (!s) return "";
  let a = String(s).trim();
  a = a.replace(/^日本[、,\s]*/, "");
  a = a.replace(/^〒?[0-9０-９]{3}[-－−ー]?[0-9０-９]{4}\s*/, "");
  return a.trim();
}

// スタイル1用：ハイフンを全角に
function toStyle1Address(a) {
  return String(a || "").replace(/[-‐‑‒–—−]/g, "－").trim();
}

// スタイル2用：数字とハイフンを半角に
function toStyle2Address(a) {
  let s = String(a || "");
  s = s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  s = s.replace(/[－‐‑‒–—−ー]/g, "-");
  s = s.replace(/(\d)\s*-\s*(\d)/g, "$1-$2");
  return s.trim();
}

function stripNameFromAddress(address, name) {
  if (!address || !name) return address;
  const a = address.trim();
  const n = name.trim();
  if (norm(a).endsWith(norm(n))) {
    let cut;
    const idx = a.lastIndexOf(n);
    if (idx > 0) cut = a.slice(0, idx);
    else cut = a.slice(0, Math.max(0, a.length - n.length));
    cut = cut.replace(/[\s　,、]+$/, "").trim();
    if (cut) return cut;
  }
  return a;
}

const GEO_TYPES = new Set([
  "street_address", "premise", "subpremise", "route", "intersection",
  "postal_code", "plus_code", "geocode", "political", "locality",
  "sublocality", "sublocality_level_1", "sublocality_level_2",
  "sublocality_level_3", "sublocality_level_4",
  "administrative_area_level_1", "administrative_area_level_2",
  "administrative_area_level_3", "country",
]);

function looksLikeName(name) {
  const n = norm(name);
  if (!n) return false;
  if (/^(北海道|東京都|京都府|大阪府|.{2,3}県)/.test(n)) return false;
  if (/[0-9０-９][－\-‐ー]?[0-9０-９]*$/.test(n) && /[市区町村郡]/.test(n)) return false;
  if (/^〒?[0-9０-９]{3}/.test(n)) return false;
  return true;
}

/* ============ 7. 本体 ============ */
async function resolvePlace(inputUrl) {
  const expanded = await expandUrl(inputUrl);
  const info = parseMapsUrl(expanded.finalUrl, expanded.html);

  let place = null;
  let route = "none";

  if (info.placeId) {
    place = await getPlaceDetails(info.placeId);
    if (place) route = "place_id";
  }

  if (!place && info.ftid) {
    const pid = await placeIdFromFtid(info.ftid);
    if (pid) {
      place = await getPlaceDetails(pid);
      if (place) route = "ftid";
    }
  }

  if (!place && (info.query || info.name)) {
    const q = info.name ? (info.name + " " + (info.query || "")).trim() : info.query;
    const cand = await searchText(q, info.lat, info.lng);
    if (cand) {
      const nm = cand.displayName && cand.displayName.text ? cand.displayName.text : "";
      const allowed =
        Boolean(info.ftid) ||
        Boolean(info.name) ||
        (nm && info.query && norm(info.query).includes(norm(nm)));
      if (allowed) { place = cand; route = "searchText"; }
      else console.log("[searchText] 住所ピンと判断して不採用:", nm);
    }
  }

  let name = "";
  if (place && place.displayName && place.displayName.text) {
    const cand = place.displayName.text.trim();
    if (looksLikeName(cand)) name = cand;
  }

  let address = "";
  if (place) address = baseAddress(place.formattedAddress);

  if (!address && info.query && !/^-?\d+\.\d+,/.test(info.query.trim())) {
    address = baseAddress(await geocodeAddress(info.query)) || baseAddress(info.query);
  }
  if (!address && info.lat !== null) {
    address = baseAddress(await reverseGeocode(info.lat, info.lng));
  }
  if (!address && info.query) address = baseAddress(info.query);

  if (name) address = stripNameFromAddress(address, name);

  let genreRaw = "";
  let genre = "";
  let genreSource = "none";

  if (name && place) {
    if (place.primaryTypeDisplayName && place.primaryTypeDisplayName.text) {
      genreRaw = place.primaryTypeDisplayName.text;
      genreSource = "api";
    } else {
      const g = await genreFromMapsPage(place.id || info.placeId, name);
      if (g) { genreRaw = g; genreSource = "mapsPage"; }
    }
    genre = shortenGenre(genreRaw, name);
  }

  console.log("[result] route =", route, "/ name =", name, "/ genre =", genre,
    "(" + genreSource + ") / address =", address);
  return {
    finalUrl: expanded.finalUrl, info, place, route,
    name, address, genreRaw, genre, genreSource,
  };
}

/* ============ 8. スタイル別の文言組み立て ============ */
function formatStyle1(r) {
  const addr = toStyle1Address(r.address);
  if (r.name && addr) {
    return r.genre
      ? addr + "に所在する" + r.genre + "'" + r.name + "'へ入る。"
      : addr + "に所在する'" + r.name + "'へ入る。";
  }
  if (r.name && !addr) {
    return r.genre ? r.genre + "'" + r.name + "'へ入る。" : "'" + r.name + "'へ入る。";
  }
  if (!addr) throw new Error("住所を特定できませんでした");
  return addr + "へ入る。";
}

function formatStyle2(r) {
  const addr = toStyle2Address(r.address);
  if (r.name) {
    const head = r.genre ? r.genre + "「" + r.name + "」" : "「" + r.name + "」";
    return addr ? head + "(" + addr + ")" : head;
  }
  if (!addr) throw new Error("住所を特定できませんでした");
  return addr;
}

function formatByStyle(r, style) {
  return style === 2 ? formatStyle2(r) : formatStyle1(r);
}

async function urlToReportText(inputUrl, style) {
  const r = await resolvePlace(inputUrl);
  return formatByStyle(r, style === 2 ? 2 : 1);
}

async function urlToDebug(inputUrl) {
  const r = await resolvePlace(inputUrl);
  return { ...r, style1: safe(() => formatStyle1(r)), style2: safe(() => formatStyle2(r)) };
}

function safe(fn) {
  try { return fn(); } catch (e) { return "ERROR: " + e.message; }
}

module.exports = { urlToReportText, urlToDebug };
