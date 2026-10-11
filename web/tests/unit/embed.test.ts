import { describe, expect, it } from "vitest";
import { FakeEmbedder } from "../../src/embed/fake";
import { l2normalize, type Embedder } from "../../src/embed/types";

const norm = (v: Float32Array) => Math.sqrt(v.reduce((s, x) => s + x * x, 0));

describe("Embedder interface (fake)", () => {
  const e: Embedder = new FakeEmbedder(32);

  it("is ready and returns unit vectors", async () => {
    await e.ready();
    const t = await e.embedText("a red fire hydrant");
    const i = await e.embedImage(new Blob(["anything"]));
    expect(t).toBeInstanceOf(Float32Array);
    expect(t.length).toBe(32);
    expect(norm(t)).toBeCloseTo(1, 5);
    expect(norm(i)).toBeCloseTo(1, 5);
  });

  it("is deterministic and maps matching bytes to the same vector", async () => {
    const a = await e.embedText("pine cone");
    const b = await e.embedImage(new Blob(["pine cone"]));
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(Array.from(await e.embedText("pine cone"))).toEqual(Array.from(a));
  });
});

describe("l2normalize", () => {
  it("normalises", () => {
    expect(Array.from(l2normalize(Float32Array.from([3, 4])))).toEqual([0.6, 0.8].map(Math.fround));
  });
  it("throws on zero and NaN", () => {
    expect(() => l2normalize(new Float32Array(3))).toThrow();
    expect(() => l2normalize(Float32Array.from([NaN, 1]))).toThrow();
  });
});
