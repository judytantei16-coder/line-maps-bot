require("dotenv").config();
const express = require("express");
const line = require("@line/bot-sdk");
const { urlToReportText, urlToDebug } = require("./placesService");

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const app = express();
const client = new line.Client(config);

const MAPS_URL_REGEX =
  /(https?:\/\/maps\.app\.goo\.gl\/\S+|https?:\/\/(?:www\.)?google\.com\/maps\S*|https?:\/\/goo\.gl\/maps\/\S+)/;

app.post("/webhook", line.middleware(config), async (req, res) => {
  res.status(200).end();
  const events = req.body.events || [];
  for (const event of events) {
    handleEvent(event).catch((err) => console.error("イベント処理エラー:", err));
  }
});

async function handleEvent(event) {
  if (event.type !== "message" || event.message.type !== "text") return;
  const match = event.message.text.match(MAPS_URL_REGEX);
  if (!match) return;
  try {
    const replyText = await urlToReportText(match[1]);
    await client.replyMessage(event.replyToken, { type: "text", text: replyText });
  } catch (err) {
    console.error("整形処理エラー:", err.message);
    try {
      await client.replyMessage(event.replyToken, {
        type: "text",
        text: "すみません、この場所の情報をうまく取得できませんでした。",
      });
    } catch (e) {
      console.error("返信失敗:", e.message);
    }
  }
}

// ブラウザから動作確認する用
// 例: https://line-maps-bot.onrender.com/debug?url=https://maps.app.goo.gl/xxxx
app.get("/debug", async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).type("text/plain; charset=utf-8").send("?url=... を付けてください");
  try {
    const r = await urlToDebug(url);
    res.type("application/json; charset=utf-8").send(
      JSON.stringify(
        {
          text: r.text,
          route: r.route,
          finalUrl: r.finalUrl,
          parsed: r.info,
          displayName: r.place && r.place.displayName ? r.place.displayName.text : null,
          genre: r.place && r.place.primaryTypeDisplayName ? r.place.primaryTypeDisplayName.text : null,
          formattedAddress: r.place ? r.place.formattedAddress : null,
        },
        null,
        2
      )
    );
  } catch (e) {
    res.status(500).type("text/plain; charset=utf-8").send("ERROR: " + e.message + "\n" + e.stack);
  }
});

app.get("/", (req, res) => res.send("LINE Maps Bot is running."));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("サーバー起動: ポート " + PORT));
