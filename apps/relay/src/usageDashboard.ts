import { USAGE_ACTIONS, USAGE_PAGES, USAGE_RETENTION_DAYS } from '@lacuna/protocol/usage';

export type UsageSummaryRow = [metric: string, count: number, browsers: number];

const MIN_BROWSERS = 5;
const pages = [...new Set(Object.values(USAGE_PAGES))];
const number = new Intl.NumberFormat('en-GB');

const breakdowns = {
  exposure: 'Control visibility',
  entry: 'Entry pages',
  transition: 'Page transitions',
  foreground: 'Foreground time',
  'first-action': 'Time to first action',
  render: 'Page readiness',
  scroll: 'Maximum scroll depth',
  input: 'Interaction input',
  screen: 'Screen size',
  mode: 'Input mode',
  release: 'App release',
  source: 'Action entry points',
  breadth: 'Pages used per visit',
  pair: 'Actions used together',
  return: 'Repeat use',
  connectivity: 'Action connectivity',
} as const;

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function label(value: string): string {
  return value[0].toUpperCase() + value.slice(1).replaceAll('-', ' ');
}

function row(...cells: string[]): string {
  return `<tr>${cells.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`;
}

function table(title: string, headers: string[], rows: string[]): string {
  return `<section><h2>${title}</h2><div class="table"><table><thead><tr>${headers
    .map((header) => `<th scope="col">${header}</th>`)
    .join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div></section>`;
}

type Total = { visible: number; withheld: boolean };

function printTotal(value: Total | undefined): string {
  if (!value) return '0';
  if (!value.withheld) return number.format(value.visible);
  return value.visible > 0 ? `≥ ${number.format(value.visible)}` : 'Withheld';
}

function dimensionGroup(metric: string): string | undefined {
  const [kind, page, action] = metric.split('/');
  if (kind === 'source') return `${kind}/${page}/${action}`;
  if (kind === 'online' || kind === 'offline') return `connectivity/${page}/${action}`;
  if (
    [
      'input',
      'screen',
      'mode',
      'release',
      'foreground',
      'first-action',
      'render',
      'scroll',
      'transition',
    ].includes(kind)
  ) {
    return `${kind}/${page}`;
  }
}

function summarise(rowsByDay: ReadonlyMap<string, UsageSummaryRow[]>) {
  const totals = new Map<string, Total>();
  const browsersByDay: string[] = [];
  for (const [day, rows] of rowsByDay) {
    // Keep breakdowns from revealing a withheld cell by subtraction from a parent total.
    const withheldGroups = new Set(
      rows
        .filter(([, , browsers]) => browsers < MIN_BROWSERS)
        .map(([metric]) => dimensionGroup(metric)),
    );
    for (const [metric, count, browsers] of rows) {
      const group = dimensionGroup(metric);
      const withheld =
        browsers < MIN_BROWSERS || (group !== undefined && withheldGroups.has(group));
      const total = totals.get(metric) ?? { visible: 0, withheld: false };
      if (withheld) total.withheld = true;
      else total.visible += count;
      totals.set(metric, total);
      const [kind, page, action] = metric.split('/');
      if (kind === 'view' || kind === 'action') {
        browsersByDay.push(
          row(
            day,
            label(page),
            kind === 'view' ? 'Page visit' : label(action),
            withheld ? 'Withheld' : number.format(browsers),
          ),
        );
      }
    }
  }
  return { totals, browsersByDay };
}

export function usageDashboard(
  days: number,
  oldest: string,
  newest: string,
  rowsByDay: ReadonlyMap<string, UsageSummaryRow[]>,
): string {
  const { totals, browsersByDay } = summarise(rowsByDay);
  const actions = new Map<string, string[]>();
  const other = new Map<string, string[]>();
  for (const [metric, value] of [...totals.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const [kind, page, detail, extra] = metric.split('/');
    if (kind === 'view') continue;
    if (kind === 'action') {
      const entries = actions.get(detail) ?? [];
      entries.push(row(label(detail), label(page), printTotal(value)));
      actions.set(detail, entries);
      continue;
    }
    const connectivity = kind === 'online' || kind === 'offline';
    const group = connectivity ? 'connectivity' : kind;
    const entries = other.get(group) ?? [];
    const labels = [page, detail, extra].filter(Boolean).map(label);
    if (kind === 'return')
      labels[labels.length - 1] = (extra || detail) === 'week' ? '1–7 days' : '8–30 days';
    if (connectivity) labels.push(label(kind));
    const dimension = labels.join(' · ');
    entries.push(row(dimension, printTotal(value)));
    other.set(group, entries);
  }

  const visits = pages.map((page) => row(label(page), printTotal(totals.get(`view/${page}`))));
  const actionRows = USAGE_ACTIONS.flatMap(
    (action) => actions.get(action) ?? [row(label(action), 'All pages', '0')],
  );
  const details = Object.entries(breakdowns).flatMap(([key, title]) => {
    const entries = other.get(key);
    return entries ? [table(title, ['Measure', 'Count'], entries)] : [];
  });

  return `<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Lacuna usage analytics</title><style>
:root{color-scheme:light dark;font-family:system-ui,sans-serif}body{margin:0}
main{max-width:76rem;margin:auto;padding:clamp(1.5rem,4vw,4rem)}h1{margin:0 0 1.5rem}
form{display:flex;align-items:center;flex-wrap:wrap;gap:.75rem;margin-bottom:1rem}
select,button{font:inherit;padding:.35rem .65rem}p{line-height:1.5}
.reports{display:grid;gap:2rem;grid-template-columns:repeat(auto-fit,minmax(min(100%,29rem),1fr))}
section{min-width:0}h2{font-size:1.15rem;margin:1rem 0}
.table{max-height:30rem;overflow:auto}table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
th,td{padding:.55rem .75rem;text-align:left;border-bottom:1px solid GrayText}
th{position:sticky;top:0;background:Canvas}
</style></head><body><main><h1>Lacuna usage analytics</h1>
<form action="/usage/dashboard" method="get">
<label for="days">Reporting period</label><select id="days" name="days">${[
    1,
    7,
    30,
    USAGE_RETENTION_DAYS,
  ]
    .map(
      (period) =>
        `<option value="${period}"${days === period ? ' selected' : ''}>${period === 1 ? 'Latest published day' : period === USAGE_RETENTION_DAYS ? 'All retained days' : `Last ${period} published days`}</option>`,
    )
    .join('')}</select>
<button type="submit">Apply</button></form>
<p>${escapeHtml(oldest)} to ${escapeHtml(newest)} (UTC). Daily groups with fewer than five browsers are withheld. The ≥ sign marks a partial total.</p>
<div class="reports">${table('Page visits', ['Page', 'Visits'], visits)}
${table('Actions', ['Action', 'Page', 'Count'], actionRows)}
${table('Distinct browsers by day', ['Day', 'Page', 'Measure', 'Browsers'], browsersByDay)}
${details.join('')}</div></main></body></html>`;
}
