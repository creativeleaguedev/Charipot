// Shared branded HTML email card for every outbound transactional mail from the
// Charipot Charity Program. Rotary navy + gold palette, matching the in-app
// high-trust aesthetic. Callers pass a title, optional subtitle/greeting, an
// innerHtml body built from the rowsHtml/noteHtml/paraHtml/calloutHtml helpers,
// and a footer note. emailPlainText() builds a matching plain-text fallback.

const NAVY = 'hsl(217 72% 20%)';
const NAVY_DK = 'hsl(217 72% 14%)';
const GOLD = '#f59e0b';
const SLATE = '#94a3b8';
const SLATE_DK = '#475569';
const CARD_BG = '#0b1220';
const ROW_BG = '#0f1b2e';
const BORDER = '#1e293b';
const INK = '#e2e8f0';

export function rowsHtml(rows: { label: string; value: string; strong?: boolean }[]) {
  return `<table style="width:100%;border-collapse:collapse;font-size:14px">` +
    rows.map((r, i) =>
      `<tr${i < rows.length - 1 ? ` style="border-bottom:1px solid ${BORDER}"` : ''}>` +
      `<td style="padding:11px 0;color:${SLATE}">${r.label}</td>` +
      `<td style="padding:11px 0;text-align:right;font-weight:${r.strong ? '700' : '600'};${r.strong ? `color:${GOLD};` : ''}">${r.value}</td></tr>`
    ).join('') + `</table>`;
}

export function paraHtml(text: string) {
  return `<p style="font-size:15px;line-height:1.6;color:${INK};margin:0 0 14px">${text}</p>`;
}

export function noteHtml(text: string) {
  return `<p style="font-size:13px;color:${SLATE};margin:16px 0 0">${text}</p>`;
}

export function calloutHtml(text: string, tone: 'gold' | 'red' = 'gold') {
  const c = tone === 'red' ? '#dc2626' : GOLD;
  const bg = tone === 'red' ? 'rgba(220,38,38,.08)' : 'rgba(245,158,11,.08)';
  return `<div style="background:${bg};border-left:4px solid ${c};border-radius:8px;padding:12px 16px;margin:16px 0"><p style="margin:0;font-size:13px;color:${INK}">${text}</p></div>`;
}

export function emailCard(opts: { title: string; subtitle?: string; greeting?: string; innerHtml: string; footer?: string }) {
  return `
<div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:auto;background:${CARD_BG};color:${INK};border-radius:16px;overflow:hidden;border:1px solid ${BORDER}">
  <div style="background:linear-gradient(135deg,${NAVY},${NAVY_DK});padding:24px 28px">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
      <div style="width:36px;height:36px;border-radius:10px;background:${GOLD};color:#0b1220;font-weight:800;font-size:18px;line-height:36px;text-align:center">r</div>
      <span style="color:${GOLD};font-size:12px;letter-spacing:.12em;text-transform:uppercase;font-weight:700">Charipot</span>
    </div>
    <h1 style="margin:6px 0 0;color:#fff;font-size:21px">${opts.title}</h1>
    ${opts.subtitle ? `<p style="margin:4px 0 0;color:${SLATE};font-size:13px">${opts.subtitle}</p>` : ''}
  </div>
  <div style="padding:24px 28px">
    ${opts.greeting ? `<p style="font-size:15px;color:${INK};margin:0 0 16px">${opts.greeting}</p>` : ''}
    ${opts.innerHtml}
    <div style="height:1px;background:${BORDER};margin:22px 0 16px"></div>
    <p style="margin:0;text-align:center;color:${SLATE_DK};font-size:12px;line-height:1.6">${opts.footer || 'Charipot Charity Program · Service Above Self'}</p>
  </div>
</div>`;
}

export function emailPlainText(opts: { greeting?: string; lines: string[]; sign?: string }) {
  return [opts.greeting || 'Hello,', '', ...opts.lines, '', opts.sign || '— Charipot Charity Program'].join('\n');
}