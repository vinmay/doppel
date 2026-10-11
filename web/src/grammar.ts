// Labels in sentences (F4): "isn't a tire, but looks like one",
// "isn't cotton, but looks like it", "isn't pebbles, but looks like them".
// Article and number come from data/vocab.json (tools/doppel_vocab.py).
import vocab from "../../data/vocab.json";

type Number_ = "one" | "mass" | "plural";
const BY_LABEL = new Map(
  vocab.items.filter((i) => i.kind !== "attr").map((i) => [i.label, { article: (i as { article?: string }).article ?? "", number: ((i as { number?: string }).number ?? "one") as Number_ }]),
);

const guess = (label: string) => ({ article: /^[aeiou]/.test(label) ? "an" : "a", number: "one" as Number_ });

/** "a tire", "an umbrella", "cotton", "pebbles", "the sky". */
export function nounPhrase(label: string): string {
  const g = BY_LABEL.get(label) ?? guess(label);
  return g.article ? `${g.article} ${label}` : label;
}

/** The pronoun that refers back to it: "one", "it", "them". */
export function pronoun(label: string): string {
  const n = (BY_LABEL.get(label) ?? guess(label)).number;
  return n === "one" ? "one" : n === "plural" ? "them" : "it";
}

/** "Something that isn't cotton, but looks like it." */
export const notButLike = (label: string) => `Something that isn't ${nounPhrase(label)}, but looks like ${pronoun(label)}.`;
