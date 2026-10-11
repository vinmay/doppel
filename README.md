Doppel started as a fork of Sense Hunt and Warmr (same author, same challenge window).

# Doppel

**Find two different things that look the same. Outside.**

Photograph anything outdoors. Walk about 50 metres. Then find its twin: a *different kind* of thing that looks the same, like a tire and a donut, moss and broccoli, or bark and elephant skin. **EmbeddingGemma 2 runs on your phone** and judges how alike the two photos look, and it shows its reasons:

- **Doppel sees:** what it thinks each photo is ("tire ↔ donut"), so you know it understood you.
- **A twin score** from 0 to 100, in four bands: Uncanny, Cousins, Distant, Strangers.
- **What they share:** "Both: ridged · layered · wrinkled", the visual qualities both photos have.

Three pairs a day, about 10 to 15 minutes, then "Done for today". You can't lose. Photos never leave the phone, and after the first load it works with no signal.

Built Oct 10 to 11, 2026 for DEV Hacktoberfest Week 1 ("Touch Grass").

- **Live:** https://doppel-ws59.onrender.com (Chrome on Android or desktop; needs WebGPU)
- **No time to go outside?** [Try a demo round](https://doppel-ws59.onrender.com/#/demo): one full round with bundled CC0 photos, no camera needed, nothing saved.
- **Write-up:** {{V: DEV post URL}}

## How to play

The **?** in the app's header opens the same rules on one screen.

1. **First photo.** Point the camera at anything outside (things, not people). Doppel names what it sees.
2. **Walk.** The screen goes quiet: "Find its twin. Walk." The twin shot unlocks after about 50 m (GPS), or after 45 s if GPS isn't available or is too vague (worse than 30 m). You see your real photo and what Doppel sees in it ("cloud / sky"), what to look for ("Look for something ridged, layered or wrinkled.") and three twins to try ("TRY seed pod · corn on the cob · seashell"). Not happy with the first photo? Retake it, free.
3. **Its twin.** Photograph a different kind of thing that looks like the first.
4. **Reveal.** Both photos slide together in a brief two-ink "developing" flash, then resolve to the real photos while the score counts up. Your photos are never tinted: the Sanzo Wada colors live in the mat around them. Very different kinds of thing that still look alike earn a **stretch bonus** (up to +10). You may try one more twin per pair (another walk); the better one counts.

Shots Doppel can't use are refused and **not counted**: screens, rooms, documents and people ("Take it outside."), photos it can't read ("Get closer and fill the frame."), the same photo twice, or the same kind of thing ("Find something different that looks like it."). The **?** in the header opens a one-screen "How to play". Stuck? **Need an idea?** offers three hints a day, nudged toward a daily theme ("Today: Round things").

## How it works

```
        ┌──────────────── at build time, on a dev PC ─────────────────┐
        │ data/vocab.json: 208 kinds of thing, 19 not-allowed classes,│
        │   4 "unreadable" rows, 45 visual attributes                 │
        │ the same in-browser EmbeddingGemma 2 embeds them once       │
        │   -> public/vocab-<hash>.bin (276 x 768 floats, 848 KB)     │
        │ eval photos -> tools/twin_calibrate.py -> twin-scoring.json │
        │ Gemma 4 E4B (Ollama) -> data/twin-ideas.json (69 hints)     │
        └──────────────────────────────┬──────────────────────────────┘
                                       ▼
┌────────────────────────── on the phone (PWA) ─────────────────────────────┐
│ photo ─► EmbeddingGemma 2 (LiteRT-LM, WebGPU) ─► 768-d vector             │
│   label   = nearest "kind" row            ("Doppel sees: tire")           │
│   margin  = top label vs the best label of a different kind (uncertainty) │
│   attrs   = z-score of each attribute     ("Look for something ridged")   │
│ twin ─► cosine(photo A, photo B) ─► 0..100 (calibrated) ─► band, verdict  │
│   What they share = attributes >= 1 sd above average in BOTH photos       │
│ IndexedDB: the day, both vectors, thumbnails. Service worker: offline.    │
└───────────────────────────────────────────────────────────────────────────┘
```

It works because EmbeddingGemma 2 puts photos and text into one vector space. Photo↔photo similarity is the score; photo↔text similarity gives the labels and the shared attributes that make the score explainable.

**Calibration** (`data/twin-scoring.json`, from `tools/twin_calibrate.py` on browser embeddings of 23 of V's outdoor photos): cosine 0.664 (10th percentile of all pairs) maps to 0 and 0.834 (95th percentile) to 100. Bands: Uncanny ≥ 80, Cousins ≥ 50, Distant ≥ 30. Same kind = label text similarity ≥ 0.90; same photo = cosine > 0.97; near-synonym labels (≥ 0.85) are shown together, not counted as doubt; "can't tell" = margin < 0.003 against a different kind *and* a weak top match (< 0.67), or a dark/blurry photo. Stretch bonus: 1 − label text similarity ≥ 0.205, Cousins or better, up to +10 at 0.30.

**Results** on 44 CC0 test photos with the real model: see [`docs/eval.md`](docs/eval.md). Twins average 58.6, strangers 19.9; 6 of 8 twin pairs reach Cousins or better and 8 of 8 strangers stay Distant or below. It misses tire ↔ donut (18) and zebra ↔ striped awning (0).

## Privacy

Photos, vectors and scores stay in the browser's IndexedDB on your device. There is no server, account, analytics or sharing. GPS is used only to measure the walk (and a rounded position to compute sunrise), and only after your first photo. "Delete everything" is under History.

## Run it

```bash
cd web
npm ci
npm run dev                 # http://localhost:5173 (downloads the model from Hugging Face on first use)
npm run build               # production build in web/dist/
```

Needs a browser with WebGPU (Chrome or Edge on Android or desktop) and Node 20+. The model is `litert-community/embeddinggemma-2-text-vision-440m-litert-lm` (388 MB, downloaded once from Hugging Face and cached; afterwards the app works offline). To try it without going outside, open `#/demo`.

Deploy: `render.yaml` is a Render Blueprint for a static site (`rootDir: web`, `npm ci && npm run build`, publish `dist/`).

## Tests

```bash
npm test                    # Vitest: scoring rules, game state, walk, sunrise, ideas, fixtures, palette
npm run test:e2e            # Playwright, fake embedder, Pixel 7 (390x844) + 375x667: a full day, every refusal,
                            #   reloads, GPS walking, offline, axe on every screen, screenshots to docs/media/
npm run test:model          # real model in headless Windows Edge (WebGPU) over the fixtures -> docs/eval.md
npm run test:bundle         # production build has no fake embedder and no fixtures
PW_BASE_URL=https://... npm run test:live   # smoke test of a deployment
```

`test:model` needs `npm run dev` running and the model at `web/.models/`. It drives Windows Edge from WSL because WSL's Chromium only has software WebGPU.

## Layout

- `web/src/twin.ts` scoring, bands, validity rules, What they share, verdicts (pure)
- `web/src/day.ts`, `walk.ts`, `sun.ts` the day, the walk unlock, the sunrise boundary (pure)
- `web/src/main.ts`, `ui/screens.ts`, `style.css` the app
- `web/src/embed/` the embedder (LiteRT-LM on WebGPU; a fake for tests only)
- `web/src/print.ts` the Wada two-ink print
- `tools/` vocabulary, calibration, idea generator, palette (Python)
- `data/` vocabulary, calibration, ideas, Wada colors

## Credits

- **EmbeddingGemma 2** (Google), Apache-2.0, via the LiteRT-LM build by litert-community.
- **Gemma 4 E4B** (Google), run locally with Ollama, wrote the idea hints.
- **LiteRT-LM** (`@litert-lm/core`), Google AI Edge.
- **Sanzo Wada**, *A Dictionary of Color Combinations* (1933); colors from [mattdesl/dictionary-of-colour-combinations](https://github.com/mattdesl/dictionary-of-colour-combinations) (MIT, vendored in `data/wada/`).
- **Photos:** CC0 and public-domain images from Wikimedia Commons and Openverse (Flickr, rawpixel); every file, author and license in [`web/tests/fixtures/CREDITS.md`](web/tests/fixtures/CREDITS.md), [`web/public/practice/CREDITS.md`](web/public/practice/CREDITS.md) and [`web/public/demo/CREDITS.md`](web/public/demo/CREDITS.md).
- Fonts: IBM Plex Mono (OFL), Instrument Serif (OFL), via Fontsource.

## Commits after the deadline

The deadline is Oct 11, 2026, 11:59 PM PDT (Oct 12, 06:59 UTC). Commits after it are listed here.

_(none)_

## License

Apache-2.0. See `LICENSE`.
