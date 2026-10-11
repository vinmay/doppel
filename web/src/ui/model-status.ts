import { getEmbedder, onModelProgress, UnsupportedError } from "../embed";
import { MODEL_BYTES } from "../embed/model-source";
import { isQuotaError, requestPersistentStorage } from "../pwa";
import { esc } from "./dom";

const mb = (b: number) => Math.round(b / 1e6);

/**
 * Starts loading the model and shows progress in `el`. Resolves once the
 * model is ready; on failure, shows a readable message and rethrows.
 */
export async function loadModelWithStatus(el: HTMLElement): Promise<void> {
  const show = (html: string) => (el.innerHTML = html);
  const off = onModelProgress((p) => {
    if (p.phase === "download") {
      const pct = Math.min(100, (p.loaded / p.total) * 100);
      show(`
        <div class="notice">
          <p>Downloading the AI model, one time only: <strong>${mb(p.loaded)} / ${mb(p.total)} MB</strong></p>
          <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct.toFixed(0)}"><div style="width:${pct}%"></div></div>
          <p class="muted">Use Wi-Fi if you can. After this, Doppel works offline.</p>
        </div>`);
    } else if (p.loaded < p.total) {
      show(`<div class="notice"><p>Starting the model on your device…</p></div>`);
    }
  });
  try {
    void requestPersistentStorage();
    await getEmbedder().ready();
    show("");
  } catch (e) {
    const msg = e instanceof UnsupportedError
      ? e.message
      : isQuotaError(e)
        ? `There isn't enough free storage on this device to save the ${MODEL_SIZE_LABEL} model. Free up some space (or leave private browsing) and try again.`
        : `The model couldn't load: ${(e as Error).message}`;
    show(`<div class="notice error"><p>${esc(msg)}</p></div>`);
    throw e;
  } finally {
    off();
  }
}

export const MODEL_SIZE_LABEL = `${mb(MODEL_BYTES)} MB`;
