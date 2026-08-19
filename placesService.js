const axios = require("axios");

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

async function searchPlaceNew(query) {
  console.log("検索クエリ:", query);

  const res = await axios.post(
    "https://places.googleapis.com/v1/places:searchText",
    {
      textQuery: query,
      languageCode: "ja",
    },
    {
      headers: {
        "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
        "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.primaryTypeDisplayName",
        "Content-Type": "application/json",
      },
    }
  );

  const place = res.data?.places?.[0];
  console.log("検索結果:", JSON.stringify(place));
  return place || null;
}

async function expandShortUrl(shortUrl) {
  const res = await axios.get(shortUrl, {
    maxRedirects: 10,
    validateStatus: (status) => status < 400,
  });
  return res.request?.res?.responseUrl || res.request?.responseURL || shortUrl;
}

function extractFacilityName(url) {
  const decoded = decodeURIComponent(url);

  // /place/施設名/ の形式から抽出
  const placeMatch = decoded.match(/\/place\/([^/@?]+)/);
  if (placeMatch) {
    const name = placeMatch[1].replace(/\+/g, " ").trim();
    // 住所っぽくない（〒・数字始まり・都道府県のみでない）場合だけ使う
    if (name && !/^〒/.test(name) && !/^[-\d.,]+$/.test(name)) {
      return name;
    }
  }
  return null;
}

function extractLatLng(url) {
  const decoded = decodeURIComponent(url);
  const latLngMatch = decoded.match(/@(-?\d+\.\d+),(-?\d+\.\d+),/);
  if (latLngMatch) {
    return {
      lat: parseFloat(latLngMatch[1]),
      lng: parseFloat(latLngMatch[2]),
    };
  }
  return { lat: null, lng: null };
}

function isAddressOnlyUrl(url) {
  const decoded = decodeURIComponent(url);
  // /place/ がない、またはqパラメータが住所形式
  const hasPlacePath = /\/place\//.test(decoded);
  if (!hasPlacePath) return true;

  const placeMatch = decoded.match(/\/place\/([^/@?]+)/);
  if (!placeMatch) return true;

  const name = placeMatch[1].replace(/\+/g, " ").trim();
  return /^〒/.test(name) || /^[-\d.,]+$/.test(name);
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

function formatPlaceText(place) {
  const name = place.displayName?.text || "";
  const address = stripPostalCode(place.formattedAddress || "");
  const label = place.primaryTypeDisplayName?.text || null;

  console.log("業種判定:", name, "→", label);

  if (label) {
    return `${address}に所在する${label}'${name}'へ入る。`;
  } else {
    return `${address}に所在する'${name}'へ入る。`;
  }
}

async function urlToReportText(mapsUrl, lineText) {
  const expandedUrl = mapsUrl.includes("goo.gl")
    ? await expandShortUrl(mapsUrl)
    : mapsUrl;

  console.log("展開後URL:", expandedUrl);

  // 住所ピン判定
  if (isAddressOnlyUrl(expandedUrl)) {
    const { lat, lng } = extractLatLng(expandedUrl);
    if (lat != null && lng != null) {
      const address = await reverseGeocode(lat, lng);
      return `${address}へ入る。`;
    }
  }

  // 施設名をURLから抽出
  const facilityName = extractFacilityName(expandedUrl);

  // 検索クエリは施設名のみ（住所なし）
  const searchQuery = facilityName || lineText;
  if (!searchQuery) {
    throw new Error("施設名を特定できませんでした");
  }

  const place = await searchPlaceNew(searchQuery);
  if (!place) {
    throw new Error("該当する場所が見つかりませんでした");
  }

  return formatPlaceText(place);
}

module.exports = { urlToReportText };
