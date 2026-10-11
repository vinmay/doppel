import { expect, test } from "@playwright/test";

// Live smoke (PW_BASE_URL=https://<deployment> npm run test:live): page loads,
// service worker registers, the model download starts (aborted right away so
// the test doesn't pull 388 MB), and the practice reveal renders.
test.skip(!process.env.PW_BASE_URL, "set PW_BASE_URL to the deployed URL");

test("live: loads, registers the service worker, starts the model download, plays the practice reveal", async ({ page, context }) => {
  let modelRequested = "";
  await context.route(/\.litertlm(\?|$)/, (route) => {
    modelRequested = route.request().url();
    return route.abort();
  });
  await page.goto("/");
  await expect(page).toHaveTitle("Doppel");
  await expect(page.getByTestId("practice").locator(".score .n")).toHaveText("85", { timeout: 20_000 });
  await expect(page.getByText("Photos never leave your phone.")).toBeVisible();
  await expect.poll(() => page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())), { timeout: 20_000 }).toBe(true);
  // Chromium here may lack WebGPU; then the app says so instead of downloading.
  const unsupported = page.getByText(/doesn't support WebGPU|no GPU adapter/);
  await expect.poll(async () => modelRequested !== "" || (await unsupported.count()) > 0, { timeout: 20_000 }).toBe(true);
  test.info().annotations.push({ type: "model", description: modelRequested || "WebGPU unavailable in this browser; download not attempted" });
});

test("live: link preview tags and og image", async ({ request }) => {
  const html = await (await request.get("/")).text();
  expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
  expect(html).toContain('<meta property="og:image" content="https://doppel-ws59.onrender.com/og.png">');
  const img = await request.get("/og.png");
  expect(img.status()).toBe(200);
  expect(img.headers()["content-type"]).toContain("image/png");
});
