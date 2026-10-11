# Warmr palette

Every color comes from Sanzo Wada, *A Dictionary of Color Combinations* (1933), via the `colors.json` dataset at https://github.com/mattdesl/dictionary-of-colour-combinations (MIT, vendored in `data/wada/`). Picked reproducibly by `tools/wada_palette.py`; CSS tokens generated into `web/src/wada.css`. No hex value was invented or tweaked.

## Base: Wada combination no. 166

Three colors, used as given. A deep, muted green ground, a pale warm yellow for text, and a pigment-like coral accent. Combination no. 166 has three colors, so the surface is the ground itself: panels are marked out with 1px rules in the text color, like a printed card.

| Role | Token | Wada name | Hex | L* |
|---|---|---|---|---|
| bg | `--bg` → `--wada-deep-slate-green` | Deep Slate Green | `#112f2c` | 17 |
| fg | `--fg` → `--wada-naples-yellow` | Naples Yellow | `#fbe6a0` | 92 |
| accent | `--accent` → `--wada-grenadine-pink` | Grenadine Pink | `#f48067` | 67 |
| surface | `--surface` → `--wada-deep-slate-green` | Deep Slate Green | `#112f2c` | 17 |

Why this one: of the 348 combinations, 6 of the 3-to-4-color ones pass the rules (ground L* 12 to 35 and chroma ≤ 30, so deep but not black; text not pure white and AA on the ground; a warm accent ≥ 3:1). No. 166 scores highest: text contrast 11.5:1, accent 5.5:1, the most muted ground. Runner-up: no. 229 (Deep Slate Olive, Neutral Gray, Golden Yellow).

## Temperature ramp (cold → hot)

| Token | Wada name | Hex | L* | Hue° | On ground |
|---|---|---|---|---|---|
| `--temp-0` | Deep Lyons Blue | `#1c4286` | 29 | 279 | 1.48:1 |
| `--temp-1` | Blue Violet | `#6450a1` | 39 | 299 | 2.18:1 |
| `--temp-2` | Eupatorium Purple | `#bf5892` | 52 | 346 | 3.43:1 |
| `--temp-3` | Grenadine Pink | `#f48067` | 67 | 38 | 5.54:1 |
| `--temp-4` | Cream Yellow | `#fdbf68` | 82 | 72 | 8.75:1 |
| `--temp-5` | Naples Yellow | `#fbe6a0` | 92 | 90 | 11.54:1 |

Rule: L* rises at every step, and hue walks the thermal "iron" order (blue → violet → magenta → coral → amber → pale yellow). Among 16,442 ramps that satisfy it, the most that link every neighbor through a shared Wada combination is 3 of 5; the chosen ramp has 3 and reuses two base colors (Grenadine Pink, Naples Yellow), so ramp and chrome read as one print.

| Pair | Shared Wada combinations |
|---|---|
| Deep Lyons Blue → Blue Violet | none (no 6-stop ramp links all five) |
| Blue Violet → Eupatorium Purple | 322 |
| Eupatorium Purple → Grenadine Pink | 315 |
| Grenadine Pink → Cream Yellow | 300 |
| Cream Yellow → Naples Yellow | none (no 6-stop ramp links all five) |

## Contrast (WCAG)

| Pair | Ratio | Needed |
|---|---|---|
| text on ground | 11.54:1 | 4.5 (AA body) |
| accent on ground | 5.54:1 | 3 (large text) |
| `--temp-3` numeral on ground | 5.54:1 | 3 (big numeral) |
| `--temp-4` numeral on ground | 8.75:1 | 3 (big numeral) |
| `--temp-5` numeral on ground | 11.54:1 | 3 (big numeral) |

`--temp-0` to `--temp-2` fail 3:1 on the ground, so they never color text: they only tint the photo (gradient map) and the band swatches. The hero numeral is drawn in the text color or a stop ≥ 3:1.

## Share strip

The emoji in the share text are the only non-Wada colors in Warmr (rule 7).
