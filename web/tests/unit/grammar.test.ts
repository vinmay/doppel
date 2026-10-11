import { describe, expect, it } from "vitest";
import vocab from "../../../data/vocab.json";
import { notButLike, nounPhrase, pronoun } from "../../src/grammar";

const things = vocab.items.filter((i) => i.kind !== "attr") as { label: string; article: string; number: string }[];
const MASS = ["cotton", "moss", "grass", "sand", "tree bark", "snow", "ice", "concrete", "elephant skin", "popcorn", "broccoli", "mud", "soil", "rice"];

describe("labels in sentences", () => {
  it("every label has an article and a number", () => {
    for (const t of things) {
      expect(["a", "an", "the", ""], t.label).toContain(t.article);
      expect(["one", "mass", "plural"], t.label).toContain(t.number);
    }
  });
  it("never puts a/an before a mass noun or a plural", () => {
    for (const t of things) {
      const s = notButLike(t.label);
      if (t.number !== "one") expect(s, s).not.toMatch(new RegExp(`isn't an? ${t.label},`));
    }
    for (const m of MASS) expect(notButLike(m)).toBe(`Something that isn't ${m}, but looks like it.`);
  });
  it("uses a/an by sound for countable things", () => {
    for (const t of things.filter((x) => x.number === "one" && x.article !== "the")) {
      expect(t.article, t.label).toBe(/^[aeiou]/.test(t.label) ? "an" : "a");
    }
  });
  it("spot checks", () => {
    expect(notButLike("tire")).toBe("Something that isn't a tire, but looks like one.");
    expect(notButLike("umbrella")).toBe("Something that isn't an umbrella, but looks like one.");
    expect(notButLike("pebbles")).toBe("Something that isn't pebbles, but looks like them.");
    expect(notButLike("sky")).toBe("Something that isn't the sky, but looks like it.");
    expect(nounPhrase("unknown thing")).toBe("an unknown thing");
    expect(pronoun("hexagonal tiles")).toBe("them");
  });
});
