#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const jsdom = require('jsdom').JSDOM;

// タグ定義とキーワードマッピング
const tagDefinitions = {
  '#マインド': [
    'デバッガー', '思考', '問い', '内省', '深掘り', '突っ込み',
    '分解', 'ログ', '考える', '言語化', '資産化'
  ],
  '#未来感': [
    '近未来', '未来', '技術', '進歩', '進化', '次世代', 'Codex',
    'AI', '遠隔'
  ],
  '#道具性': [
    '拡張', '能力', '操作', '道具', '行為', '身体', '外側',
    'CodeX', '扱う', '動かす'
  ],
  '#感情': [
    '高揚', '照れ', '楽しい', '面白い', '快感', '喜び', '違和感',
    '美しい', '心地よい'
  ],
  '#違和感': [
    '意地悪', '固執', '雑', '銀紙', '隠す', 'でも', 'ただし',
    'ただ', '可能性', '混じる', 'うっかり'
  ]
};

// テキストからタグを自動生成
function extractTags(text) {
  const tags = [];
  const tagScores = {};

  // 各タグについてスコアを計算
  for (const [tag, keywords] of Object.entries(tagDefinitions)) {
    let score = 0;
    for (const keyword of keywords) {
      const regex = new RegExp(keyword, 'gi');
      const matches = text.match(regex);
      score += matches ? matches.length : 0;
    }
    if (score > 0) {
      tagScores[tag] = score;
    }
  }

  // スコア順にソートして上位2〜3個のタグを選択
  const sortedTags = Object.entries(tagScores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([tag]) => tag);

  return sortedTags;
}

// Gitに追加された時刻を優先し、未コミットの新規ファイルは更新時刻を使う
function getSortTime(filePath, stats) {
  try {
    const relativePath = path.relative(__dirname, filePath);
    const output = execFileSync(
      'git',
      ['log', '--diff-filter=A', '--format=%ct', '--', relativePath],
      { cwd: __dirname, encoding: 'utf-8' }
    ).trim();

    const firstTimestamp = output.split('\n').filter(Boolean).pop();
    if (firstTimestamp) {
      return Number(firstTimestamp) * 1000;
    }
  } catch {
    // Git情報が取れない環境ではファイル更新時刻にフォールバックする
  }

  return stats.mtimeMs;
}

// HTMLファイルからテキストを抽出
function extractTextFromHTML(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const stats = fs.statSync(filePath);
    const dom = new jsdom(content);
    const doc = dom.window.document;

    // タイトル取得
    const title = doc.querySelector('h1')?.textContent || 'Untitled';
    
    // 日付取得（ファイル名から）
    const filename = path.basename(filePath);
    const dateMatch = filename.match(/(\d{4})-(\d{2})-(\d{2})/);
    const date = dateMatch ? dateMatch[0] : 'Unknown';

    // ソース/引用部分を取得
    let excerpt = '';
    const sourceEl = doc.querySelector('.source p');
    if (sourceEl) {
      excerpt = sourceEl.textContent.trim().replace(/「|」/g, '').substring(0, 100);
    }

    // 質問を取得
    let question = '';
    const questionSection = doc.querySelector('.question');
    if (questionSection) {
      const questionText = questionSection.querySelector('p');
      if (questionText) {
        question = questionText.textContent.trim().substring(0, 100) + '…';
      }
    }

    // 他者紹介用メモを取得
    let shareSummary = '';
    const shareSection = doc.querySelector('[aria-labelledby="share-title"]');
    if (shareSection) {
      const shareText = shareSection.querySelector('p');
      if (shareText) {
        shareSummary = shareText.textContent.trim();
      }
    }

    // テキスト全体を結合（タグ抽出用）
    const fullText = [
      title,
      excerpt,
      question,
      shareSummary,
      doc.body.textContent
    ].join(' ');

    return {
      filename,
      title,
      date,
      sortTime: getSortTime(filePath, stats),
      excerpt,
      question,
      shareSummary,
      fullText
    };
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error.message);
    return null;
  }
}

// メイン処理
async function generateDashboard() {
  const notesDir = path.join(__dirname, 'notes');
  const files = fs.readdirSync(notesDir).filter(f => f.endsWith('.html'));

  const logs = [];

  // 各HTMLファイルを処理
  for (const file of files) {
    const filePath = path.join(notesDir, file);
    const data = extractTextFromHTML(filePath);
    
    if (data) {
      const tags = extractTags(data.fullText);
      logs.push({
        filename: file,
        date: data.date,
        sortTime: data.sortTime,
        title: data.title,
        excerpt: data.excerpt || data.fullText.substring(0, 100),
        question: data.question,
        shareSummary: data.shareSummary,
        tags: tags.length > 0 ? tags : ['#その他']
      });

      if (!data.shareSummary) {
        console.warn(`⚠ Missing share summary: ${file}`);
      } else if (/内省ログ|ノート/.test(data.shareSummary)) {
        console.warn(`⚠ Share summary contains banned wording: ${file}`);
      }
    }
  }

  // Gitに追加された時刻でソート（新しい順）。一括編集で順番が崩れないようにする。
  logs.sort((a, b) => b.sortTime - a.sortTime);

  // 全タグを収集してユニーク化
  const allTags = [];
  logs.forEach(log => {
    log.tags.forEach(tag => {
      if (!allTags.includes(tag)) {
        allTags.push(tag);
      }
    });
  });

  // index.htmlを生成。sortTimeは並び替え専用なので公開データからは外す。
  const publicLogs = logs.map(({ sortTime, shareSummary, ...log }) => log);
  const html = generateHTML(publicLogs, allTags);
  fs.writeFileSync(path.join(__dirname, 'index.html'), html);

  console.log(`✓ Dashboard generated with ${logs.length} logs and ${allTags.length} tags`);
}

function generateHTML(logs, tags) {
  const logsJSON = JSON.stringify(logs, null, 2);
  const tagsJSON = JSON.stringify(tags, null, 2);

  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>パラ式　思考デバッガー</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    html, body {
      width: 100%;
      height: 100%;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Yu Gothic", sans-serif;
      color: #1a3a52;
      background: linear-gradient(135deg, #f5f3f0 0%, #ededeb 100%);
      padding: 48px 24px;
      line-height: 1.6;
    }

    .container {
      width: 100%;
      max-width: 1400px;
      margin: 0 auto;
    }

    header {
      text-align: center;
      margin-bottom: 48px;
      padding-bottom: 40px;
      border-bottom: 2px solid #d9d4c8;
    }

    header h1 {
      font-size: clamp(2rem, 6vw, 3.2rem);
      font-weight: 600;
      letter-spacing: -0.5px;
      color: #0d2b4d;
      margin-bottom: 12px;
    }

    header p {
      font-size: 1rem;
      color: #667078;
      letter-spacing: 0.5px;
    }

    .filter-section {
      margin-bottom: 40px;
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      justify-content: center;
      align-items: center;
    }

    .filter-label {
      font-size: 0.9rem;
      font-weight: 600;
      color: #0d2b4d;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-right: 8px;
    }

    .tag-btn {
      padding: 8px 16px;
      border: 2px solid #0d2b4d;
      background: white;
      color: #0d2b4d;
      border-radius: 20px;
      cursor: pointer;
      font-size: 0.9rem;
      font-weight: 600;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      white-space: nowrap;
    }

    .tag-btn:hover {
      background: #0d2b4d;
      color: white;
      transform: translateY(-2px);
    }

    .tag-btn.active {
      background: #0d2b4d;
      color: white;
      box-shadow: 0 8px 16px rgba(13, 43, 77, 0.2);
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 28px;
      animation: fadeIn 0.6s ease-out;
    }

    @keyframes fadeIn {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .card {
      background: white;
      border: 1px solid #d9d4c8;
      border-left: 5px solid #0d2b4d;
      padding: 32px;
      border-radius: 4px;
      box-shadow: 0 8px 24px rgba(13, 43, 77, 0.08);
      cursor: pointer;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      height: 100%;
      text-decoration: none;
      color: inherit;
    }

    .card:hover {
      transform: translateY(-6px);
      box-shadow: 0 16px 40px rgba(13, 43, 77, 0.12);
      border-left-color: #4a7ba7;
    }

    .card.hidden {
      display: none;
    }

    .card-date {
      display: inline-block;
      font-size: 0.85rem;
      font-weight: 700;
      letter-spacing: 1px;
      color: #0d2b4d;
      margin-bottom: 16px;
      text-transform: uppercase;
    }

    .card-title {
      font-size: 1.4rem;
      font-weight: 600;
      line-height: 1.3;
      color: #0d2b4d;
      margin-bottom: 18px;
    }

    .card-excerpt {
      font-size: 0.95rem;
      color: #667078;
      line-height: 1.7;
      margin-bottom: 20px;
      flex-grow: 1;
      margin-top: auto;
    }

    .card-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 16px;
      margin-top: 16px;
    }

    .tag-badge {
      display: inline-block;
      padding: 4px 12px;
      background: rgba(13, 43, 77, 0.1);
      color: #0d2b4d;
      border-radius: 12px;
      font-size: 0.8rem;
      font-weight: 600;
    }

    .card-question {
      font-size: 0.9rem;
      color: #4a7ba7;
      font-weight: 500;
      padding-top: 16px;
      border-top: 1px solid #e8e6e1;
      margin-top: 16px;
    }

    .card-question::before {
      content: "？ ";
      font-weight: 700;
    }

    .empty-state {
      text-align: center;
      padding: 64px 32px;
      color: #667078;
      grid-column: 1 / -1;
    }

    .empty-state p {
      font-size: 1.1rem;
    }

    @media (max-width: 768px) {
      body {
        padding: 32px 16px;
      }

      header {
        margin-bottom: 32px;
        padding-bottom: 32px;
      }

      header h1 {
        font-size: 1.8rem;
      }

      .filter-section {
        flex-direction: column;
        align-items: stretch;
        margin-bottom: 32px;
      }

      .filter-label {
        margin-right: 0;
        margin-bottom: 12px;
      }

      .grid {
        grid-template-columns: 1fr;
        gap: 20px;
      }

      .card {
        padding: 24px;
      }

      .card-title {
        font-size: 1.2rem;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>パラ式　思考デバッガー</h1>
      <p>思考の資産化 — 内省と言語化の記録</p>
    </header>

    <div class="filter-section" id="filterSection">
      <span class="filter-label">フィルター:</span>
      <button class="tag-btn active" data-tag="all">すべて表示</button>
    </div>

    <div class="grid" id="cardGrid">
      <!-- Cards will be generated here -->
    </div>
  </div>

  <script>
    const logs = ${logsJSON};
    const allTags = ${tagsJSON};
    let activeFilter = 'all';

    // フィルターボタンを初期化
    function initializeFilters() {
      const filterSection = document.getElementById('filterSection');
      const allBtn = filterSection.querySelector('[data-tag="all"]');

      allTags.forEach(tag => {
        const btn = document.createElement('button');
        btn.className = 'tag-btn';
        btn.textContent = tag;
        btn.setAttribute('data-tag', tag);
        btn.addEventListener('click', () => filterCards(tag, btn));
        filterSection.appendChild(btn);
      });

      allBtn.addEventListener('click', () => filterCards('all', allBtn));
    }

    // カード表示/非表示の切り替え
    function filterCards(tag, button) {
      activeFilter = tag;

      // ボタンのactive状態を更新
      document.querySelectorAll('.tag-btn').forEach(btn => {
        btn.classList.remove('active');
      });
      button.classList.add('active');

      // カードのフィルタリング
      document.querySelectorAll('.card').forEach(card => {
        if (tag === 'all') {
          card.classList.remove('hidden');
        } else {
          const cardTags = card.getAttribute('data-tags').split(',');
          card.classList.toggle('hidden', !cardTags.includes(tag));
        }
      });

      // アニメーション
      setTimeout(() => {
        document.querySelectorAll('.card:not(.hidden)').forEach(card => {
          card.style.animation = 'none';
          setTimeout(() => {
            card.style.animation = 'fadeIn 0.3s ease-out';
          }, 10);
        });
      }, 50);
    }

    // カードを描画
    function renderCards() {
      const grid = document.getElementById('cardGrid');

      if (logs.length === 0) {
        grid.innerHTML = '<div class="empty-state"><p>ログがまだありません</p></div>';
        return;
      }

      logs.forEach(log => {
        const card = document.createElement('a');
        card.href = \`notes/\${log.filename}\`;
        card.className = 'card';
        card.setAttribute('data-tags', log.tags.join(','));

        const dateStr = new Date(log.date).toLocaleDateString('ja-JP', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        });

        const tagsHTML = log.tags
          .map(tag => \`<span class="tag-badge">\${tag}</span>\`)
          .join('');

        const excerptText = log.excerpt.length > 100
          ? log.excerpt.substring(0, 100) + '…'
          : log.excerpt;

        const questionText = log.question.length > 80
          ? log.question.substring(0, 80) + '…'
          : log.question;

        card.innerHTML = \`
          <div>
            <div class="card-date">\${dateStr}</div>
            <div class="card-title">\${log.title}</div>
            <div class="card-excerpt">\${excerptText}</div>
            <div class="card-tags">\${tagsHTML}</div>
          </div>
          <div class="card-question">\${questionText}</div>
        \`;

        grid.appendChild(card);
      });
    }

    // 初期化
    initializeFilters();
    renderCards();
  </script>
</body>
</html>`;
}

// スクリプト実行
generateDashboard().catch(error => {
  console.error('Error generating dashboard:', error);
  process.exit(1);
});
