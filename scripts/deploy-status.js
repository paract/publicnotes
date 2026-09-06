#!/usr/bin/env node
const { execFileSync } = require('node:child_process');

async function checkDeployment(rootDir = process.cwd()) {
  const git = args => execFileSync('git', args, {
    cwd: rootDir, encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
  const sha = git(['rev-parse', 'HEAD']);
  const remote = git(['remote', 'get-url', 'origin']);
  const match = remote.match(/^(?:https:\/\/github\.com\/|git@github\.com:)([\w.-]+)\/([\w.-]+?)(?:\.git)?$/);
  if (!match) throw new Error('Expected a GitHub origin remote.');
  const response = await fetch(
    'https://api.github.com/repos/' + match[1] + '/' + match[2] +
      '/actions/runs?head_sha=' + sha + '&per_page=20',
    { headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(10000) }
  );
  if (!response.ok) throw new Error('GitHub API returned HTTP ' + response.status);
  const body = await response.text();
  if (!body.trim()) throw new Error('GitHub API returned an empty response.');
  const data = JSON.parse(body);
  if (!Array.isArray(data.workflow_runs)) throw new Error('Unexpected GitHub API response.');
  const run = data.workflow_runs.find(item =>
    item.head_sha === sha && /pages/i.test(item.name));
  if (!run) return console.log(sha.slice(0, 7) + ': Pages run not found yet; publication unconfirmed.');
  console.log(JSON.stringify({
    commit: sha.slice(0, 7), status: run.status, conclusion: run.conclusion, url: run.html_url
  }));
  if (run.status === 'completed' && run.conclusion !== 'success') process.exitCode = 1;
}
if (require.main === module) {
  checkDeployment().catch(error => {
    console.error('Publication unconfirmed: ' + error.message);
    process.exitCode = 1;
  });
}
module.exports = { checkDeployment };
