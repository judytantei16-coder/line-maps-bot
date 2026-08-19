const axios = require("axios");

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

async function expandShortUrl(shortUrl) {
  const res = await axios.get(shortUrl, {
    maxRedirects: 10,
    validateStatus: (status) => status < 400,
  });
  const finalUrl =
    res.request?.res?.responseUrl || res.request?.responseURL || shortUrl;
  console.log("展開後URL:", finalUrl);
  return finalUrl;
}

function extractPlaceId(url) {
  const decoded = decodeURIComponent(url);
  // Place IDはURLに "1s0x..." または "place_id=..." の形式で含まれることがある
  const m1 = decoded.match(/!1s(ChIJ[A-Za-z0-9_-]+)/);
  if (m1) return m1[1];
  const m2 = decoded.match(/place_id=([A-Za-z0-9_-]+)/);
  if (m2) return m2[1];
  return null;
}

function parseMapsUrl(url) {
  const decoded = decodeURIComponent(url);

  let nameMatch = decoded.match(/\/place\/([^/@?]+)/);
  let name = nameMatch ? nameMatch[1].replace(/\+/g, " ").trim() : null;

  if (!name) {
    const qMatch = decoded.match(/[?&]q=([^&]+)/);
    if (qMatch) name = decodeURIComponent(qMatch[1].replace(/\+/g, " ")).trim();
  }

  const latLngMatch = decoded.match(/@(-?\d+\.\d+),(-?\d+\.\d+),/);
  const lat = latLngMatch ? parseFloat(latLngMatch[1]) : null;
  const lng = latLngMatch ? parseFloat(latLngMatch[2]) : null;

  const isAddressPin =
    !name ||
    /^\d/.test(name) ||
    /^〒/.test(name) ||
    /^[-\d.,]+$/.test(name) ||
    /[都道府県市区町村]/.test(name);

  console.log("parseMapsUrl:", { name, lat, lng, isAddressPin });
  return { name, lat, lng, isAddressPin };
}

async function findPlaceId({ name, lat, lng }) {
  const params = {
    input: name,
    inputtype: "textquery",
    fields: "place_id",
    key: GOOGLE_MAPS_API_KEY,
  };
  if (lat != null && lng != null) {
    params.locationbias = `point:${lat},${lng}`;
  }
  const res = await axios.get(
    "https://maps.googleapis.com/maps/api/place/findplacefromtext/json",
    { params }
  );
  const candidate = res.data?.candidates?.[0];
  if (!candidate) return null;
  return candidate.place_id;
}

async function getPlaceDetails(placeId) {
  const res = await axios.get(
    "https://maps.googleapis.com/maps/api/place/details/json",
    {
      params: {
        place_id: placeId,
        fields: "name,formatted_address,types,editorial_summary",
        language: "ja",
        key: GOOGLE_MAPS_API_KEY,
      },
    }
  );
  if (res.data.status !== "OK") {
    throw new Error(`Places API error: ${res.data.status}`);
  }
  return res.data.result;
}

async function reverseGeocode(lat, lng) {
  const res = await axios.get(
    "https://maps.googleapis.com/maps/api/geocode/json",
    {
      params: {
        latlng: `${lat},${lng}`,
        language: "ja",
        key: GOOGLE_MAPS_API_KEY,
      },
    }
  );
  const result = res.data?.results?.[0];
  if (!result) throw new Error("住所を取得できませんでした");
  return stripPostalCode(result.formatted_address);
}

function stripPostalCode(address) {
  return address
    .replace(/^日本、?\s*/, "")
    .replace(/^〒?\d{3}-?\d{4}\s*/, "");
}

const TYPE_LABELS = {
  convenience_store: "コンビニエンスストア",
  supermarket: "スーパーマーケット",
  department_store: "百貨店",
  shopping_mall: "ショッピングモール",
  clothing_store: "衣料品店",
  hardware_store: "ホームセンター",
  home_goods_store: "生活雑貨店",
  electronics_store: "家電量販店",
  restaurant: "飲食店",
  cafe: "カフェ",
  bakery: "パン屋",
  bar: "バー",
  meal_takeaway: "飲食店",
  hair_care: "美容院",
  beauty_salon: "美容院",
  spa: "エステ・スパ",
  gym: "ジム",
  dentist: "歯科医院",
  veterinary_care: "動物病院",
  hospital: "病院",
  doctor: "医院",
  pharmacy: "薬局",
  physiotherapist: "整骨院・整体院",
  city_hall: "市役所・区役所",
  post_office: "郵便局",
  bank: "銀行",
  atm: "ATM",
  police: "警察署",
  fire_station: "消防署",
  lodging: "宿泊施設",
  real_estate_agency: "不動産会社",
  general_contractor: "建設会社",
  storage: "倉庫・トランクルーム",
  school: "学校",
  university: "大学",
  place_of_worship: "宗教施設",
  park: "公園",
  library: "図書館",
  train_station: "駅",
  bus_station: "バス停",
  gas_station: "ガソリンスタンド",
  car_repair: "自動車整備工場",
  parking: "駐車場",
  tourist_attraction: "観光スポット",
  amusement_park: "遊園地",
  museum: "博物館・美術館",
  stadium: "スタジアム",
  movie_theater: "映画館",
  night_club: "ナイトクラブ",
  apartment_complex: "集合住宅",
};

const PRIORITY_ORDER = [
  "convenience_store", "supermarket", "department_store", "shopping_mall",
  "clothing_store", "hardware_store", "home_goods_store", "electronics_store",
  "restaurant", "cafe", "bakery", "bar", "meal_takeaway",
  "hair_care", "beauty_salon", "spa", "gym",
  "dentist", "veterinary_care", "hospital", "doctor", "pharmacy", "physiotherapist",
  "city_hall", "post_office", "police", "fire_station",
  "school", "university", "place_of_worship", "library",
  "tourist_attraction", "amusement_park", "museum", "stadium", "movie_theater",
  "train_station", "bus_station", "gas_station", "car_repair",
  "lodging", "real_estate_agency", "general_contractor", "storage",
  "night_club", "apartment_complex", "parking", "park",
];

function getLabel(types = []) {
  for (const t of PRIORITY_ORDER) {
    if (types.includes(t)) return TYPE_LABELS[t];
  }
  return null;
}

function formatPlaceText(place) {
  const address = stripPostalCode(place.formatted_address || "");
  const label = getLabel(place.types);
  const summary = place.editorial_summary?.overview || null;
  console.log("業種判定:", place.name, "→", label, "| summary:", summary, "| types:", place.types);

  if (label) {
    return `${address}に所在する${label}'${place.name}'へ入る。`;
  } else if (summary) {
    // editorial_summaryから最初の単語（「複合施設」「公共施設」など）を使う
    const firstWord = summary.replace(/[、。].*/g, "").split(/[、，,\s]/)[0];
    return `${address}に所在する${firstWord}'${place.name}'へ入る。`;
  } else {
    return `${address}に所在する'${place.name}'へ入る。`;
  }
}

async function urlToReportText(mapsUrl) {
  const expandedUrl = mapsUrl.includes("goo.gl")
    ? await expandShortUrl(mapsUrl)
    : mapsUrl;

  // まずPlace IDが直接取れるか試す
  const directPlaceId = extractPlaceId(expandedUrl);
  if (directPlaceId) {
    console.log("Place ID直接取得:", directPlaceId);
    const place = await getPlaceDetails(directPlaceId);
    return formatPlaceText(place);
  }

  const { name, lat, lng, isAddressPin } = parseMapsUrl(expandedUrl);

  if (isAddressPin && lat != null && lng != null) {
    const address = await reverseGeocode(lat, lng);
    return `${address}へ入る。`;
  }

  if (!name) {
    console.error("店名抽出失敗。展開後URL:", expandedUrl);
    throw new Error("URLから店名を抽出できませんでした");
  }

  const placeId = await findPlaceId({ name, lat, lng });
  if (!placeId) {
    console.error("場所が見つからない:", name);
    throw new Error("該当する場所が見つかりませんでした");
  }

  const place = await getPlaceDetails(placeId);
  return formatPlaceText(place);
}

module.exports = { urlToReportText, parseMapsUrl, expandShortUrl };
