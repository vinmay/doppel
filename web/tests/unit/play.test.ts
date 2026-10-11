import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { COOLDOWN_MS } from "../../src/game";
import { giveUpGame, loadGame, loadToday, recordShot } from "../../src/play";
import { _resetDbForTests, clearAll, listGames, listShots, type Shot } from "../../src/store";

const T0 = Date.parse("2026-10-11T03:59:00Z"); // 23:59 EDT Oct 10
const shot = (ts: number, extra: Partial<Shot> = {}): Shot => ({
  id: `s${ts}`, day: "2026-10-10", ts, temperature: 40, rank: 50, of: 446, band: 2, won: false,
  thumbBlob: new Blob(["jpeg"], { type: "image/jpeg" }), ...extra,
});

beforeEach(async () => {
  _resetDbForTests();
  await clearAll();
});

describe("game history in IndexedDB", () => {
  it("persists shots and status; a fresh load (reload) sees the same game and cooldown", async () => {
    let g = await loadGame("2026-10-10");
    g = await recordShot(g, shot(T0));
    _resetDbForTests(); // like a page reload
    const again = await loadGame("2026-10-10");
    expect(again.shots).toEqual([{ ts: T0, temperature: 40, rank: 50, band: 2, won: false }]);
    await expect(recordShot(again, shot(T0 + 10_000))).rejects.toThrow(/result|cooldown/);
    expect(await listShots("2026-10-10")).toHaveLength(1);
    g = await recordShot(again, shot(T0 + COOLDOWN_MS, { won: true, rank: 1, band: 5 }));
    expect((await loadGame("2026-10-10")).status).toBe("won");
  });

  it("starts a new game after NY midnight while yesterday's history stays", async () => {
    await recordShot(await loadGame("2026-10-10"), shot(T0));
    const today = await loadToday(T0 + 120_000); // 00:01 EDT Oct 11
    expect(today).toEqual({ day: "2026-10-11", status: "playing", shots: [] });
    expect(await listShots()).toHaveLength(1);
  });

  it("gives up once and remembers it", async () => {
    const g = await giveUpGame(await loadGame("2026-10-10"), T0);
    expect(g.status).toBe("gave-up");
    expect(await listGames()).toEqual([{ day: "2026-10-10", status: "gave-up", endedAt: T0 }]);
    expect((await loadGame("2026-10-10")).status).toBe("gave-up");
  });
});
