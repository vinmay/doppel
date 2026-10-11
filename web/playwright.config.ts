import { defineConfig, devices } from "@playwright/test";

// Projects:
//   pixel7 / small  gameplay with the fake embedder against a test build (npm run test:e2e)
//   live            smoke test of a deployment: PW_BASE_URL=https://... npm run test:live
// The real model can't run in WSL's Chromium (SwiftShader WebGPU, minutes per
// embedding), so `npm run test:model` drives Windows Edge instead (scripts/model-eval.mjs).
const live = process.env.PW_BASE_URL;
const pixel7 = { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } };

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  workers: 2, // WSL has ~10 GB; keep Chromium count low
  use: { baseURL: live ?? "http://localhost:4180" },
  projects: [
    { name: "pixel7", testIgnore: /live\.spec/, use: pixel7 },
    { name: "small", grep: /@small/, testIgnore: /live\.spec/, use: { ...pixel7, viewport: { width: 375, height: 667 } } },
    { name: "live", testMatch: /live\.spec/, use: pixel7 },
  ],
  webServer: live
    ? undefined
    : {
        command: "VITE_ALLOW_FAKE=1 npx vite build && npx vite preview --outDir dist-e2e --port 4180 --strictPort",
        port: 4180,
        reuseExistingServer: false, // a stale preview server would test an old build
        timeout: 180_000,
      },
});
