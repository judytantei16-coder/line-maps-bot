// Google Places API の `types` を日本語ラベルに変換するテーブル
// 上から順にマッチさせるので、より具体的な分類を上に書く
// 参考: https://developers.google.com/maps/documentation/places/web-service/place-types

// 判定の優先順位（上にあるものほど「その場所の本来の業種」として優先される）
// atm・bank・parkingなどは他業態に併設されることが多いため、優先順位を下げてある
const PRIORITY_ORDER = [
  // 小売（コンビニ等の主業態を、ATM等の付帯設備より優先）
  "convenience_store",
  "supermarket",
  "department_store",
  "shopping_mall",
  "clothing_store",
  "hardware_store",
  "home_goods_store",
  "electronics_store",

  // 飲食
  "restaurant",
  "cafe",
  "bakery",
  "bar",
  "meal_takeaway",

  // 美容・健康
  "hair_care",
  "beauty_salon",
  "spa",
  "gym",

  // 医療（より専門性の高いものを先に判定）
  "dentist",
  "veterinary_care",
  "physiotherapist",
  "hospital",
  "doctor",
  "pharmacy",

  // 建設・現場関連
  "general_contractor",
  "electrician",
  "plumber",
  "roofing_contractor",
  "storage",

  // 宿泊・不動産
  "lodging",
  "real_estate_agency",

  // 公共・教育・宗教
  "city_hall",
  "post_office",
  "police",
  "fire_station",
  "school",
  "university",
  "place_of_worship",
  "park",
  "library",

  // 交通（駅・バス停は単独施設なので中間の優先度）
  "train_station",
  "bus_station",
  "gas_station",
  "car_repair",
  "car_wash",

  // 付帯設備・汎用施設（他業態に併設されやすいので最後）
  "bank",
  "atm",
  "parking",
];

// 日本語ラベルの辞書
const TYPE_LABELS = {
  hair_care: "美容院",
  beauty_salon: "美容院",
  spa: "エステ・スパ",
  gym: "ジム",
  parking: "駐車場",
  gas_station: "ガソリンスタンド",
  car_repair: "自動車整備工場",
  car_wash: "洗車場",
  train_station: "駅",
  bus_station: "バス停",
  restaurant: "飲食店",
  cafe: "飲食店",
  bakery: "パン屋",
  bar: "飲食店",
  meal_takeaway: "飲食店",
  meal_delivery: "飲食店",
  food: "飲食店",
  night_club: "飲食店",
  convenience_store: "コンビニエンスストア",
  supermarket: "スーパーマーケット",
  department_store: "百貨店",
  shopping_mall: "ショッピングモール",
  clothing_store: "衣料品店",
  hardware_store: "ホームセンター",
  home_goods_store: "生活雑貨店",
  electronics_store: "家電量販店",
  hospital: "病院",
  doctor: "医院",
  dentist: "歯科医院",
  veterinary_care: "動物病院",
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
  electrician: "電気工事業者",
  plumber: "配管工事業者",
  roofing_contractor: "屋根工事業者",
  storage: "倉庫・トランクルーム",
  school: "学校",
  university: "大学",
  place_of_worship: "宗教施設",
  park: "公園",
  library: "図書館",
};

// 建物名に含まれやすいキーワードから「集合住宅」を判定する
// Google側のtypesに業種が含まれない住宅系の建物（マンション等）を拾うためのフォールバック
const APARTMENT_NAME_KEYWORDS = [
  "マンション",
  "ハイツ",
  "コーポ",
  "アパート",
  "タワー",
  "レジデンス",
  "ヴィラ",
  "パレス",
  "コート",
  "ハイム",
  "テラス",
  "ハウス",
  "ドミール",
  "ヒルズ",
  "スカイ",
  "ガーデン",
  "パーク",
  "フラット",
  "メゾン",
];

/**
 * 建物名から「集合住宅」らしさを判定する
 * @param {string} name
 * @returns {boolean}
 */
function looksLikeApartment(name = "") {
  return APARTMENT_NAME_KEYWORDS.some((keyword) => name.includes(keyword));
}

// Google側が「業種」ではなく「住所・建物」としてしか情報を返さない場合のtype
// これらが含まれる場合、集合住宅・建物である可能性が高い
const BUILDING_TYPES = ["premise", "subpremise", "street_address"];

/**
 * typesに住所・建物系のtypeが含まれているかを判定する
 * @param {string[]} types
 * @returns {boolean}
 */
function looksLikeBuildingType(types = []) {
  return BUILDING_TYPES.some((t) => types.includes(t));
}

/**
 * Places APIのtypes配列から、日本語の業種ラベルを1つ選んで返す
 * Google側の返却順ではなく、PRIORITY_ORDER（自前の優先順位）に沿って判定する
 * 業種が判定できない場合、建物名から「集合住宅」かどうかをフォールバック判定する
 * @param {string[]} types
 * @param {string} name
 * @returns {string}
 */
function getJapaneseLabel(types = [], name = "") {
  for (const priorityType of PRIORITY_ORDER) {
    if (types.includes(priorityType)) {
      return TYPE_LABELS[priorityType];
    }
  }
  // 業種が判定できなかった場合、建物名のキーワード、または
  // Google側のtypeが住所・建物系（premise等）であれば「集合住宅」として扱う
  if (looksLikeApartment(name) || looksLikeBuildingType(types)) {
    return "集合住宅";
  }
  return "施設"; // どれにもマッチしなかった場合のデフォルト
}

module.exports = { getJapaneseLabel, TYPE_LABELS, PRIORITY_ORDER };
