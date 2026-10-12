Doppel started as a fork of Sense Hunt and Warmr (same author, same challenge window).

# Doppel

**Find two different things that look the same. Outside.**

Photograph anything outdoors. Walk about 50 metres. Then find its twin: a *different kind* of thing that looks the same, like a pinecone and an artichoke, moss and broccoli, or bark and elephant skin. **EmbeddingGemma 2 runs on your phone** and judges how alike the two photos look, and it shows its reasons:

- **Doppel sees:** what it thinks each photo is ("pinecone ↔ artichoke"), so you know it understood you.
- **A twin score** from 0 to 100, in four bands: Uncanny, Cousins, Distant, Strangers.
- **What they share:** "Both: ridged · layered · wrinkled", the visual qualities both photos have.

Three pairs a day, about 10 to 15 minutes, then "Done for today". You can't lose. Photos never leave the phone, and after the first load it works with no signal.

Built Oct 10 to 11, 2026 for DEV Hacktoberfest Week 1 ("Touch Grass").

- **Live:** https://doppel-ws59.onrender.com (Chrome on Android or desktop; needs WebGPU)
- **No time to go outside?** [Try a demo round](https://doppel-ws59.onrender.com/#/demo): one full round with bundled CC0 photos, no camera needed, nothing saved.
- **Write-up:** https://dev.to/vinmay/doppel-find-two-different-things-that-look-similar-outside-2o77

## How to play

1. **First photo.** Point the camera at anything outside (things, not people). Doppel names what it sees.
2. **Walk.** "Find its twin. Walk." The twin shot unlocks after about 50 m (GPS), or after 45 s if GPS isn't available or is too vague. Meanwhile you see your photo, what Doppel sees in it ("cloud / sky"), what to look for ("Look for something ridged, layered or wrinkled.") and three twins to try. Not happy with the first photo? Retake it, free.
3. **Its twin.** Photograph a different kind of thing that looks like the first.
4. **Reveal.** Both photos slide together in a brief "developing" flash, then the score counts up. Very different kinds of thing that still look alike earn a **stretch bonus** (up to +10). You can try one more twin per pair; the better one counts.

Shots Doppel can't use are refused and **not counted**: screens, rooms, documents and people, photos it can't read, the same photo twice, or the same kind of thing. Stuck? **Need an idea?** offers three hints a day, nudged toward a daily theme. The **?** in the app's header has all of this on one screen.

## How it works

EmbeddingGemma 2 can embed both photos and text into the same space, and it's small enough to run in the browser on WebGPU. Doppel leans on that for everything.

The score is just how close your two photos are, scaled to 0–100. I calibrated the scale on 23 of my own outdoor photos (`tools/twin_calibrate.py`, numbers in `data/twin-scoring.json`).

The rest comes from comparing photos to text. At build time I embedded a list of about 200 everyday things ("a pinecone", "moss"), a few things you shouldn't photograph (screens, rooms, people), and 45 visual words like "round" or "ridged". The closest thing is what "Doppel sees". A visual word shows up under "What they share" when it fits both photos noticeably better than usual. The same lists drive the hints and the "same kind of thing" check.

Nothing leaves the phone. The day's state, the photo vectors and thumbnails live in IndexedDB, and a service worker keeps the app and the model available offline.

On 44 CC0 test photos, lookalike pairs average 58 and unrelated pairs 20 ([`docs/eval.md`](docs/eval.md)). It still gets some wrong: a tire and a donut only score 18.

## Privacy

Photos, vectors and scores stay in the browser's IndexedDB on your device. There is no server, account, analytics or sharing. GPS is used only to measure the walk (and a rounded position to compute sunrise), and only after your first photo. "Delete everything" is under History.

## Run it

```bash
cd web
npm ci
npm run dev      # http://localhost:5173
npm run build    # production build in web/dist/
```

Needs Node 22.12+ and a browser with WebGPU (Chrome or Edge on Android or desktop). The model, `litert-community/embeddinggemma-2-text-vision-440m-litert-lm` (388 MB), downloads once from Hugging Face and is cached; afterwards the app works offline. `render.yaml` deploys it as a static site on Render.

## Layout

- `web/src/twin.ts` scoring, bands, validity rules, What they share, verdicts
- `web/src/day.ts`, `walk.ts`, `sun.ts` the day, the walk unlock, the sunrise boundary
- `web/src/main.ts`, `ui/screens.ts`, `style.css` the app
- `web/src/embed/` the embedder (LiteRT-LM on WebGPU)
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

None.

## License

Apache-2.0. See `LICENSE`.
