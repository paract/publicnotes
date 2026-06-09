#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { generateDashboard } = require('../generate-dashboard');

const rootDir = process.cwd();
const command = process.argv[2] || 'help';

function copyFileIfMissing(source, destination) {
  if (fs.existsSync(destination)) {
    console.log(`skip ${path.relative(rootDir, destination)} already exists`);
    return;
  }

  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
  console.log(`create ${path.relative(rootDir, destination)}`);
}

function writeFileIfMissing(destination, content) {
  if (fs.existsSync(destination)) {
    console.log(`skip ${path.relative(rootDir, destination)} already exists`);
    return;
  }

  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, content);
  console.log(`create ${path.relative(rootDir, destination)}`);
}

function copyDirectoryIfMissing(sourceDir, destinationDir) {
  if (!fs.existsSync(sourceDir)) {
    return;
  }

  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const source = path.join(sourceDir, entry.name);
    const destination = path.join(destinationDir, entry.name);

    if (entry.isDirectory()) {
      copyDirectoryIfMissing(source, destination);
    } else {
      copyFileIfMissing(source, destination);
    }
  }
}

function initProject() {
  const templateDir = path.join(__dirname, '..', 'templates');

  fs.mkdirSync(path.join(rootDir, 'notes'), { recursive: true });
  fs.mkdirSync(path.join(rootDir, 'assets'), { recursive: true });

  copyFileIfMissing(
    path.join(templateDir, 'AGENTS.md'),
    path.join(rootDir, 'AGENTS.md')
  );
  copyFileIfMissing(
    path.join(templateDir, 'sample-note.html'),
    path.join(rootDir, 'notes', 'sample-note-2026-01-01.html')
  );
  copyFileIfMissing(
    path.join(templateDir, 'publicnotes.config.json'),
    path.join(rootDir, 'publicnotes.config.json')
  );
  copyFileIfMissing(
    path.join(templateDir, 'gitignore'),
    path.join(rootDir, '.gitignore')
  );
  copyDirectoryIfMissing(
    path.join(templateDir, 'assets'),
    path.join(rootDir, 'assets')
  );

  writeFileIfMissing(
    path.join(rootDir, 'package.json'),
    JSON.stringify({
      scripts: {
        build: 'publicnotes build'
      },
      dependencies: {
        '@paract/publicnotes': 'latest'
      }
    }, null, 2) + '\n'
  );

  console.log('\nNext steps:');
  console.log('1. npm install');
  console.log('2. npm run build');
  console.log('3. Publish the folder with GitHub Pages or any static host');
}

async function buildProject() {
  await generateDashboard({ rootDir });
}

function printHelp() {
  console.log(`publicnotes

Usage:
  publicnotes init    Create a new public notes project scaffold
  publicnotes build   Generate index.html from notes/*.html
  publicnotes help    Show this help
`);
}

async function main() {
  if (command === 'init') {
    initProject();
    return;
  }

  if (command === 'build') {
    await buildProject();
    return;
  }

  if (command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  console.error(`Unknown command: ${command}`);
  printHelp();
  process.exit(1);
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
