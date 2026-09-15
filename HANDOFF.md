# Handoff for Future Codex Chats

This repository is the user's `publicnotes` project.

## Where to Work

Use the existing checkout containing this file. The chat directory can be empty.
Current working checkout:
`/Users/nao/.codex/visualizations/2026/06/07/019e9f7c-fd41-7ef1-8862-83eb73968e52/publicnotes-workspace`
Confirm it exists and inspect Git status. Do not repeatedly scan the entire home
folder or depend on the old `~/publicnotes` location.

Always read `AGENTS.md` before doing note work.

## Current Purpose

This is a Codex-assisted static notes app:

- User sends an introspection log from chat or phone.
- Codex creates a styled HTML note in `notes/`.
- Codex adds a share summary.
- Codex runs `npm run publish-note -- notes/filename.html`.
- This validates articles, builds once, commits explicit paths, and pushes.
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
- Home link with `data-publicnotes-home-link` and `href="../index.html"`
- 思考のデバッガーからの突っ込み
- 一段深掘りする問い
- 感情の起伏
- `<section aria-labelledby="share-title">` with `<h2 id="share-title">他者紹介用メモ</h2>`

The share summary must not use the words `内省ログ` or `ノート`.

## Commands

```bash
npm run publish-note -- notes/filename.html
npm run deploy-status
```

For local-only work: `npm run prepare-note`. Read-only check: `npm run check`.
Push can require network escalation. A push failure leaves the commit saved;
rerun the same publish command after resolving the error. Never force-push.
Git waits are bounded (local: 5s; push: 30s); the status API has a 10s timeout.
Status checks HEAD, not an unrelated latest run. See AGENTS.md for bounded
polling and for distinguishing approval wait from network execution.
For code changes, run `npm test`; ordinary note additions do not need the suite.

## Package/App State

Article sharing metadata is generated during build when config has siteUrl and
authorName. OGP/Twitter tags and BlogPosting/BreadcrumbList JSON-LD are embedded
in each article head. Covers are PNGs under assets/ogp; Japanese rendering needs
Hiragino Sans or Noto Sans JP installed locally. publish-note stages generated
covers with the articles. check verifies metadata without changing files.

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

Use `git log --oneline -5` for the latest successful commit and `index.html` for current note ordering.

## Visual Character Reference

When creating diagrams or generated images, use `assets/references/main-character.png` as the main character reference: short brown hair, round black glasses, friendly smile, black T-shirt, denim, casual playful mood. Keep the core character impression while adapting pose, clothes, and scene to the topic.
## Diagram Design Selection

When the user asks to create a diagram/image without specifying a style, do not generate immediately. Present the numbered choices below and ask for a number. If the user says "おまかせ", choose the best fit and briefly explain why. If the user already specifies a number or style, generate directly with that style.

1. Cyber-Neon Aesthetics
2. High-End Magazine Layout
3. Ultra-Minimal Modern
4. Bullet Journal & Hand-Drawn Sketch
5. 80s City Pop Isometric
6. Premium Corporate Flat
7. Vintage Collage Texture
8. Engineering Blueprint
9. Minimal 3D Claymorphism
10. Matte Black Minimalism
11. Standard Editorial Infographic, the previous default style
