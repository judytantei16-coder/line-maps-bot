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

function extractLatLng(url) {
  const decoded = decodeURIComponent(url);
  const latLngMatch = decoded.match(/@(-?\d+\.\d+),(-?\d+\.\d+),/);
  if (latLngMatch) {
    return {
      lat: parseFloat(latLngMatch[1]),
      lng: parseFloat(latLngMatch[2]),
    };
  }
  // q=lat,lng 形式
  const qMatch = decoded.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (qMatch) {
    return {
      lat: parseFloat(qMatch[1]),
      lng: parseFloat(qMatch[2]),
    };
  }
  return { lat: null, lng: null };
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

// LINEのテキストから施設名を抽出する
// 例: "六本木ヒルズ・港区, 東京都" → "六本木ヒルズ"
function extractNameFromLineText(text) {
  if (!text) return null;
  // 「・」や「,」の前の部分が施設名
  const match = text.match(/^([^・,，、\n]+)/);
  if (match) return match[1].trim();
  return text.trim();
}

async function urlToReportText(mapsUrl, lineText) {
  const expandedUrl = mapsUrl.includes("goo.gl")
    ? await expandShortUrl(mapsUrl)
    : mapsUrl;

  console.log("展開後URL:", expandedUrl);

  const { lat, lng } = extractLatLng(expandedUrl);

  // LINEテキストから施設名を抽出
  const facilityName = extractNameFromLineText(lineText);
  console.log("抽出施設名:", facilityName, "| 緯度経度:", lat, lng);

  // 施設名がない or 住所っぽい場合は住所ピン扱い
  const isAddressPin =
    !facilityName ||
    /^〒/.test(facilityName) ||
    /^\d/.test(facilityName) ||
    /[都道府県市区町村]\d/.test(facilityName);

  if (isAddressPin && lat != null && lng != null) {
    const address = await reverseGeocode(lat, lng);
    return `${address}へ入る。`;
  }

  if (!facilityName) {
    throw new Error("施設名を特定できませんでした");
  }

  const place = await searchPlaceNew(facilityName);
  if (!place) {
    throw new Error("該当する場所が見つかりませんでした");
  }

  return formatPlaceText(place);
}

module.exports = { urlToReportText };
