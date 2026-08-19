const axios = require("axios");

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

async function expandShortUrl(shortUrl) {
  const res = await axios.get(shortUrl, {
    maxRedirects: 10,
    validateStatus: (status) => status < 400,
  });
  return res.request?.res?.responseUrl || res.request?.responseURL || shortUrl;
}

function extractPlaceId(url) {
  const decoded = decodeURIComponent(url);
  const m = decoded.match(/!1s(ChIJ[A-Za-z0-9_-]+)/);
  if (m) return m[1];
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

  const isAddressPin = !name || /^〒/.test(name) || /^[-\d.,]+$/.test(name);

  console.log("parseMapsUrl:", { name, lat, lng, isAddressPin });
  return { name, lat, lng, isAddressPin };
}

async function findPlaceIdNew(name, lat, lng) {
  const body = {
    textQuery: name,
    languageCode: "ja",
  };
  if (lat != null && lng != null) {
    body.locationBias = {
      circle: {
        center: { latitude: lat, longitude: lng },
        radius: 500,
      },
    };
  }

  const res = await axios.post(
    "https://places.googleapis.com/v1/places:searchText",
    body,
    {
      headers: {
        "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.primaryTypeDisplayName",
        "Content-Type": "application/json",
      },
      params: { languageCode: "ja" },
    }
  );

  const place = res.data?.places?.[0];
  if (!place) return null;
  return place;
}

async function getPlaceDetailsNew(placeId) {
  const res = await axios.get(
    `https://places.googleapis.com/v1/places/${placeId}`,
    {
      headers: {
        "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
        "X-Goog-FieldMask": "id,displayName,formattedAddress,primaryTypeDisplayName",
      },
      params: { languageCode: "ja" },
    }
  );
  return res.data;
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
  const name = place.displayName?.text || place.name || "";
  const address = stripPostalCode(place.formattedAddress || "");
  const label = place.primaryTypeDisplayName?.text || null;

  console.log("業種判定:", name, "→", label);

  if (label) {
    return `${address}に所在する${label}'${name}'へ入る。`;
  } else {
    return `${address}に所在する'${name}'へ入る。`;
  }
}

async function urlToReportText(mapsUrl) {
  const expandedUrl = mapsUrl.includes("goo.gl")
    ? await expandShortUrl(mapsUrl)
    : mapsUrl;

  console.log("展開後URL:", expandedUrl);

  // Place IDが直接取れる場合
  const directPlaceId = extractPlaceId(expandedUrl);
  if (directPlaceId) {
    console.log("Place ID直接取得:", directPlaceId);
    const place = await getPlaceDetailsNew(directPlaceId);
    return formatPlaceText(place);
  }

  const { name, lat, lng, isAddressPin } = parseMapsUrl(expandedUrl);

  // 住所ピンの場合
  if (isAddressPin && lat != null && lng != null) {
    const address = await reverseGeocode(lat, lng);
    return `${address}へ入る。`;
  }

  if (!name) {
    throw new Error("URLから店名を抽出できませんでした");
  }

  const place = await findPlaceIdNew(name, lat, lng);
  if (!place) {
    throw new Error("該当する場所が見つかりませんでした");
  }

  return formatPlaceText(place);
}

module.exports = { urlToReportText };
