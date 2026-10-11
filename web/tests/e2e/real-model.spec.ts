import { expect, test } from "@playwright/test";

// Loads the real EmbeddingGemma 2 model and embeds one bundled image.
// Slow and needs a real WebGPU adapter plus `npm run dev` (serves /models/ and
// the dev-only embed-check page), so it's opt-in: REAL_MODEL=1 npx playwright test real-model
// On WSL, Linux Chromium only gets SwiftShader (minutes per embedding); use
// `scripts/edge-run.sh "/embed-check.html?report=1" "CHECK_(PASS|FAIL)"` instead.
test.skip(!process.env.REAL_MODEL, "REAL_MODEL not set: skipping real-model test (needs WebGPU GPU + local model file)");

test.use({ baseURL: "http://localhost:5173", launchOptions: { args: ["--enable-unsafe-webgpu"] } });
test.setTimeout(30 * 60_000);

test("@slow real model embeds a bundled image", async ({ page }) => {
  await page.goto("/embed-check.html");
  await expect(page.locator("#out")).toContainText(/CHECK_(PASS|FAIL)/, { timeout: 30 * 60_000 });
  await expect(page.locator("#out")).toContainText("CHECK_PASS");
});
