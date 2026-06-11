# Handoff for Future Codex Chats

This repository is the user's `publicnotes` project.

## Where to Work

```bash
cd ~/publicnotes
```

Always read `AGENTS.md` before doing note work.

## Current Purpose

This is a Codex-assisted static notes app:

- User sends an introspection log from chat or phone.
- Codex creates a styled HTML note in `notes/`.
- Codex adds a share summary.
- Codex runs `npm run build-dashboard`.
- Codex commits and pushes to GitHub.
- GitHub Pages serves the public site.

Public site:

```text
https://paract.github.io/publicnotes/
```

## Important Workflow

For every new output, use this exact order:

1. Create the main text/HTML first.
2. Read that text and create the share summary.

## Speed Constraint

Normal note creation should aim to finish within 10 minutes.

Avoid:

- Huge HTML patches
- Long visual inspection loops
- Over-decorated CSS

Prefer:

- Concise HTML
- Existing local style patterns
- `npm run build-dashboard` for verification

## Required Sections in New Notes

Each note should include:

- Source/introspection text
- 思考のデバッガーからの突っ込み
- 一段深掘りする問い
- 感情の起伏
- `<section aria-labelledby="share-title">` with `<h2 id="share-title">他者紹介用メモ</h2>`

The share summary must not use the words `内省ログ` or `ノート`.

## Commands

```bash
npm run build-dashboard
git status --short
git add .
git commit -m "Auto-sync log via Codex"
git push
```

`git push` may require network escalation.

## Package/App State

The project has been packaged as `@paract/publicnotes`.

Useful files:

- `bin/publicnotes.js`
- `generate-dashboard.js`
- `publicnotes.config.json`
- `templates/`

CLI commands:

```bash
publicnotes init
publicnotes build
```

## Current Known Good State

Last successful note:

```text
notes/focus-drift-debugger-upgrade-2026-06-10.html
```

Last successful commit at handoff time:

```text
097126e Auto-sync log via Codex
```
