// Registers the service worker (production builds only) and asks for
// persistent storage so the browser is less likely to evict the cached model.
export function registerPwa() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((e) => console.warn("service worker registration failed", e));
  });
}

export async function requestPersistentStorage(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

export function isQuotaError(e: unknown): boolean {
  return e instanceof DOMException && (e.name === "QuotaExceededError" || e.code === 22);
}
