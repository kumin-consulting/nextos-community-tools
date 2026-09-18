// tools/csv-tools/extension/files/src/index.ts
//
// The worker half of the CSV tools extension: one handler, `previewCsv`,
// named exactly as extension.json's previewRenderers.handler points at it
// (lib/os/extensions in kumin-consulting/jonkum.in, E4, looks the name up
// on this module's exports - see the community repository's README,
// "Shipping an extension"). `ScriptContext` is a type-only import; it
// compiles away and this file has no runtime dependency on '@kumin/script'.
//
// The contextAction and fileHandler contributions in extension.json need
// no code here at all - opening the "table" panel with { path } is
// handled declaratively by the runtime, the same way a script's
// `manual` trigger needs no handler.
import type { ScriptContext } from '@kumin/script';

/** A tiny, dependency-free CSV parser: enough for a preview (no quoted
 *  commas edge cases beyond the common one), not a spec-complete parser -
 *  the panel is where a real table renders; this only has to produce
 *  something readable for Finder's Preview pane. */
function parseCsv(text: string): string[][] {
  return text
    .split(/\r\n|\r|\n/)
    .filter((line) => line.length > 0)
    .map((line) => line.split(',').map((cell) => cell.trim()));
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function previewCsv(path: string, ctx: ScriptContext): Promise<{ kind: 'html'; html: string }> {
  const text = await ctx.fs.readText(path);
  const rows = parseCsv(text).slice(0, 200);
  const [header, ...body] = rows;
  const th = (header ?? []).map((cell) => `<th>${escapeHtml(cell)}</th>`).join('');
  const trs = body.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('');
  const html = `<table style="border-collapse:collapse;font:13px sans-serif"><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>`;
  return { kind: 'html', html };
}
