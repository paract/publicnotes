const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { syncArticleMetadata } = require('../scripts/article-metadata');

test('all published articles have matching static metadata and valid dedicated PNGs', () => {
  const root = path.join(__dirname, '..');
  const images = new Set();
  for (const filename of fs.readdirSync(path.join(root, 'notes')).filter(x => x.endsWith('.html'))) {
    const dom = new JSDOM(fs.readFileSync(path.join(root, 'notes', filename), 'utf8'));
    const doc = dom.window.document;
    const meta = key => {
      const nodes = doc.head.querySelectorAll('meta[property="' + key + '"],meta[name="' + key + '"]');
      assert.equal(nodes.length, 1, filename + ': ' + key);
      return nodes[0].content;
    };
    const title = doc.querySelector('h1').textContent;
    const url = 'https://paract.github.io/publicnotes/notes/' + encodeURIComponent(filename);
    assert.equal(meta('og:title'), title);
    assert.equal(meta('og:url'), url);
    assert.equal(meta('twitter:card'), 'summary_large_image');
    assert.equal(meta('og:description'), doc.querySelector('[aria-labelledby="share-title"] p').textContent.trim());
    assert.equal(meta('og:description'), meta('twitter:description'));
    const share = doc.querySelector('[data-publicnotes-share] a');
    assert.equal(doc.querySelectorAll('[data-publicnotes-share]').length, 1);
    const intent = new URL(share.href);
    assert.equal(intent.origin + intent.pathname, 'https://twitter.com/intent/tweet');
    assert.equal(intent.searchParams.get('text'), title);
    assert.equal(intent.searchParams.get('url'), url);
    assert.equal(share.target, '_blank');
    assert.equal(meta('og:image'), meta('twitter:image'));
    const imageURL = new URL(meta('og:image'));
    assert.equal(imageURL.origin, 'https://paract.github.io');
    const file = path.join(root, decodeURIComponent(imageURL.pathname.replace('/publicnotes/', '')));
    const png = fs.readFileSync(file);
    assert.equal(png.readUInt32BE(16), 1200);
    assert.equal(png.readUInt32BE(20), 630);
    assert.ok(png.length < 5 * 1024 * 1024);
    assert.ok(!images.has(file)); images.add(file);
    const schemas = [...doc.head.querySelectorAll('script[type="application/ld+json"]')]
      .map(node => JSON.parse(node.textContent));
    assert.equal(schemas.length, 2);
    const article = schemas.find(x => x['@type'] === 'BlogPosting');
    assert.equal(article.headline, title);
    assert.equal(article.url, url);
    assert.equal(article.author.name, 'なお（パラ）');
    assert.equal(article.datePublished, filename.match(/\d{4}-\d{2}-\d{2}/)[0]);
    assert.equal(article.image[0], imageURL.href);
    const crumbs = schemas.find(x => x['@type'] === 'BreadcrumbList').itemListElement;
    assert.deepEqual(crumbs.map(x => x.position), [1, 2]);
    assert.equal(crumbs[1].item, url);
    dom.window.close();
  }
});

test('metadata generation is idempotent, escapes text, preserves body and verifies assets', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'metadata-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'notes'));
  const file = path.join(root, 'notes', 'sample-2026-09-15.html');
  const body = '<body><h1>Original article</h1></body>';
  fs.writeFileSync(file, '<html><head><meta property="og:title" content="old"></head>' + body + '</html>');
  const config = { siteUrl: 'https://example.com/publicnotes/', siteTitle: '思考', authorName: 'なお', notesDir: 'notes' };
  const logs = [{ filename: path.basename(file), title: '日本語 " & </script> の話',
    date: '2026-09-15', shareSummary: '説明 " & < >' }];
  syncArticleMetadata(root, config, logs);
  const html = fs.readFileSync(file, 'utf8'), stat = fs.statSync(file);
  assert.ok(html.includes('<h1>Original article</h1>'));
  syncArticleMetadata(root, config, logs, true);
  syncArticleMetadata(root, config, logs);
  assert.equal(fs.readFileSync(file, 'utf8'), html);
  assert.equal(fs.statSync(file).mtimeMs, stat.mtimeMs);
  const dom = new JSDOM(html);
  assert.equal(dom.window.document.querySelectorAll('[property="og:title"]').length, 1);
  assert.equal(JSON.parse(dom.window.document.querySelector('script').textContent).headline, logs[0].title);
  dom.window.close();
  assert.throws(() => syncArticleMetadata(root, config, [{ ...logs[0], shareSummary: '変更後' }], true), /Stale/);
  const image = path.join(root, 'assets/ogp', fs.readdirSync(path.join(root, 'assets/ogp'))[0]);
  fs.unlinkSync(image);
  assert.throws(() => syncArticleMetadata(root, config, logs, true), /Missing OGP image/);
  assert.equal(fs.readFileSync(file, 'utf8'), html);
});
