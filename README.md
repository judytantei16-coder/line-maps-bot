# LINE Maps Bot - セットアップ手順

GoogleマップのURLをLINEに送ると、報告書向けのテキストに整形して返信するBotです。

```
コンビニエンスストア「セブン-イレブン 港区芝１丁目店」(東京都港区芝1丁目12-7)
```

---

## 1. 必要なアカウントを準備する

### (1) LINE Developers
1. https://developers.line.biz/ja/ にアクセスし、LINEアカウントでログイン
2. 「プロバイダー」を新規作成（会社名や個人名でOK）
3. 「Messaging APIチャネル」を新規作成
   - チャネル名: 例）SKR事務担当AI
   - 業種などは適当でOK
4. 作成後、チャネルの管理画面で以下を控える
   - **チャネルアクセストークン**（「Messaging API設定」タブ→「発行」ボタン）
   - **チャネルシークレット**（「チャネル基本設定」タブ）
5. 「Messaging API設定」タブで
   - 「応答メッセージ」を **オフ**
   - 「Webhookの利用」を **オン**
   （Webhook URLは手順3で設定します）

### (2) Google Cloud Platform
1. https://console.cloud.google.com/ にアクセスし、プロジェクトを新規作成
2. 「APIとサービス」→「ライブラリ」から以下を有効化
   - **Places API**
3. 「認証情報」→「認証情報を作成」→「APIキー」でAPIキーを発行
4. 課金設定（クレジットカード登録）が必要ですが、月$200分の無料クレジットがあり、この用途なら通常無料枠内に収まります

---

## 2. コードを準備する

1. このフォルダ一式をダウンロード
2. `.env.example` を `.env` にリネームし、中身を書き換える

```
LINE_CHANNEL_ACCESS_TOKEN=（LINE Developersで控えたトークン）
LINE_CHANNEL_SECRET=（LINE Developersで控えたシークレット）
GOOGLE_MAPS_API_KEY=（Google Cloudで発行したAPIキー）
```

3. ターミナルで以下を実行し、必要なパッケージをインストール

```bash
npm install
```

4. ローカルで起動確認

```bash
npm start
```

「サーバー起動: http://localhost:3000」と表示されればOKです。

---

## 3. インターネット上に公開する（デプロイ）

LINEのWebhookはインターネットからアクセスできるURLが必要です。無料で使えるおすすめは **Render** です。

1. https://render.com/ にGitHubアカウント等で登録
2. このコード一式をGitHubリポジトリにpush
3. Renderで「New +」→「Web Service」→ 該当リポジトリを選択
4. 以下を設定
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Environment Variables に `.env` の3つの値を登録
5. デプロイ完了後に発行されるURL（例: `https://your-app.onrender.com`）を控える

---

## 4. LINEにWebhook URLを設定する

1. LINE Developersの「Messaging API設定」タブに戻る
2. 「Webhook URL」に以下を入力

```
https://your-app.onrender.com/webhook
```

3. 「検証」ボタンを押して成功すればOK
4. QRコードから自分のスマホでLINE公式アカウントを友だち追加

---

## 5. テストする

友だち追加したLINE公式アカウントに、GoogleマップでURLを共有して送信します。
「〇〇「店名」(住所)」の形式で返信が来れば成功です。

---

## つまずきやすいポイント

- **Renderの無料プランはしばらく使わないとスリープする**ため、初回の返信が数十秒遅れることがあります（動作としては正常）
- **短縮URL(maps.app.goo.gl)の展開結果は端末やGoogleの仕様変更で形式が変わることがある**ため、うまく取得できない場合は `placesService.js` の `parseMapsUrl` の正規表現を調整してください
- **業種ラベルが「施設」としか出ない場合**は `typeLabels.js` に該当する `types` を追加してください（LINEでURLを送った際に一度 `console.log(place.types)` をしてみると、どんな値が来ているか確認できます）
