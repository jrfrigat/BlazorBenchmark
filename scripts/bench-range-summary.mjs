// Strict aggregation of the date range comparison: retain failures and page medians; never score an
// incomplete run as a winner.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { integrityError } from './bench-resource-integrity.mjs';
const context = { window: {} };
vm.runInNewContext(await readFile(new URL('../src/Bench.Shared/wwwroot/range.js', import.meta.url), 'utf8'), context);
export const stats = values => JSON.parse(JSON.stringify(context.window.benchRange.stats(values)));
const base = { firstMount: 1, remount: 8, parentRerender: 8 };
const fields = { firstOpenStart: 1, openStart: 8, firstOpenEnd: 1, openEnd: 8, nextMonth: 1, prevMonth: 1,
    typeRange: 8, selectEnd: 8, selectStart: 8 };
const calendar = { nextMonth: 8, prevMonth: 8, selectRange: 8 };
const popup = { firstOpen: 1, open: 8, nextMonth: 1, prevMonth: 1, selectRange: 8 };
const profiles = { fields, calendar, popup };
const popupLibraries = new Set(['MudBlazor', 'Radzen', 'Blazorise']);
export function contractFor(library) {
    const groups = {};
    for (const count of [1, 50]) {
        for (const profile of ['fields', 'calendar', 'popup']) {
            if (profile === 'popup' && !popupLibraries.has(library)) continue;
            groups[profile + '/' + count] = { units: count, metrics: { ...base, ...profiles[profile] } };
        }
    }
    return groups;
}
export function summarize(records, schedule, manifest) {
    if (!schedule.length || schedule.some(s => !Number.isInteger(s.round) || s.round < 0 || typeof s.variant !== 'string' || !s.variant))
        throw new Error('invalid schedule');
    const expected = new Set(schedule.flatMap(s => ['cold', 'warm'].map(cache => s.round + ':' + s.variant + ':' + cache)));
    if (expected.size !== schedule.length * 2) throw new Error('duplicate schedule identity');
    const seen = new Set(), failures = [], variants = {};
    for (const r of records) {
        const key = r.round + ':' + r.variant + ':' + r.cache;
        let reason = null;
        if (!expected.has(key)) reason = 'unexpected identity';
        else if (seen.has(key)) reason = 'duplicate identity';
        seen.add(key);
        if (r.kind !== 'picker-range-v1' || !r.success || r.errors?.length) reason ??= 'failed range run';
        if (!manifest) reason ??= 'missing publication manifest';
        else reason ??= integrityError(r, manifest);
        if (r.environment?.visibility !== 'visible' || r.environment?.serviceWorker) reason ??= 'invalid environment';
        const contract = contractFor(r.library);
        for (const [group, c] of Object.entries(contract)) {
            const g = r.groups?.[group];
            if (g?.units !== c.units) { reason ??= 'incorrect group ' + group; continue; }
            for (const [metric, n] of Object.entries(c.metrics)) {
                const samples = g.samples?.[metric];
                if (samples?.length !== n || samples.some(s => !Number.isFinite(s.domMs) || !Number.isFinite(s.frameMs) ||
                    s.domMs < 0 || s.frameMs < s.domMs)) reason ??= 'invalid samples ' + group + '/' + metric;
            }
        }
        for (const group of Object.keys(r.groups ?? {})) if (!contract[group]) reason ??= 'unexpected group ' + group;
        if (reason) { failures.push({ key, reason, errors: r.errors }); continue; }
        const variant = variants[r.variant] ??= {};
        for (const [group, c] of Object.entries(contract)) {
            const bucket = variant[group] ??= {};
            for (const metric of Object.keys(c.metrics)) {
                const samples = r.groups[group].samples[metric];
                const m = bucket[metric] ??= { domSamples: [], frameSamples: [], pages: [] };
                m.domSamples.push(...samples.map(s => s.domMs));
                m.frameSamples.push(...samples.map(s => s.frameMs));
                m.pages.push({ round: r.round, cache: r.cache, dom: stats(samples.map(s => s.domMs)), frame: stats(samples.map(s => s.frameMs)) });
            }
        }
    }
    for (const variant of Object.values(variants)) for (const group of Object.values(variant))
        for (const m of Object.values(group)) { m.dom = stats(m.domSamples); m.frame = stats(m.frameSamples); }
    const missing = [...expected].filter(key => !seen.has(key));
    return { kind: 'picker-range-v1', expectedRuns: expected.size, runs: records.length, missing, failures, variants,
        complete: missing.length === 0 && failures.length === 0 && records.length === expected.size };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const dir = process.argv[2];
    if (!dir) throw new Error('usage: node scripts/bench-range-summary.mjs <results>');
    const schedule = JSON.parse(await readFile(join(dir, 'schedule.json'), 'utf8'));
    const records = [];
    for (const name of await readdir(dir)) if (/^round-\d+-.*\.json$/.test(name)) records.push(JSON.parse(await readFile(join(dir, name), 'utf8')));
    const manifest = JSON.parse((await readFile(join(dir, 'manifest.json'), 'utf8')).replace(/^﻿/, ''));
    const result = summarize(records, schedule, manifest);
    await writeFile(join(dir, 'range-summary.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ complete: result.complete, runs: result.runs, expected: result.expectedRuns, failures: result.failures, missing: result.missing }, null, 2));
    if (!result.complete) process.exitCode = 1;
}
