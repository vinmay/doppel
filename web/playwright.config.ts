import { defineConfig, devices } from "@playwright/test";

// PW_BASE_URL=https://<live site> npx playwright test smoke   -> test a deployment
const live = process.env.PW_BASE_URL;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  use: {
    baseURL: live ?? "http://localhost:4173",
    ...devices["Pixel 7"],
    viewport: { width: 390, height: 844 },
  },
  webServer: live
    ? undefined
    : {
        command: "npm run build && npx vite preview --port 4173 --strictPort",
        port: 4173,
        reuseExistingServer: false, // a stale preview server would test an old build
        timeout: 120_000,
      },
});
