const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Escape text for interpolation into HTML. */
export const esc = (s: unknown) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

export function render(root: HTMLElement, html: string) {
  root.innerHTML = html;
  root.focus({ preventScroll: true });
}
