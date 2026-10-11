const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Escape text for interpolation into HTML. */
export const esc = (s: unknown) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

/**
 * Render a screen. A screen with a dock (the primary button) gets its content
 * wrapped in its own scroll area that ends above the dock, so nothing can ever
 * sit under the dock, at any scroll position or screen size.
 */
export function render(root: HTMLElement, html: string) {
  root.innerHTML = html;
  root.scrollTop = 0;
  const screen = root.querySelector<HTMLElement>(":scope > .screen");
  const dock = screen?.querySelector<HTMLElement>(":scope > .dock");
  if (screen && dock) {
    const scroll = document.createElement("div");
    scroll.className = "scroll";
    scroll.tabIndex = 0; // keyboard users can scroll it (axe: scrollable-region-focusable)
    while (screen.firstChild && screen.firstChild !== dock) scroll.append(screen.firstChild);
    screen.prepend(scroll);
    screen.classList.add("has-dock");
  }
  root.focus({ preventScroll: true });
}
