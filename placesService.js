const axios = require("axios");

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

async function expandShortUrl(shortUrl) {
  const res = await axios.get(shortUrl, {
    maxRedirects: 10,
    validateStatus: (status) => status < 400,
  });
  const finalUrl =
    res.request?.res?.responseUrl || res.request?.responseURL || shortUrl;
  return finalUrl;
}

function parseMapsUrl(url) {
  const decoded = decodeURIComponent(url);

  let nameMatch = decoded.match(/\/place\/([^/@?]+)/);
  let name = nameMatch ? nameMatch[1].replace(/\+/g, " ").trim() : null;

  if (!name) {
    const qMatch = decoded.match(/[?&]q=([^&]+)/);
    if (qMatch) name = decodeURIComponent(qMatch[1].replace(/\+/g, " ")).trim();
  }

  if (!name) {
    const searchMatch = decoded.match(/\/maps\/search\/([^/@?]+)/);
    if (searchMatch) name = searchMatch[1].replace(/\+/g, " ").trim();
  }

  const latLngMatch = decoded.match(/@(-?\d+\.\d+),(-?\d+\.\d+),/);
  const lat = latLngMatch ? parseFloat(latLngMatch[1]) : null;
  const lng = latLngMatch ? parseFloat(latLngMatch[2]) : null;

  const hasPlacePath = /\/place\//.test(decoded);
  const isAddressPin =
    !hasPlacePath ||
    !name ||
    /^\d/.test(name) ||
    /^〒/.test(name) ||
    /^[-\d.,]+$/.test(name);

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
  // Places API (New) を使用してprimaryTypeDisplayNameを取得
  const res = await axios.get(
    `https://places.googleapis.com/v1/places/${placeId}`,
    {
      headers: {
        "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
        "X-Goog-FieldMask": "displayName,formattedAddress,primaryTypeDisplayName",
      },
      params: { languageCode: "ja" },
    }
  );

  if (!res.data) {
    throw new Error("Places API (New) error");
  }
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

async function urlToReportText(mapsUrl) {
  const expandedUrl = mapsUrl.includes("goo.gl")
    ? await expandShortUrl(mapsUrl)
    : mapsUrl;

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
    console.error("場所が見つからない。抽出した店名:", name, "URL:", expandedUrl);
    throw new Error("該当する場所が見つかりませんでした");
  }

  const place = await getPlaceDetails(placeId);
  return formatPlaceText(place);
}

module.exports = { urlToReportText, parseMapsUrl, expandShortUrl };
