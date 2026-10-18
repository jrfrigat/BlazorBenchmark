import assert from 'node:assert/strict';
import {componentError,summarize,kinds,metrics} from './bench-components-summary.mjs';
import {publicationId} from './bench-resource-integrity.mjs';
const paths=['bench.js','analytics.js','bench-configs.js','component-configs.js','components.js'].map(n=>'_content/Bench.Shared/'+n);
const assets=paths.map(Path=>({Path,Sha256:'a'.repeat(64)}));
const manifest={Variants:[{Name:'Flare',Library:'Flare',Assets:assets},{Name:'Blazorise',Library:'Blazorise',Assets:assets}]};
function record(library='Flare',cache='cold'){
    const native=library==='Blazorise';
    const r={kind:'components-v1',variant:library,library,cache,round:0,repeats:8,selectPopup:native?'native':'custom',
        success:true,errors:[],environment:{visibility:'visible',serviceWorker:false,viewport:[1280,720]},groups:{},
        resourceIntegrity:{success:true,errors:[],publicationId:publicationId(manifest),loadedPaths:paths.map(p=>'/'+p),
            checked:paths.map(p=>({path:'/'+p,expected:'a'.repeat(64),actual:'a'.repeat(64)}))}};
    for(const kind of kinds)for(const size of kind==='datagrid'?[100,1000]:[1,50]){
        const g=r.groups[kind+'/'+size]={kind,size,domNodes:20,exclusions:native&&kind==='select'?['Native select popup excluded']:[],samples:{}};
        for(const [metric,n]of Object.entries(metrics(kind,native)))g.samples[metric]=Array.from({length:n},(_,i)=>{
            const s={domMs:2,frameMs:5};
            if(['action','firstAction'].includes(metric)){
                s.target=kind==='button'?String(metric==='firstAction'?1:i+2):kind==='text'?(metric==='action'&&i%2===0?'Bench beta':'Bench alpha'):
                    kind==='number'?(metric==='action'&&i%2===0?'24.75':'12.5'):kind==='select'?(metric==='action'&&i%2===0?'Option 003':'Option 002'):
                    metric==='action'&&i%2===0?'false':'true';s.bound=s.target;s.callbackDelta=1;
            }
            if(kind==='datagrid'&&metric.endsWith('Data')){
                s.expectedRows=metric==='filterData'?size/2:metric==='pageData'?50:size;
                s.verifiedRows=s.expectedRows;s.verifiedCells=s.expectedRows*5;s.callbackDelta=1;s.verified=true;
            }
            return s;
        });
    }
    return r;
}
const schedule=[{round:0,variant:'Flare'},{round:0,variant:'Blazorise'}];
const valid=[record(),record('Flare','warm'),record('Blazorise'),record('Blazorise','warm')];
assert.equal(summarize(valid,schedule,manifest).complete,true);
assert.equal(summarize(valid,schedule,manifest).variants.Flare['text/50'].metrics.action.pageMedianDom.n,2);
assert.equal(summarize(valid.slice(1),schedule,manifest).complete,false);
assert.equal(summarize([...valid,valid[0]],schedule,manifest).failures[0].reason,'duplicate identity');
function rejects(change,pattern){const r=record();change(r);assert.match(componentError(r,manifest),pattern);}
rejects(r=>delete r.groups['number/50'],/groups/);
rejects(r=>r.groups['button/1'].samples.action[0].callbackDelta=0,/bound value/);
rejects(r=>r.groups['text/50'].samples.action[0].bound='unchanged',/bound value/);
rejects(r=>r.groups['datagrid/1000'].samples.sortData[0].verifiedRows=50,/grid cells/);
rejects(r=>r.groups['datagrid/100'].samples.pageData[0].verifiedCells=1,/grid cells/);
rejects(r=>r.groups['select/50'].samples.open.pop(),/samples/);
rejects(r=>r.groups['number/1'].samples.firstAction[0].domMs=NaN,/samples/);
rejects(r=>r.environment.visibility='hidden',/environment/);
rejects(r=>r.resourceIntegrity.checked.pop(),/resource check/);
rejects(r=>r.selectPopup='native',/select model/);
assert.throws(()=>summarize(valid,[schedule[0],schedule[0]],manifest),/duplicate schedule/);
console.log('Component benchmark rejects incomplete runs, wrong bound values, unverified grid cells and stale drivers.');
