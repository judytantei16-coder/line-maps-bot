// Google Places API の `types` を日本語ラベルに変換するテーブル
// 上から順にマッチさせるので、より具体的な分類を上に書く
// 参考: https://developers.google.com/maps/documentation/places/web-service/place-types

const TYPE_LABELS = {
  // 美容・健康
  hair_care: "美容院",
  beauty_salon: "美容院",
  spa: "エステ・スパ",
  gym: "ジム",

  // 駐車・交通
  parking: "駐車場",
  gas_station: "ガソリンスタンド",
  car_repair: "自動車整備工場",
  car_wash: "洗車場",
  train_station: "駅",
  bus_station: "バス停",

  // 飲食
  restaurant: "レストラン",
  cafe: "カフェ",
  bakery: "パン屋",
  bar: "バー",
  meal_takeaway: "テイクアウト店",

  // 小売
  convenience_store: "コンビニエンスストア",
  supermarket: "スーパーマーケット",
  department_store: "百貨店",
  shopping_mall: "ショッピングモール",
  clothing_store: "衣料品店",
  hardware_store: "ホームセンター",
  home_goods_store: "生活雑貨店",
  electronics_store: "家電量販店",

  // 医療・公共
  hospital: "病院",
  doctor: "医院",
  dentist: "歯科医院",
  pharmacy: "薬局",
  physiotherapist: "整骨院・整体院",
  city_hall: "市役所・区役所",
  post_office: "郵便局",
  bank: "銀行",
  atm: "ATM",
  police: "警察署",
  fire_station: "消防署",

  // 宿泊・不動産
  lodging: "宿泊施設",
  real_estate_agency: "不動産会社",

  // 建設・現場関連（現場用途で頻出しそうなもの）
  general_contractor: "建設会社",
  electrician: "電気工事業者",
  plumber: "配管工事業者",
  roofing_contractor: "屋根工事業者",
  storage: "倉庫・トランクルーム",

  // 教育・宗教・その他施設
  school: "学校",
  university: "大学",
  place_of_worship: "宗教施設",
  park: "公園",
  library: "図書館",
  gym_school: "体育館",
};

/**
 * Places APIのtypes配列から、日本語の業種ラベルを1つ選んで返す
 * @param {string[]} types
 * @returns {string}
 */
function getJapaneseLabel(types = []) {
  for (const t of types) {
    if (TYPE_LABELS[t]) return TYPE_LABELS[t];
  }
  return "施設"; // どれにもマッチしなかった場合のデフォルト
}

module.exports = { getJapaneseLabel, TYPE_LABELS };
