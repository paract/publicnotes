#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { generateDashboard } = require('../generate-dashboard');

function git(args, cwd, network = false) {
  return execFileSync('git', args, {
    cwd, encoding: 'utf8', timeout: network ? 30000 : 5000, killSignal: 'SIGKILL',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
}

async function publish(rootDir, files) {
  const root = fs.realpathSync(rootDir);
  if (fs.realpathSync(git(['rev-parse', '--show-toplevel'], root)) !== root)
    throw new Error('Run from the repository root.');
  if (git(['branch', '--show-current'], root) !== 'main')
    throw new Error('Expected main branch; no changes committed.');
  if (git(['diff', '--cached', '--name-only'], root))
    throw new Error('Existing staged changes found. Review them before publishing.');
  if (!files.length) throw new Error('Specify the article and asset paths to publish.');
  const selected = files.map(file => path.relative(root, path.resolve(root, file)));
  for (const file of selected) {
    if (!/^(notes\/[^/]+\.html|assets\/.+)$/.test(file) ||
        file.split(path.sep).includes('..') || !fs.statSync(path.join(root, file)).isFile())
      throw new Error('Expected an existing article or asset: ' + file);
  }
  const isSelectedCover = file => selected.some(note => note.startsWith('notes/') &&
    file.startsWith('assets/ogp/' + path.basename(note, '.html') + '-') &&
    /-[a-f0-9]{12}-eyecatch\.png$/.test(file));
  const changedContent = [
    ...git(['diff', '--name-only', '-z', 'HEAD'], root).split('\0'),
    ...git(['ls-files', '--others', '--exclude-standard', '-z'], root).split('\0')
  ].filter(file => /^(notes|assets)\//.test(file) && !selected.includes(file) && !isSelectedCover(file));
  if (changedContent.length)
    throw new Error('Other content changes must be reviewed and included explicitly: ' +
      [...new Set(changedContent)].join(', '));
  const { outputFile, metadataFiles } = await generateDashboard({ rootDir: root, strict: true });
  const output = path.relative(root, outputFile);
  // Explicit pathspecs keep unrelated edits out of the commit.
  const scope = [...new Set([...selected, output, ...metadataFiles])];
  git(['diff', '--check', '--', ...scope], root);
  git(['add', '--', ...scope], root);
  if (git(['diff', '--cached', '--name-only'], root)) {
    git(['commit', '-m', 'Auto-sync log via Codex'], root);
    console.log('Committed ' + git(['rev-parse', '--short', 'HEAD'], root));
  } else {
    console.log('No new changes; retrying push without a duplicate commit.');
  }
  try {
    git(['push', 'origin', 'main'], root, true);
  } catch (error) {
    throw new Error('Commit is saved locally; push failed or timed out (30s). ' +
      'Fix network/permissions or remote conflicts, then rerun the same command. ' +
      'No automatic pull or force push was attempted.\n' +
      (error.stderr?.toString().trim() || error.code || 'Unknown Git error'));
  }
  console.log('Push complete. Run npm run deploy-status to check this commit.');
}

if (require.main === module) {
  publish(process.cwd(), process.argv.slice(2)).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
module.exports = { publish };
