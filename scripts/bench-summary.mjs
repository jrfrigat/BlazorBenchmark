import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const dir = process.argv[2];
if (!dir) throw new Error('usage: node scripts/bench-summary.mjs <results directory>');
export function stats(values) {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (!sorted.length) return null;
    const n = sorted.length, median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
    return { n, median, min: sorted[0], max: sorted[n - 1], values };
}
const data = [];
for (const name of await readdir(dir)) {
    if (!/^round-\d+-.*\.json$/.test(name)) continue;
    data.push(JSON.parse(await readFile(join(dir, name), 'utf8')));
}
let expectedRuns = null;
try { expectedRuns = 2 * JSON.parse(await readFile(join(dir, 'schedule.json'), 'utf8')).length; } catch (_) {}
const summary = { expectedRuns, generatedAt: new Date().toISOString(), runs: data.length, failures: data.filter(d => !d.success), variants: {} };
for (const variant of [...new Set(data.map(d => d.variant))]) {
    summary.variants[variant] = {};
    for (const cache of ['cold', 'warm']) {
        const runs = data.filter(d => d.variant === variant && d.cache === cache);
        if (!runs.length) continue;
        const metric = get => stats(runs.filter(d => d.success).sort((a,b) => a.round-b.round).map(get));
        summary.variants[variant][cache] = {
            appReady: metric(d => d.startup.appReadyMs), emptyHostFrame: metric(d => d.emptyHostFrameMs),
            styledHostFrame: metric(d => d.styledHostFrameMs), fieldsReadyAt: metric(d => d.coldMount.at),
            generatedAndLinkedCssCharacters: metric(d => d.startupCss?.textCharacters), cssRules: metric(d => d.startupCss?.rules),
            fcp: metric(d => d.startup.firstContentfulPaintMs), lcpAtEmptyHost: metric(d => d.startup.largestContentfulPaintMs),
            loaderStart: metric(d => d.startupResources.find(r => /blazor.webassembly/.test(r.name))?.start),
            mount: metric(d => d.coldMount.ms), warmMount: metric(d => d.warmMount.ms),
            registration: metric(d => d.registration?.ms),
            startupTransfer: metric(d => d.startupResources.reduce((n,r) => n + r.transfer, 0)),
            themeDecoded: metric(d => d.startupResources.filter(r => /Flare.Theme.*\.wasm$/.test(r.name)).reduce((n,r) => n+r.decoded, 0))
        };
    }
}
summary.pairedAllMinusMd2 = {};
for (const cache of ['cold','warm']) {
    summary.pairedAllMinusMd2[cache] = stats(data.filter(d => d.variant === 'FlareAll' && d.cache === cache && d.success)
        .sort((a,b) => a.round-b.round).map(d => {
            const one = data.find(s => s.variant === 'Flare' && s.cache === cache && s.round === d.round && s.success);
            return one ? d.startup.appReadyMs - one.startup.appReadyMs : NaN;
        }));
}
summary.complete = expectedRuns !== null && data.length === expectedRuns && summary.failures.length === 0;
if (expectedRuns !== null && !summary.complete) process.exitCode = 1;
await writeFile(join(dir, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
