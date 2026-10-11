import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fixtureLabel } from "../../src/embed/fake";

const ROOT = join(import.meta.dirname, "../fixtures");
const sets = { twins: 16, strangers: 16, "same-kind": 8, reject: 4 };

describe("test fixtures", () => {
  const credits = readFileSync(join(ROOT, "CREDITS.md"), "utf8");
  for (const [set, n] of Object.entries(sets)) {
    it(`${set}/ has ${n} images, each credited`, () => {
      const files = readdirSync(join(ROOT, set)).filter((f) => f.endsWith(".jpg"));
      expect(files).toHaveLength(n);
      for (const f of files) {
        expect(credits, f).toContain(`\`${set}/${f}\``);
        expect(statSync(join(ROOT, set, f)).size).toBeLessThan(300_000);
      }
    });
  }
  it("every credited image is CC0 or public domain", () => {
    const rows = credits.split("\n").filter((l) => l.startsWith("| `"));
    expect(rows).toHaveLength(44);
    for (const r of rows) expect(r, r).toMatch(/CC0|Public domain|PDM/i);
  });
});

describe("fixtureLabel", () => {
  it("reads the label from fixture names", () => {
    expect(fixtureLabel("02-donut.jpg")).toBe("donut");
    expect(fixtureLabel("03-elephant-skin.jpg")).toBe("elephant skin");
    expect(fixtureLabel("01-rock-a.jpg")).toBe("rock");
    expect(fixtureLabel("phone-screen.jpg")).toBe("phone screen");
    expect(fixtureLabel("IMG_2041.HEIC")).toBeUndefined();
  });
});

describe("fixture names match vocab labels (so the fake embedder reads them)", () => {
  it("every fixture's label is a non-attribute vocab row", async () => {
    const vocab = (await import("../../../data/vocab.json")).default;
    const labels = new Set(vocab.items.filter((i) => i.kind !== "attr").map((i) => i.label));
    for (const set of Object.keys(sets)) {
      for (const f of readdirSync(join(ROOT, set)).filter((x) => x.endsWith(".jpg"))) {
        expect(labels.has(fixtureLabel(f)!), `${set}/${f} -> ${fixtureLabel(f)}`).toBe(true);
      }
    }
  });
});
