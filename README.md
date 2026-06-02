# fake-text

[![pages](https://img.shields.io/badge/live-baditaflorin.github.io%2Ffake--text-2f7bff)](https://baditaflorin.github.io/fake-text/)
[![version](https://img.shields.io/badge/version-0.1.0-blue)](https://github.com/baditaflorin/fake-text/blob/main/package.json)
[![license](https://img.shields.io/badge/license-MIT-green)](./LICENSE)

> Fabricated iMessage / tweet / SMS screenshot generator — meme fuel, made in your browser.

**Live → https://baditaflorin.github.io/fake-text/**

A WYSIWYG generator for **clearly-fabricated** chat and tweet screenshots — the kind of satire prop you drop in a group chat for a laugh. Type the conversation, tweak the chrome, export a PNG. Nothing leaves your device; the whole mock also lives in the URL so you can reload or share the editor state by link.

> ⚠ **For parody / memes only.** Everything you make here is fake by construction. The app labels it as such — don't pass these off as genuine messages.

## Three modes

- **iMessage** — a phone frame with editable contact name, iOS status bar (time, carrier, battery), and a list of blue (sent) / grey (received) bubbles. Add, remove, reorder, toggle side, optional per-message timestamps, light/dark.
- **SMS** — the same bubble model in generic green-bubble Android/SMS styling.
- **Tweet** — display name, @handle, avatar (initials or an uploaded image), tweet text, time/date, reply/retweet/like counts (auto-formatted `1.2K` / `3.4M`), verified-badge toggle, light/dark.

## What you can do

- **Edit live** — every field updates the preview instantly.
- **Export** — **⬇ PNG** renders the mock to a 2× raster via [`html-to-image`](https://github.com/bubkoo/html-to-image).
- **Share** — **🔗 Link** copies a URL whose hash encodes the entire mock; reopening it restores everything.

## How it works

All the data and logic lives in [`src/model.ts`](./src/model.ts): the typed message/tweet model, the bubble reducers (`addBubble` / `removeBubble` / `moveBubble` / `updateBubble`, all pure and immutable), the formatters (`formatCount`, `formatClock`, …), and `encodeState` / `decodeState` (JSON → base64url URL hash, with garbage-tolerant field-by-field fallback). It is DOM-free and unit-tested under Node.

[`src/main.ts`](./src/main.ts) is a thin wiring layer: it owns the DOM, renders `state` into the preview, and is the only place that touches the browser or `html-to-image`.

All logic is unit-tested in [`tests/core.test.ts`](./tests/core.test.ts).

## Run it locally

```bash
git clone https://github.com/baditaflorin/fake-text
cd fake-text
npm install
npm run dev      # http://127.0.0.1:5173
```

## Build & deploy

GitHub Pages serves the committed `docs/` directory on `main`. No CI — a local smoke gate builds and sanity-checks the output:

```bash
npm run smoke    # vitest + vite build → docs/ + output checks
```

## Privacy

100% client-side. No backend, no analytics, no upload. Uploaded avatars are read in-browser as data URLs and never sent anywhere. Your mock lives only in the URL you choose to share.

## License

MIT — see [LICENSE](./LICENSE).
