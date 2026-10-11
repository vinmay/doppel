// "Need an idea?": 3 starter hints a day from data/twin-ideas.json, picked
// deterministically by date so everyone gets the same three, and a reload
// doesn't reshuffle them.
import data from "../../data/twin-ideas.json";
import { hash } from "./twin";

export const IDEAS: string[] = data.ideas.map((i) => i.text);

const STOP = new Set(["something", "and", "with", "a", "an", "the", "of", "that", "like", "in", "on", "or", "very"]);
const words = (s: string) => (s.toLowerCase().match(/[a-z]+/g) ?? []).filter((w) => !STOP.has(w));

/** Daily theme (G5): one per date, the same for everyone. No effect on scoring. */
export const THEMES: { name: string; words: string[] }[] = [
  { name: "Textures", words: ["rough", "smooth", "bumpy", "bumps", "fuzzy", "woolly", "coarse", "grainy", "sandy", "spongy", "porous", "woven", "mesh", "layered", "dusted", "textured"] },
  { name: "Round things", words: ["round", "rounded", "ring", "rings", "oblong", "curved", "hollow", "holes", "cap"] },
  { name: "Stripes and lines", words: ["stripes", "striped", "lines", "zigzagging", "straight", "ridged", "scored", "patterned", "strands", "twisted"] },
  { name: "Soft things", words: ["soft", "fuzzy", "fuzz", "woolly", "puffy", "fluffy", "fur", "hairs", "light"] },
  { name: "Rough things", words: ["rough", "cracked", "jagged", "brittle", "weathered", "coarse", "lumpy", "prickly", "sharp", "bristly"] },
  { name: "Shiny things", words: ["shiny", "glassy", "slick", "silvery", "wet", "bright", "glossy", "clear", "golden"] },
];

export const themeFor = (day: string) => THEMES[hash(`theme|${day}`) % THEMES.length];
export const fitsTheme = (idea: string, theme: { words: string[] }) => words(idea).some((w) => theme.words.includes(w));

export function ideasFor(day: string, n = 3, pool: string[] = IDEAS): string[] {
  // Rank every idea by a per-day hash, ideas that fit today's theme first, then
  // take the first n that share no word with one already picked, so the three
  // hints point different ways.
  const theme = themeFor(day);
  const ranked = pool
    .map((text) => ({ text, k: hash(`${day}|${text}`), fit: fitsTheme(text, theme) ? 0 : 1 }))
    .sort((a, b) => a.fit - b.fit || a.k - b.k);
  const out: string[] = [];
  const used = new Set<string>();
  for (const { text } of ranked) {
    const w = words(text);
    if (w.some((x) => used.has(x))) continue;
    out.push(text);
    w.forEach((x) => used.add(x));
    if (out.length === n) return out;
  }
  for (const { text } of ranked) if (out.length < n && !out.includes(text)) out.push(text);
  return out;
}
