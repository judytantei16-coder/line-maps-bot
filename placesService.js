const axios = require("axios");
const { getJapaneseLabel } = require("./typeLabels");

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

/**
 * maps.app.goo.gl の短縮URLをリダイレクト追跡して、
 * 展開後の実URL（店名・緯度経度入り）を取得する
 * @param {string} shortUrl
 * @returns {Promise<string>} 展開後のURL
 */
async function expandShortUrl(shortUrl) {
  const res = await axios.get(shortUrl, {
    maxRedirects: 5,
    // 最終的なリダイレクト先のURLを取得したいだけなので、
    // レスポンス内容は不要（headのみでも良いがgoo.glはHEADを弾く場合があるのでGETにする）
    validateStatus: (status) => status < 400,
  });
  // axiosはリダイレクトを自動で追うので、最終URLは res.request.res.responseUrl 等に入る
  const finalUrl =
    res.request?.res?.responseUrl || res.request?.responseURL || shortUrl;
  return finalUrl;
}

/**
 * 展開後のGoogleマップURLから、店名と緯度経度を抜き出す
 * 例: https://www.google.com/maps/place/セブン-イレブン+港区芝１丁目店/@35.649,139.748,17z/data=...
 * @param {string} url
 * @returns {{name: string|null, lat: number|null, lng: number|null}}
 */
function parseMapsUrl(url) {
  const decoded = decodeURIComponent(url);

  // 店名部分: /place/<name>/ の間を取得
  const nameMatch = decoded.match(/\/place\/([^/]+)\//);
  const name = nameMatch ? nameMatch[1].replace(/\+/g, " ") : null;

  // 緯度経度: /@<lat>,<lng>,<zoom>z/ の部分を取得
  const latLngMatch = decoded.match(/@(-?\d+\.\d+),(-?\d+\.\d+),/);
  const lat = latLngMatch ? parseFloat(latLngMatch[1]) : null;
  const lng = latLngMatch ? parseFloat(latLngMatch[2]) : null;

  return { name, lat, lng };
}

/**
 * 店名と緯度経度から、Google Places API (Find Place From Text) で
 * 該当施設のplace_idを特定する
 */
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

/**
 * place_idから施設の詳細情報（店名・住所・業種・評価）を取得する
 */
async function getPlaceDetails(placeId) {
  const res = await axios.get(
    "https://maps.googleapis.com/maps/api/place/details/json",
    {
      params: {
        place_id: placeId,
        fields: "name,formatted_address,types,rating,user_ratings_total",
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

/**
 * 郵便番号部分を住所テキストから除去する（〒981-3218 のような表記を消す）
 */
function stripPostalCode(address) {
  return address.replace(/^〒?\d{3}-?\d{4}\s*/, "");
}

/**
 * 報告書向けのテキストに整形する
 * 例: コンビニエンスストア「セブン-イレブン 港区芝１丁目店」(東京都港区芝1丁目12-7)
 */
function formatPlaceText(place) {
  const label = getJapaneseLabel(place.types);
  const address = stripPostalCode(place.formatted_address || "");
  return `${label}「${place.name}」(${address})`;
}

/**
 * GoogleマップのURL（短縮・展開どちらでも可）を受け取り、
 * 報告書向けの整形済みテキストを返すメイン関数
 * @param {string} mapsUrl
 * @returns {Promise<string>}
 */
async function urlToReportText(mapsUrl) {
  const expandedUrl = mapsUrl.includes("goo.gl")
    ? await expandShortUrl(mapsUrl)
    : mapsUrl;

  const { name, lat, lng } = parseMapsUrl(expandedUrl);
  if (!name) {
    throw new Error("URLから店名を抽出できませんでした");
  }

  const placeId = await findPlaceId({ name, lat, lng });
  if (!placeId) {
    throw new Error("該当する場所が見つかりませんでした");
  }

  const place = await getPlaceDetails(placeId);
  return formatPlaceText(place);
}

module.exports = { urlToReportText, parseMapsUrl, expandShortUrl };
