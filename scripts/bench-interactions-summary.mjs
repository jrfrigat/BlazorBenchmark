// Strict interaction aggregation: retain failures and page medians; never score incomplete runs as winners.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
const context={window:{}};
vm.runInNewContext(await readFile(new URL('../src/Bench.Shared/wwwroot/bench.js',import.meta.url),'utf8'),context);
export const stats = values => JSON.parse(JSON.stringify(context.window.bench.stats(values)));
const base={firstMount:1,remount:8,parentRerender:8};
const date={firstOpenDate:1,openDate:8,nextMonth:8,typeDateCommit:8,selectDay:8,selectDayClose:8};
const time={firstOpenTime:1,openTime:8};
export const contract={date:{dates:1,times:0,metrics:{...base,...date}},
    time:{dates:0,times:1,metrics:{...base,...time}},mixed:{dates:50,times:50,metrics:{...base,...date,...time}}};
export function summarize(records,schedule) {
    if (!schedule.length || schedule.some(s=>!Number.isInteger(s.round)||s.round<0||typeof s.variant!=='string'||!s.variant)) throw new Error('invalid schedule');
    const expected=new Set(schedule.flatMap(s=>['cold','warm'].map(cache=>s.round+':'+s.variant+':'+cache)));
    if (expected.size!==schedule.length*2) throw new Error('duplicate schedule identity');
    const seen=new Set(), failures=[],variants={};
    for(const r of records){
        const key=r.round+':'+r.variant+':'+r.cache;
        let reason=null;
        if(!expected.has(key))reason='unexpected identity';
        else if(seen.has(key))reason='duplicate identity';
        seen.add(key);
        if(r.kind!=='picker-interactions-v2'||!r.success||r.errors?.length)reason??='failed interaction run';
        if(r.environment?.visibility!=='visible'||r.environment?.serviceWorker)reason??='invalid environment';
        for(const [shape,c] of Object.entries(contract)){
            const g=r.groups?.[shape];
            if(g?.dates!==c.dates||g?.times!==c.times) {reason??='incorrect shape '+shape;continue;}
            for(const [metric,n] of Object.entries(c.metrics)){
                const samples=g.samples?.[metric];
                if(samples?.length!==n||samples.some(s=>!Number.isFinite(s.domMs)||!Number.isFinite(s.frameMs)||
                    s.domMs<0||s.frameMs<s.domMs))reason??='invalid samples '+shape+'/'+metric;
            }
        }
        if(reason){failures.push({key,reason,errors:r.errors});continue;}
        const variant=variants[r.variant]??={};
        for(const [shape,c] of Object.entries(contract)){
            const group=variant[shape]??={};
            for(const metric of Object.keys(c.metrics)){
                const samples=r.groups[shape].samples[metric];
                const m=group[metric]??={domSamples:[],frameSamples:[],pages:[]};
                m.domSamples.push(...samples.map(s=>s.domMs));m.frameSamples.push(...samples.map(s=>s.frameMs));
                m.pages.push({round:r.round,cache:r.cache,dom:stats(samples.map(s=>s.domMs)),frame:stats(samples.map(s=>s.frameMs))});
            }
        }
    }
    for(const variant of Object.values(variants)) for(const group of Object.values(variant))
        for(const m of Object.values(group)){m.dom=stats(m.domSamples);m.frame=stats(m.frameSamples);}
    const missing=[...expected].filter(key=>!seen.has(key));
    return {kind:'picker-interactions-v2',expectedRuns:expected.size,runs:records.length,missing,failures,variants,
        complete:missing.length===0&&failures.length===0&&records.length===expected.size};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
    const dir=process.argv[2];if(!dir)throw new Error('usage: node scripts/bench-interactions-summary.mjs <results>');
    const schedule=JSON.parse(await readFile(join(dir,'schedule.json'),'utf8'));
    const records=[];
    for(const name of await readdir(dir))if(/^round-\d+-.*\.json$/.test(name))records.push(JSON.parse(await readFile(join(dir,name),'utf8')));
    const result=summarize(records,schedule);
    await writeFile(join(dir,'interactions-summary.json'),JSON.stringify(result,null,2));
    console.log(JSON.stringify({complete:result.complete,runs:result.runs,expected:result.expectedRuns,failures:result.failures,missing:result.missing},null,2));
    if(!result.complete)process.exitCode=1;
}