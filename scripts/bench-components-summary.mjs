import {readFile,readdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {stats} from './bench-interactions-summary.mjs';
import {integrityError} from './bench-resource-integrity.mjs';
export const kinds=['button','text','number','checkbox','switch','select','datagrid'];
export const groupKeys=kinds.flatMap(k=>(k==='datagrid'?[100,1000]:[1,50]).map(n=>k+'/'+n));
export function metrics(kind,native=false){
    return {firstMount:1,remount:8,parentRerender:8,...(kind==='datagrid'?
        {sortData:8,filterData:8,pageData:8,updateData:8}:
        {firstAction:1,action:8,...(kind==='select'&&!native?{firstOpen:1,open:8}:{})})};
}
export function componentError(r,manifest){
    if(r.kind!=='components-v1'||r.success!==true||!Array.isArray(r.errors)||r.errors.length||r.repeats!==8)return 'failed component run';
    if(!manifest)return 'missing publication manifest';
    const integrity=integrityError(r,manifest);if(integrity)return integrity;
    const variant=manifest.Variants.find(v=>v.Name===r.variant);
    if(!variant||variant.Library!==r.library)return 'library mismatch';
    const native=r.library==='Blazorise';
    if(r.selectPopup!==(native?'native':'custom'))return 'incorrect select model';
    if(r.environment?.visibility!=='visible'||r.environment.serviceWorker!==false||
        r.environment.viewport?.length!==2||r.environment.viewport.some(n=>!Number.isFinite(n)||n<=0))return 'invalid environment';
    if(!r.groups||Object.keys(r.groups).length!==groupKeys.length||groupKeys.some(k=>!r.groups[k]))return 'incorrect groups';
    for(const key of groupKeys){
        const [kind,size]=key.split('/'),g=r.groups[key],contract=metrics(kind,native);
        if(g.kind!==kind||g.size!==Number(size))return 'incorrect group identity';
        if(Object.keys(g.samples||{}).length!==Object.keys(contract).length)return 'incorrect metrics '+key;
        for(const [metric,count]of Object.entries(contract)){
            const samples=g.samples[metric];
            if(samples?.length!==count||samples.some(s=>!Number.isFinite(s.domMs)||!Number.isFinite(s.frameMs)||
                s.domMs<0||s.frameMs<s.domMs))return 'invalid samples '+key+'/'+metric;
            if(['firstAction','action'].includes(metric))for(let i=0;i<count;i++){
                const s=samples[i];
                const target=kind==='button'?String(metric==='firstAction'?1:i+2):kind==='text'?(metric==='action'&&i%2===0?'Bench beta':'Bench alpha'):
                    kind==='number'?(metric==='action'&&i%2===0?'24.75':'12.5'):kind==='select'?(metric==='action'&&i%2===0?'Option 003':'Option 002'):
                    metric==='action'&&i%2===0?'false':'true';
                if(s.target!==target||!Number.isInteger(s.callbackDelta)||s.callbackDelta<1||
                    (kind==='number'?Number(s.bound)!==Number(target):s.bound!==target))return 'bound value not confirmed '+key+'/'+metric;
            }
            if(kind==='datagrid'&&metric.endsWith('Data'))for(const s of samples){
                const expected=metric==='filterData'?Number(size)/2:metric==='pageData'?50:Number(size);
                if(s.verified!==true||s.expectedRows!==expected||s.verifiedRows!==expected||s.verifiedCells!==expected*5||
                    !Number.isInteger(s.callbackDelta)||s.callbackDelta<1)return 'grid cells not confirmed '+key+'/'+metric;
            }
        }
        if(kind==='select'&&native&&!g.exclusions?.some(x=>x.includes('Native select popup')))return 'missing native select exclusion';
    }
    return null;
}
export function summarize(records,schedule,manifest){
    if(!schedule.length||schedule.some(s=>!Number.isInteger(s.round)||s.round<0||!s.variant))throw new Error('invalid schedule');
    const expected=new Set(schedule.flatMap(s=>['cold','warm'].map(c=>`${s.round}:${s.variant}:${c}`)));
    if(expected.size!==schedule.length*2)throw new Error('duplicate schedule');
    const seen=new Set(),failures=[],variants={};
    for(const r of records){
        const key=`${r.round}:${r.variant}:${r.cache}`;
        const reason=!expected.has(key)?'unexpected identity':seen.has(key)?'duplicate identity':componentError(r,manifest);seen.add(key);
        if(reason){failures.push({key,reason,errors:r.errors});continue;}
        const v=variants[r.variant]??={};
        for(const [k,g]of Object.entries(r.groups)){
            const group=v[k]??={exclusions:g.exclusions,metrics:{},domNodes:[]};group.domNodes.push(g.domNodes);
            for(const [metric,samples]of Object.entries(g.samples)){
                const m=group.metrics[metric]??={domSamples:[],frameSamples:[],pages:[]};
                m.domSamples.push(...samples.map(s=>s.domMs));m.frameSamples.push(...samples.map(s=>s.frameMs));
                m.pages.push({round:r.round,cache:r.cache,dom:stats(samples.map(s=>s.domMs)),frame:stats(samples.map(s=>s.frameMs))});
            }
        }
    }
    for(const v of Object.values(variants))for(const g of Object.values(v))for(const m of Object.values(g.metrics)){
        m.dom=stats(m.domSamples);m.frame=stats(m.frameSamples);
        m.pageMedianDom=stats(m.pages.map(p=>p.dom.median));m.pageMedianFrame=stats(m.pages.map(p=>p.frame.median));
    }
    const missing=[...expected].filter(k=>!seen.has(k));
    return{kind:'components-v1',runs:records.length,expectedRuns:expected.size,failures,missing,variants,
        complete:!failures.length&&!missing.length&&records.length===expected.size};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
    const dir=process.argv[2];if(!dir)throw new Error('usage: node scripts/bench-components-summary.mjs <results>');
    const read=async p=>JSON.parse((await readFile(p,'utf8')).replace(/^\uFEFF/,''));
    const records=[];for(const n of await readdir(dir))if(/^round-\d+-.*\.json$/.test(n))records.push(await read(join(dir,n)));
    const result=summarize(records,await read(join(dir,'schedule.json')),await read(join(dir,'manifest.json')));
    await writeFile(join(dir,'components-summary.json'),JSON.stringify(result,null,2));
    console.log(JSON.stringify({complete:result.complete,runs:result.runs,expected:result.expectedRuns,failures:result.failures,missing:result.missing},null,2));
    if(!result.complete)process.exitCode=1;
}
