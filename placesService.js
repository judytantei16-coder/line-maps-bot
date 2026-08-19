const axios = require("axios");

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

async function searchPlaceNew(query, hint) {
  // クエリ：URLから抽出した名前 or LINEのテキストから抽出したヒント
  const searchQuery = query || hint;
  console.log("検索クエリ:", searchQuery);

  const res = await axios.post(
    "https://places.googleapis.com/v1/places:searchText",
    {
      textQuery: searchQuery,
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

async function expandShortUrl(shortUrl) {
  const res = await axios.get(shortUrl, {
    maxRedirects: 10,
    validateStatus: (status) => status < 400,
  });
  return res.request?.res?.responseUrl || res.request?.responseURL || shortUrl;
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

  // 住所ピン判定：名前がない、〒・数字のみ・都道府県名のみ
  const isAddressPin =
    !name ||
    /^〒/.test(name) ||
    /^[-\d.,]+$/.test(name);

  return { name, lat, lng, isAddressPin };
}

async function urlToReportText(mapsUrl, lineText) {
  const expandedUrl = mapsUrl.includes("goo.gl")
    ? await expandShortUrl(mapsUrl)
    : mapsUrl;

  console.log("展開後URL:", expandedUrl);

  const { name, lat, lng, isAddressPin } = parseMapsUrl(expandedUrl);

  // 住所ピンかつ緯度経度あり → 住所だけ返す
  if (isAddressPin && lat != null && lng != null) {
    const address = await reverseGeocode(lat, lng);
    return `${address}へ入る。`;
  }

  // 施設名をURLから取得 or LINEテキストから取得
  const searchQuery = name || lineText;
  if (!searchQuery) {
    throw new Error("施設名を特定できませんでした");
  }

  const place = await searchPlaceNew(searchQuery, lineText);
  if (!place) {
    throw new Error("該当する場所が見つかりませんでした");
  }

  return formatPlaceText(place);
}

module.exports = { urlToReportText };
