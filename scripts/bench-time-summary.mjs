import {readFile,readdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {stats} from './bench-interactions-summary.mjs';
import {integrityError} from './bench-resource-integrity.mjs';
export const metrics={firstMount:1,remount:8,parentRerender:8,firstOpen:1,open:8,firstSelect:1,select:8,firstType:1,type:8};
export function timeError(r,manifest){
    if(r.kind!=='time-values-v1'||r.success!==true||!Array.isArray(r.errors)||r.errors.length||r.repeats!==8)return 'failed time run';
    if(!manifest)return 'missing manifest';
    const integrity=integrityError(r,manifest);if(integrity)return integrity;
    const variant=manifest.Variants.find(v=>v.Name===r.variant),library=variant?.Library;
    if(library!==r.library)return 'library mismatch';
    if(r.environment?.visibility!=='visible'||r.environment?.serviceWorker!==false||!Array.isArray(r.environment.viewport)||r.environment.viewport.some(n=>!Number.isFinite(n)||n<=0))return 'invalid environment';
    const models=library==='Flare'?(variant.TimeModel?[variant.TimeModel]:['Dial','Dropdown','List']):['Default'];
    if(variant.TimeModel&&!['Dial','Dropdown','List'].includes(variant.TimeModel))return 'invalid model manifest';
    if(r.modelOrder?.length!==models.length||new Set(r.modelOrder).size!==models.length||models.some(m=>!r.modelOrder.includes(m)))return 'incorrect models';
    const keys=models.flatMap(m=>[1,50].map(n=>m+'/'+n));
    if(!r.groups||Object.keys(r.groups).length!==keys.length||keys.some(k=>!r.groups[k]))return 'incorrect groups';
    for(const k of keys){
        const g=r.groups[k];
        if(k!==g.model+'/'+g.count)return 'incorrect group identity';
        if(Object.keys(g.samples||{}).length!==Object.keys(metrics).length)return 'incorrect metrics';
        for(const [metric,n]of Object.entries(metrics)){
            const samples=g.samples[metric];
            if(samples?.length!==n||samples.some(s=>!Number.isFinite(s.domMs)||!Number.isFinite(s.frameMs)||s.domMs<0||s.frameMs<s.domMs))return 'invalid samples '+k+'/'+metric;
            if(['firstSelect','select','firstType','type'].includes(metric))for(let i=0;i<n;i++){
                const odd=(metric==='select'||metric==='type')?(i+1)%2:0;
                const target=metric.toLowerCase().includes('type')?(odd?'09:30:00':'10:45:00'):(odd?'10:45:00':'09:30:00');
                const s=samples[i];
                if(s.target!==target||s.bound!==target||!Number.isInteger(s.callbackDelta)||s.callbackDelta<1)return 'bound value not confirmed '+k+'/'+metric;
            }
        }
    }
    return null;
}
export function summarize(records,schedule,manifest){
    if(!schedule.length||schedule.some(s=>!Number.isInteger(s.round)||s.round<0||!s.variant))throw new Error('invalid schedule');
    const expected=new Set(schedule.flatMap(s=>['cold','warm'].map(c=>s.round+':'+s.variant+':'+c)));
    if(expected.size!==schedule.length*2)throw new Error('duplicate schedule');
    const seen=new Set(),failures=[],variants={};
    for(const r of records){
        const key=r.round+':'+r.variant+':'+r.cache;
        const reason=!expected.has(key)?'unexpected identity':seen.has(key)?'duplicate identity':timeError(r,manifest);seen.add(key);
        if(reason){failures.push({key,reason,errors:r.errors});continue;}
        const v=variants[r.variant]??={};
        for(const [k,g]of Object.entries(r.groups)){
            const group=v[k]??={};
            for(const metric of Object.keys(metrics)){
                const s=g.samples[metric],m=group[metric]??={domSamples:[],frameSamples:[],pages:[]};
                m.domSamples.push(...s.map(x=>x.domMs));m.frameSamples.push(...s.map(x=>x.frameMs));
                m.pages.push({round:r.round,cache:r.cache,dom:stats(s.map(x=>x.domMs)),frame:stats(s.map(x=>x.frameMs))});
            }
        }
    }
    for(const v of Object.values(variants))for(const g of Object.values(v))for(const m of Object.values(g)){m.dom=stats(m.domSamples);m.frame=stats(m.frameSamples);}
    const missing=[...expected].filter(k=>!seen.has(k));
    return {kind:'time-values-v1',expectedRuns:expected.size,runs:records.length,failures,missing,variants,complete:!failures.length&&!missing.length&&records.length===expected.size};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
    const dir=process.argv[2];if(!dir)throw new Error('results directory required');
    const records=[];for(const n of await readdir(dir))if(/^round-\d+-.*\.json$/.test(n))records.push(JSON.parse(await readFile(join(dir,n),'utf8')));
    const s=JSON.parse(await readFile(join(dir,'schedule.json'),'utf8')),m=JSON.parse((await readFile(join(dir,'manifest.json'),'utf8')).replace(/^\uFEFF/,''));
    const result=summarize(records,s,m);await writeFile(join(dir,'time-summary.json'),JSON.stringify(result,null,2));
    console.log(JSON.stringify({complete:result.complete,runs:result.runs,expected:result.expectedRuns,failures:result.failures,missing:result.missing},null,2));if(!result.complete)process.exitCode=1;
}
