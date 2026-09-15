const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { JSDOM } = require('jsdom');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');

const START = '<!-- publicnotes:metadata:start -->';
const END = '<!-- publicnotes:metadata:end -->';
const escape = value => String(value).replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const json = value => JSON.stringify(value).replace(/</g, '\\u003c');
const relativeURL = (file, base) => new URL(file.split(path.sep).map(encodeURIComponent).join('/'), base).href;

function wrap(ctx, text, width) {
  const lines = [];
  let line = '';
  for (const ch of Array.from(text)) {
    if (line && ctx.measureText(line + ch).width > width) {
      lines.push(line);
      line = ch;
    } else line += ch;
  }
  if (line) lines.push(line);
  return lines;
}

function renderCover(title, siteTitle, date) {
  const font = ['Hiragino Sans', 'Noto Sans JP', 'Noto Sans CJK JP', 'Yu Gothic']
    .find(name => GlobalFonts.has(name));
  if (!font) throw new Error('Japanese font required: install Noto Sans JP or Hiragino Sans.');
  const canvas = createCanvas(1200, 630);
  const ctx = canvas.getContext('2d');
  const colors = ['#176b71', '#815067', '#355b8c', '#526b36'];
  const accent = colors[createHash('sha256').update(title).digest()[0] % colors.length];
  ctx.fillStyle = '#f7fafb'; ctx.fillRect(0, 0, 1200, 630);
  ctx.fillStyle = accent; ctx.fillRect(0, 0, 18, 630);
  ctx.font = 'bold 29px "' + font + '"';
  ctx.fillText(siteTitle, 68, 78);
  let size = 68, lines;
  do {
    ctx.font = 'bold ' + size + 'px "' + font + '"';
    lines = wrap(ctx, title, 1064);
    if (lines.length * size * 1.4 <= 340) break;
    size -= 2;
  } while (size > 24);
  ctx.fillStyle = '#1d2f38';
  const top = 145 + (340 - lines.length * size * 1.4) / 2;
  lines.forEach((line, i) => ctx.fillText(line, 68, top + size + i * size * 1.4));
  ctx.fillStyle = '#c8d9de'; ctx.fillRect(68, 540, 1064, 2);
  ctx.fillStyle = accent; ctx.font = '26px "' + font + '"';
  ctx.fillText('気づきを、次の一歩へ。', 68, 586);
  ctx.textAlign = 'right'; ctx.fillText(date, 1132, 586);
  return canvas.toBuffer('image/png');
}

function replaceMetadata(html, block) {
  const marked = html.includes(START);
  if (marked) {
    const start = html.indexOf(START), end = html.indexOf(END, start);
    if (end < 0) throw new Error('Unclosed metadata block.');
    return html.slice(0, start) + block + html.slice(end + END.length);
  }
  // Replace existing metadata only, leaving article markup and formatting intact.
  const dom = new JSDOM(html, { includeNodeLocations: true });
  const ranges = [];
  for (const el of dom.window.document.head.querySelectorAll('meta, link, script[type="application/ld+json"]')) {
    const name = (el.getAttribute('name') || el.getAttribute('property') || '').toLowerCase();
    let owned = name === 'description' || /^(og:|twitter:|article:)/.test(name) ||
      (el.tagName === 'LINK' && el.getAttribute('rel') === 'canonical');
    if (el.tagName === 'SCRIPT') {
      try {
        const data = JSON.parse(el.textContent);
        const nodes = data['@graph'] || (Array.isArray(data) ? data : [data]);
        owned = nodes.every(node => ['BlogPosting', 'BreadcrumbList'].includes(node['@type']));
      } catch { /* Unrelated structured data is preserved. */ }
    }
    if (owned) {
      const location = dom.nodeLocation(el);
      if (location) ranges.push(location);
    }
  }
  dom.window.close();
  for (const location of ranges.sort((a, b) => b.startOffset - a.startOffset))
    html = html.slice(0, location.startOffset) + html.slice(location.endOffset);
  if (!/<\/head\s*>/i.test(html)) throw new Error('Missing closing head tag.');
  return html.replace(/<\/head\s*>/i, block + '\n</head>');
}

function syncArticleMetadata(root, config, logs, check = false) {
  if (!config.siteUrl) return [];
  const base = new URL(config.siteUrl.endsWith('/') ? config.siteUrl : config.siteUrl + '/');
  if (base.protocol !== 'https:') throw new Error('siteUrl must be an absolute HTTPS URL.');
  if (!config.authorName) throw new Error('authorName is required for article metadata.');
  const changedFiles = [];
  for (const log of logs) {
    const articlePath = path.join(config.notesDir, log.filename);
    const articleURL = relativeURL(articlePath, base);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(log.date)) throw new Error('Missing article date: ' + articlePath);
    const description = log.shareSummary || log.excerpt;
    const digest = createHash('sha256').update(JSON.stringify([log.title, config.siteTitle, log.date, 1]))
      .digest('hex').slice(0, 12);
    const imagePath = path.join('assets', 'ogp', log.filename.replace(/\.html$/, '') + '-' + digest + '-eyecatch.png');
    const imageURL = relativeURL(imagePath, base);
    const imageFile = path.join(root, imagePath);
    if (!fs.existsSync(imageFile)) {
      if (check) throw new Error('Missing OGP image: ' + imagePath);
      fs.mkdirSync(path.dirname(imageFile), { recursive: true });
      fs.writeFileSync(imageFile, renderCover(log.title, config.siteTitle, log.date));
    }
    // Include cached covers too, so prepare-note followed by publish-note stages them.
    changedFiles.push(imagePath);
    const png = fs.readFileSync(imageFile);
    if (png.length < 24 || png.toString('hex', 0, 8) !== '89504e470d0a1a0a' ||
        png.readUInt32BE(16) !== 1200 || png.readUInt32BE(20) !== 630)
      throw new Error('Invalid OGP PNG: ' + imagePath);
    const tags = [
      ['name', 'description', description],
      ['property', 'og:type', 'article'], ['property', 'og:locale', 'ja_JP'],
      ['property', 'og:site_name', config.siteTitle], ['property', 'og:title', log.title],
      ['property', 'og:description', description], ['property', 'og:url', articleURL],
      ['property', 'og:image', imageURL], ['property', 'og:image:secure_url', imageURL],
      ['property', 'og:image:type', 'image/png'], ['property', 'og:image:width', '1200'],
      ['property', 'og:image:height', '630'], ['property', 'og:image:alt', log.title + 'のアイキャッチ'],
      ['name', 'twitter:card', 'summary_large_image'], ['name', 'twitter:title', log.title],
      ['name', 'twitter:description', description], ['name', 'twitter:image', imageURL],
      ['name', 'twitter:image:alt', log.title + 'のアイキャッチ']
    ];
    const article = {
      '@context': 'https://schema.org', '@type': 'BlogPosting',
      '@id': articleURL + '#article', mainEntityOfPage: { '@type': 'WebPage', '@id': articleURL },
      url: articleURL, headline: log.title, description, image: [imageURL],
      datePublished: log.date, author: { '@type': 'Person', name: config.authorName },
      inLanguage: 'ja'
    };
    const breadcrumb = {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: config.siteTitle, item: base.href },
        { '@type': 'ListItem', position: 2, name: log.title, item: articleURL }
      ]
    };
    const block = [START, '<link rel="canonical" href="' + escape(articleURL) + '">',
      ...tags.map(([attr, key, value]) => '<meta ' + attr + '="' + key + '" content="' + escape(value) + '">'),
      '<script type="application/ld+json">' + json(article) + '</script>',
      '<script type="application/ld+json">' + json(breadcrumb) + '</script>', END].join('\n');
    const file = path.join(root, articlePath), html = fs.readFileSync(file, 'utf8');
    let updated = replaceMetadata(html, block);
    const shareURL = 'https://twitter.com/intent/tweet?' +
      new URLSearchParams({ text: log.title, url: articleURL });
    const shareLink = '<a href="' + escape(shareURL) + '" target="_blank" rel="noopener noreferrer" ' +
      'aria-label="Xでシェア（新しいタブ）" ' +
      'style="display:inline-block;padding:5px 9px;border:1px solid #c8cdd2;border-radius:4px;font:12px/1.5 sans-serif;color:#30363b;background:#fff;text-decoration:none">Xでシェア</a>';
    const share = '<!-- publicnotes:share:start -->\n' +
      '<div data-publicnotes-share style="width:min(920px,calc(100% - 32px));margin:20px auto 32px">' +
      shareLink + '</div>\n' +
      '<!-- publicnotes:share:end -->';
    if (updated.includes('<!-- publicnotes:share:start -->')) {
      updated = updated.replace(/<!-- publicnotes:share:start -->[\s\S]*?<!-- publicnotes:share:end -->/, share);
    } else updated = updated.replace(/<\/body\s*>/i, share + '\n</body>');
    updated = updated.replace(/<span data-publicnotes-share-top>[\s\S]*?<\/span>/,
      () => '<span data-publicnotes-share-top>' + shareLink + '</span>');
    if (updated !== html) {
      if (check) throw new Error('Stale article metadata: ' + articlePath);
      const stat = fs.statSync(file);
      fs.writeFileSync(file, updated);
      fs.utimesSync(file, stat.atime, stat.mtime);
      changedFiles.push(articlePath);
    }
  }
  return changedFiles;
}
module.exports = { syncArticleMetadata, replaceMetadata, renderCover };
