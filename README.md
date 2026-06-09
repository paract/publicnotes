# Public Notes

Codexと一緒に内省ログをHTML化し、トップページへ自動で並べるための静的サイト生成キットです。

このリポジトリは、そのままGitHub Pagesで公開できる個人ノートサイトとしても、他者が複製して使うテンプレートとしても使えます。

## できること

- `notes/*.html` からトップページ `index.html` を生成する
- 最新順でカード一覧を表示する
- ハッシュタグで絞り込む
- 各HTMLに紹介文とインフォグラフィックを付ける運用をCodexに任せる
- GitHub Pagesなどの静的ホスティングで公開する

## 使い方

### 既存プロジェクトでビルド

```bash
npm install
npm run build
```

生成された `index.html` をGitHub Pagesなどで公開します。

### 新しいプロジェクトを作る

```bash
npx @paract/publicnotes init
npm install
npm run build
```

`init` は次のファイルを作ります。

- `AGENTS.md`
- `publicnotes.config.json`
- `notes/sample-note-2026-01-01.html`
- `assets/`
- `package.json`

## Codexへの依頼例

```text
AGENTS.md を読んで、この内省ログをHTML化して。
末尾に他者紹介用メモと、内容に合った16:9のインフォグラフィックを追加して。
npm run build を実行し、GitHubへpushして。
```

## 設定

`publicnotes.config.json` でトップページの文言を変更できます。

```json
{
  "siteTitle": "思考デバッガー",
  "siteDescription": "内省と言語化の記録",
  "notesDir": "notes",
  "outputFile": "index.html",
  "requireInfographics": true
}
```

既存ログには図解を後から付けず、新規ログから必須にしたい場合は、次のように開始日を指定できます。

```json
{
  "requireInfographics": true,
  "infographicRequiredFrom": "2026-06-09"
}
```

## ノートHTMLの必須要素

ダッシュボードは以下を読み取ります。

- `h1`: カードタイトル
- `.source p`: カード本文抜粋
- `.question p`: 深掘り問い
- `[aria-labelledby="share-title"] p`: 他者紹介用メモ

紹介文は「内省ログ」「ノート」という語を使わず、他者に語りかける自然な文章にする運用を推奨します。

## 公開手順

1. GitHubにリポジトリを作る
2. このプロジェクトをpushする
3. GitHub Pagesを有効化する
4. Sourceを `main` branch / root にする
5. `https://<user>.github.io/<repo>/` にアクセスする

## Codexに任せられること

- HTMLノート作成
- 紹介文作成
- インフォグラフィック生成と保存
- `npm run build`
- `git add .`
- `git commit`
- `git push`

ユーザーが決める必要があるのは、サイト名、公開範囲、残したいログの内容です。

## npmパッケージとして配布する場合

このリポジトリはnpmパッケージとして配布できる構成です。公開する場合はnpmログイン後に次を実行します。

```bash
npm pack
npm publish --access public
```

公開前に、個人ログを含めないことを確認してください。`.npmignore` では `notes/`、`assets/`、`index.html` を配布対象から外しています。
