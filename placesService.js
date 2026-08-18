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

  // 店名部分: /place/<name> の後ろが「/」「@」「?」のいずれか、または文字列の終わりまで
  let nameMatch = decoded.match(/\/place\/([^/@?]+)/);
  let name = nameMatch ? nameMatch[1].replace(/\+/g, " ").trim() : null;

  // フォールバック1: q=店名 のようなクエリパラメータ形式（/maps?q=... など）
  if (!name) {
    const qMatch = decoded.match(/[?&]q=([^&]+)/);
    if (qMatch) {
      name = decodeURIComponent(qMatch[1].replace(/\+/g, " ")).trim();
    }
  }

  // フォールバック2: /maps/search/<name>/ 形式（あいまい検索でリダイレクトされた場合）
  if (!name) {
    const searchMatch = decoded.match(/\/maps\/search\/([^/@?]+)/);
    if (searchMatch) {
      name = searchMatch[1].replace(/\+/g, " ").trim();
    }
  }

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
 * 郵便番号部分・先頭の「日本、」表記を住所テキストから除去する
 * （〒981-3218 東京都〜 のように、都道府県から始まる表記に整える）
 */
function stripPostalCode(address) {
  return address
    .replace(/^日本、?\s*/, "")
    .replace(/^〒?\d{3}-?\d{4}\s*/, "");
}

/**
 * 報告書向けのテキストに整形する
 * 例: 千葉県富津市亀沢６１９に所在するホテル'GLAMPROOK FUTTSU BRISTOL HILL（グランルーク富津ブリストルヒル）'へ入る。
 */
function formatPlaceText(place) {
  const label = getJapaneseLabel(place.types, place.name);
  const address = stripPostalCode(place.formatted_address || "");
  // デバッグ用: 業種判定に使った実際のtypesを毎回ログに残す
  // （「施設」判定になった場合の原因調査や、ラベル追加の判断に使う）
  console.log("業種判定:", place.name, "→", label, "| types:", place.types);
  return `${address}に所在する${label}'${place.name}'へ入る。`;
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
    // デバッグ用: 実際に展開されたURLをログに残す（次回の原因調査のため）
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
