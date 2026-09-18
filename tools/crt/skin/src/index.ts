// tools/crt/skin/src/index.ts
//
// The CRT skin's program: everything the CSS/token layer cannot express
// on its own - scanlines, a phosphor bloom, and a faint 60 Hz brightness
// flicker over the whole shell. Written against MASTER's Program shape
// (the Skin-scripts series brief) and using nothing but the `'@kumin/
// skin'` SDK: no fetch, no timers outside `ctx.raf`, no DOM access
// outside the one overlay element this creates and removes itself.
//
// `skin` (imported below, matching MASTER's own worked example) is the
// exact same context object `activate` receives as `ctx` - the import
// exists only so a future `deactivate()` could reach it too, since
// MASTER's shape gives `deactivate` no parameter. This program does not
// need one: everything it does is either a `ctx.raf`/`ctx.css` registration
// (torn down automatically) or undone by the cleanup function `activate`
// itself returns, so there is nothing left for a `deactivate` to do.
import { skin } from '@kumin/skin';
import type { SkinScriptContext } from '@kumin/skin';

/** Scanlines + a radial phosphor bloom, as one CSS custom property the
 *  flicker loop nudges every frame - see `css` below. Kept as one style
 *  tag (removed as a whole by `ctx.css`'s own cleanup) rather than
 *  several, so there is exactly one thing to reason about. */
function css(): string {
  return `
    .crt-overlay {
      position: fixed;
      inset: 0;
      z-index: 2147483000;
      pointer-events: none;
      mix-blend-mode: screen;
      opacity: var(--crt-flicker, 1);
      background:
        repeating-linear-gradient(
          to bottom,
          rgba(57, 255, 20, 0.05) 0px,
          rgba(57, 255, 20, 0.05) 1px,
          transparent 1px,
          transparent 3px
        ),
        radial-gradient(
          ellipse at center,
          rgba(57, 255, 20, 0.05) 0%,
          rgba(2, 8, 5, 0) 70%
        );
      transition: opacity 16ms linear;
    }
  `;
}

/** The 60 Hz flicker: a small, mostly-imperceptible brightness wobble
 *  driven by `ctx.raf`, which the runtime clears on deactivate - never a
 *  bare `setInterval`, exactly the rule the designer prompt states. The
 *  amplitude is deliberately tiny (±3%) so the strip stays perfectly
 *  usable; a CRT that actually strobed would be a worse skin, not a
 *  better one. */
function startFlicker(ctx: SkinScriptContext, root: HTMLElement): void {
  const tick = (): void => {
    const wobble = 1 - 0.02 - Math.random() * 0.03;
    root.style.setProperty('--crt-flicker', wobble.toFixed(3));
    ctx.raf(tick);
  };
  ctx.raf(tick);
}

export default async function activate(ctx: SkinScriptContext): Promise<() => void> {
  const removeCss = ctx.css(css());

  // Idempotent: if a previous instance's overlay is somehow still there
  // (a hot-reload during development, a double activation), reuse it
  // rather than stacking a second one - `activate must be idempotent` is
  // the designer prompt's first rule.
  let overlay = ctx.root.querySelector<HTMLDivElement>('.crt-overlay');
  let ownsOverlay = false;
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'crt-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    ctx.root.appendChild(overlay);
    ownsOverlay = true;
  }

  startFlicker(ctx, ctx.root);

  // A late-mounted shell (the field strip, a window that opens after
  // activation) never needs anything from this program directly - the
  // overlay sits above everything by z-index alone - but `ctx.observe`
  // is how a scripted skin would reach into new DOM if it ever needed to,
  // and `skin.log` below is the module-level `@kumin/skin` import earning
  // its keep without duplicating what `ctx.log` already does.
  skin.log('crt: scanline + flicker overlay attached');

  return () => {
    removeCss();
    if (ownsOverlay) overlay?.remove();
  };
}
