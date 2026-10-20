// Renders the date range comparison: full DOM/frame distributions and Flare - analog paired deltas.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const dir = process.argv[2];
if (!dir) throw new Error('usage: node scripts/bench-range-report.mjs <results>');
const summary = JSON.parse(await readFile(join(dir, 'range-summary.json'), 'utf8'));
if (!summary.complete) throw new Error('Incomplete range comparison');
const manifest = JSON.parse((await readFile(join(dir, 'manifest.json'), 'utf8')).replace(/^﻿/, ''));
const schedule = JSON.parse(await readFile(join(dir, 'schedule.json'), 'utf8'));
const rounds = Math.max(...schedule.map(s => s.round)) + 1;
const names = manifest.Variants.map(v => v.Name);
const format = s => [s.median, s.p95, s.max].map(x => x.toFixed(2)).join(' / ');
const median = values => {
    const s = [...values].sort((a, b) => a - b);
    return (s[Math.floor((s.length - 1) / 2)] + s[Math.floor(s.length / 2)]) / 2;
};
let seed = 208;
const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const flare = 'Flare';
const contrasts = [];
const groupOrder = ['fields/1', 'fields/50', 'calendar/1', 'calendar/50', 'popup/1', 'popup/50'];
const groups = groupOrder.filter(group => names.some(name => summary.variants[name]?.[group]));
for (const group of groups) {
    if (!summary.variants[flare]?.[group]) continue;
    const metrics = Object.keys(summary.variants[flare][group]);
    for (const metric of metrics) {
        const pairsFor = other => {
            const a = summary.variants[flare][group][metric].pages;
            const b = summary.variants[other]?.[group]?.[metric]?.pages;
            if (!b) return null;
            return a.map(p => p.dom.median - b.find(q => q.round === p.round && q.cache === p.cache).dom.median);
        };
        for (const other of names) {
            if (other === flare) continue;
            const deltas = pairsFor(other);
            if (!deltas) continue;
            const samples = Array.from({ length: 6000 }, () => median(deltas.map(() => deltas[Math.floor(random() * deltas.length)]))).sort((a, b) => a - b);
            contrasts.push({ group, metric, other, delta: median(deltas), ci95: [samples[149], samples[5849]], pairs: deltas.length });
        }
    }
}
const flareSource = manifest.FlareVersion ? `package ${manifest.FlareVersion}` : 'local source build';
let report = `# TASK-208: date range comparison

Flare ${manifest.FlareSha ?? '(unknown)'}, ${flareSource}; Benchmark ${manifest.BenchmarkSha}. ` +
    `${summary.runs}/${summary.expectedRuns} documents, ${rounds} rounds with alternating order, cold/warm of one publication. ` +
    `Viewport 1280x720, DPR 1, locale en-US, timezone UTC. Release net10.0, trimmed, no AOT, fixed 40 ms response delay.

Startup, transfer size and trusted keyboard/IME/touch UX are excluded. DOM means the protocol condition was reached; frame means the next requestAnimationFrame, not a proven painted pixel. Synthetic pointer sequences were used. ` +
    `Fields is two linked date fields: Flare's own \`FlareDateRangePicker\` in Fields mode, the analogs' marked composition of two of their date pickers. ` +
    `Calendar is the native inline range of all five libraries with one visible month. Popup is the native popup range, measured only for MudBlazor, Radzen and Blazorise; Flare and FluentUI do not ship that component. ` +
    `Different models are reported side by side, never merged into one score. Cold and warm runs of one publication are not independent; the comparison is not an interleaved A/B of Flare versions.

`;
for (const group of groups) {
    const variants = names.filter(n => summary.variants[n]?.[group]);
    const metricSource = summary.variants[variants[0]][group];
    report += `## ${group}\n\n`;
    for (const kind of ['dom', 'frame']) {
        report += `### ${kind}, median / p95 / max, ms\n\n| Metric | N | ${variants.join(' | ')} |\n|---|---|${variants.map(() => '---').join('|')}|\n`;
        for (const metric of Object.keys(metricSource)) {
            const row = variants.filter(n => summary.variants[n][group][metric]);
            const values = summary.variants[row[0]][group][metric];
            report += `| ${metric} | ${values[kind].n} | ${row.map(n => format(summary.variants[n][group][metric][kind])).join(' | ')} |\n`;
        }
        report += '\n';
    }
}
report += `## Paired difference Flare - analog, DOM\n\nBootstrap unit: the median inside one round/cache document; 6000 resamples, seed 208. ` +
    `Positive means Flare is slower. An interval that crosses zero does not prove parity.\n\n| Group | Metric | Analog | Delta, ms | 95% CI |\n|---|---|---|---|---|\n`;
for (const c of contrasts)
    report += `| ${c.group} | ${c.metric} | ${c.other} | ${c.delta.toFixed(2)} | ${c.ci95.map(x => x.toFixed(2)).join(' .. ')} |\n`;
await writeFile(join(dir, 'paired.json'), JSON.stringify(contrasts, null, 2));
await writeFile(join(dir, 'report.md'), report);
console.log(JSON.stringify({ complete: true, groups: groups.length, contrasts: contrasts.length, report: join(dir, 'report.md') }));
