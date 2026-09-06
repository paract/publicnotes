const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { JSDOM } = require('jsdom');
const { generateDashboard } = require('../generate-dashboard');
const { publish } = require('../scripts/publish-note');
const { checkDeployment } = require('../scripts/deploy-status');
const sample = fs.readFileSync(path.join(__dirname, '../templates/sample-note.html'), 'utf8');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'publicnotes-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'notes'));
  const git = args => execFileSync('git', args, {
    cwd: root, encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
  git(['init', '-b', 'main']);
  git(['config', 'user.name', 'Test']);
  git(['config', 'user.email', 'test@example.invalid']);
  git(['config', 'commit.gpgsign', 'false']);
  return { root, git, write: (name, html = sample) =>
    fs.writeFileSync(path.join(root, 'notes', name), html) };
}

test('build is repeatable; check is read-only and blocks stale or invalid content', async t => {
  const { root, write } = fixture(t);
  write('first-2026-09-01.html');
  const result = await generateDashboard({ rootDir: root, strict: true });
  const original = fs.readFileSync(result.outputFile, 'utf8');
  const mtime = fs.statSync(result.outputFile).mtimeMs;
  await generateDashboard({ rootDir: root, check: true });
  assert.equal(fs.statSync(result.outputFile).mtimeMs, mtime);
  assert.equal((await generateDashboard({ rootDir: root })).changed, false);
  write('second-2026-09-02.html');
  await assert.rejects(generateDashboard({ rootDir: root, check: true }), /stale/);
  assert.equal(fs.readFileSync(result.outputFile, 'utf8'), original);
  write('second-2026-09-02.html', sample.replace('share-title', 'missing-share'));
  await assert.rejects(generateDashboard({ rootDir: root, strict: true }), /Missing share/);
  assert.equal(fs.readFileSync(result.outputFile, 'utf8'), original);
  write('second-2026-09-02.html', sample.replace('../index.html', '/wrong.html'));
  await assert.rejects(generateDashboard({ rootDir: root, strict: true }), /home link/);
});

test('batch Git history preserves old per-file ordering after bulk edits', async t => {
  const { root, git, write } = fixture(t);
  write('older-2026-09-01.html');
  git(['add', '.']); git(['commit', '-m', 'first']);
  write('newer-2026-09-01.html');
  git(['add', '.']); git(['commit', '-m', 'second']);
  const files = fs.readdirSync(path.join(root, 'notes'));
  for (const name of files) fs.utimesSync(path.join(root, 'notes', name), new Date(), new Date('2030-01-01'));
  const { logs } = await generateDashboard({ rootDir: root, strict: true });
  for (const log of logs) {
    const legacy = Number(git(['log', '--diff-filter=A', '--format=%ct', '--', 'notes/' + log.filename])
      .split('\n').pop()) * 1000;
    assert.equal(log.sortTime, legacy);
  }
  const again = await generateDashboard({ rootDir: root, check: true });
  assert.deepEqual(again.logs.map(x => x.filename), logs.map(x => x.filename));
});

test('dashboard renders seven cards and changes pages; all current navigation parses correctly', async t => {
  const { root, write } = fixture(t);
  for (let i = 1; i <= 8; i++) write('item-2026-09-0' + i + '.html');
  const { outputFile } = await generateDashboard({ rootDir: root, strict: true });
  const dom = new JSDOM(fs.readFileSync(outputFile, 'utf8'), { runScripts: 'dangerously' });
  t.after(() => dom.window.close());
  assert.equal(dom.window.document.querySelectorAll('.card').length, 7);
  dom.window.document.querySelector('#nextPage').click();
  assert.equal(dom.window.document.querySelectorAll('.card').length, 1);
  const noteDir = path.join(__dirname, '../notes');
  for (const name of fs.readdirSync(noteDir).filter(n => n.endsWith('.html'))) {
    const page = new JSDOM(fs.readFileSync(path.join(noteDir, name), 'utf8'));
    const nav = page.window.document.querySelector('[data-publicnotes-home-link]');
    assert.deepEqual(nav.getAttributeNames().sort(), ['aria-label', 'data-publicnotes-home-link', 'style']);
    assert.equal(nav.querySelector('a').getAttribute('href'), '../index.html');
    assert.ok(nav.querySelector('a').style.minHeight);
    page.window.close();
  }
});

test('publish retries saved commit and never stages unrelated changes', async t => {
  const { root, git, write } = fixture(t);
  fs.writeFileSync(path.join(root, 'unrelated.txt'), 'original');
  git(['add', '.']); git(['commit', '-m', 'initial']);
  fs.writeFileSync(path.join(root, 'unrelated.txt'), 'local edit');
  git(['remote', 'add', 'origin', path.join(root, 'not-created.git')]);
  write('first-2026-09-01.html');
  await assert.rejects(publish(root, ['notes/first-2026-09-01.html']), /Commit is saved/);
  const commit = git(['rev-parse', 'HEAD']);
  assert.equal(git(['show', 'HEAD:unrelated.txt']), 'original');
  execFileSync('git', ['init', '--bare', path.join(root, 'not-created.git')], { stdio: 'ignore' });
  await publish(root, ['notes/first-2026-09-01.html']);
  assert.equal(git(['rev-parse', 'HEAD']), commit);
  assert.match(git(['status', '--short']), /unrelated.txt/);
  write('unselected-2026-09-02.html');
  await assert.rejects(publish(root, ['notes/first-2026-09-01.html']), /Other content changes/);
  git(['add', 'unrelated.txt']);
  await assert.rejects(publish(root, ['notes/first-2026-09-01.html']), /Existing staged/);
});

test('Pages check filters HEAD, handles empty and failed HTTP responses', async t => {
  const { root, git } = fixture(t);
  git(['commit', '--allow-empty', '-m', 'initial']);
  git(['remote', 'add', 'origin', 'https://github.com/example/publicnotes.git']);
  const oldFetch = global.fetch;
  t.after(() => { global.fetch = oldFetch; });
  global.fetch = async url => {
    assert.ok(url.includes('head_sha=' + git(['rev-parse', 'HEAD'])));
    return { ok: true, text: async () => '' };
  };
  await assert.rejects(checkDeployment(root), /empty response/);
  global.fetch = async () => ({ ok: false, status: 403 });
  await assert.rejects(checkDeployment(root), /HTTP 403/);
  global.fetch = async () => ({ ok: true, text: async () => JSON.stringify({ workflow_runs: [] }) });
  await checkDeployment(root);
});
