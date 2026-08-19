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

// 環境変数 DEFAULT_STYLE で全体の初期スタイルを変えられる（1 か 2）
const DEFAULT_STYLE = process.env.DEFAULT_STYLE === "2" ? 2 : 1;

// ユーザー/グループごとのスタイル記憶（サーバー再起動でリセット）
const styleMap = new Map();

function scopeIdOf(event) {
  const s = event.source || {};
  return s.groupId || s.roomId || s.userId || "unknown";
}

function getStyle(event) {
  return styleMap.get(scopeIdOf(event)) || DEFAULT_STYLE;
}

function setStyle(event, style) {
  styleMap.set(scopeIdOf(event), style);
}

function parseStyleCommand(text) {
  const t = text.trim().replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  if (/^(スタイル|style)\s*1$/i.test(t)) return 1;
  if (/^(スタイル|style)\s*2$/i.test(t)) return 2;
  if (/^(スタイル|style)$/i.test(t)) return 0; // 現在の設定を表示
  return null;
}

app.post("/webhook", line.middleware(config), async (req, res) => {
  res.status(200).end();
  const events = req.body.events || [];
  for (const event of events) {
    handleEvent(event).catch((err) => console.error("イベント処理エラー:", err));
  }
});

async function handleEvent(event) {
  if (event.type !== "message" || event.message.type !== "text") return;
  const text = event.message.text;

  // --- スタイル切替コマンド ---
  const cmd = parseStyleCommand(text);
  if (cmd !== null) {
    let msg;
    if (cmd === 0) {
      const cur = getStyle(event);
      msg =
        "現在のスタイル: " + cur + "\n\n" +
        "スタイル1: 東京都港区芝１丁目１２－７に所在するコンビニエンスストア'セブン－イレブン 港区芝１丁目店'へ入る。\n\n" +
        "スタイル2: コンビニエンスストア「セブン-イレブン 港区芝１丁目店」(東京都港区芝1丁目12-7)\n\n" +
        "「スタイル1」「スタイル2」と送ると切り替わります。";
    } else {
      setStyle(event, cmd);
      msg = "スタイル" + cmd + "に切り替えました。";
    }
    try {
      await client.replyMessage(event.replyToken, { type: "text", text: msg });
    } catch (e) {
      console.error("返信失敗:", e.message);
    }
    return;
  }

  // --- URL処理 ---
  const match = text.match(MAPS_URL_REGEX);
  if (!match) return;
  const style = getStyle(event);
  try {
    const replyText = await urlToReportText(match[1], style);
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

// 動作確認用: /debug?url=短縮URL
app.get("/debug", async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).type("text/plain; charset=utf-8").send("?url=... を付けてください");
  try {
    const r = await urlToDebug(url);
    res.type("application/json; charset=utf-8").send(
      JSON.stringify(
        {
          style1: r.style1,
          style2: r.style2,
          route: r.route,
          name: r.name,
          address: r.address,
          genre: r.genre,
          genreRaw: r.genreRaw,
          genreSource: r.genreSource,
          finalUrl: r.finalUrl,
          parsed: r.info,
          primaryType: r.place ? r.place.primaryType || null : null,
          types: r.place ? r.place.types || null : null,
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
