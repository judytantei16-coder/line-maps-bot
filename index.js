require("dotenv").config();
const express = require("express");
const line = require("@line/bot-sdk");
const { urlToReportText } = require("./placesService");

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const app = express();
const client = new line.Client(config);

// GoogleマップURLを検出する正規表現
// maps.app.goo.gl（短縮）と www.google.com/maps（通常）の両方に対応
const MAPS_URL_REGEX =
  /(https?:\/\/maps\.app\.goo\.gl\/\S+|https?:\/\/(?:www\.)?google\.com\/maps\/\S+|https?:\/\/goo\.gl\/maps\/\S+)/;

// LINEのWebhookエンドポイント（署名検証つき）
app.post("/webhook", line.middleware(config), async (req, res) => {
  // 先にLINE側へ200を返す（LINEは応答が遅いとリトライしてくるため）
  res.status(200).end();

  const events = req.body.events || [];
  for (const event of events) {
    handleEvent(event).catch((err) => {
      console.error("イベント処理エラー:", err);
    });
  }
});

async function handleEvent(event) {
  if (event.type !== "message" || event.message.type !== "text") return;

  const text = event.message.text;
  const match = text.match(MAPS_URL_REGEX);
  if (!match) return; // GoogleマップURLが含まれていないメッセージは無視

  const mapsUrl = match[1];

  try {
    const replyText = await urlToReportText(mapsUrl);
    await client.replyMessage(event.replyToken, {
      type: "text",
      text: replyText,
    });
  } catch (err) {
    console.error("整形処理エラー:", err.message);
    await client.replyMessage(event.replyToken, {
      type: "text",
      text: "すみません、この場所の情報をうまく取得できませんでした。",
    });
  }
}

// 動作確認用（ブラウザで開いてサーバーが動いているか確認できる）
app.get("/", (req, res) => {
  res.send("LINE Maps Bot is running.");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`サーバー起動: http://localhost:${PORT}`);
});
