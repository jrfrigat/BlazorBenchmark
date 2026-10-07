import assert from 'node:assert/strict';
import {publicationId} from './bench-resource-integrity.mjs';
import {metrics,summarize} from './bench-time-summary.mjs';
const assets=['bench.js','analytics.js','bench-configs.js','time-configs.js','time-values.js'].map(n=>({Path:'_content/Bench.Shared/'+n,Sha256:'a'.repeat(64)}));
const manifest={Variants:[{Name:'Flare',Library:'Flare',Assets:assets}]};
function record(cache){return {kind:'time-values-v1',library:'Flare',variant:'Flare',round:0,cache,repeats:8,success:true,errors:[],modelOrder:['Dial','Dropdown','List'],
    environment:{visibility:'visible',serviceWorker:false,viewport:[926,1244]},
    resourceIntegrity:{success:true,errors:[],publicationId:publicationId(manifest),loadedPaths:assets.map(a=>'/'+a.Path),checked:assets.map(a=>({path:'/'+a.Path,expected:a.Sha256,actual:a.Sha256}))},
    groups:Object.fromEntries(['Dial','Dropdown','List'].flatMap(model=>[1,50].map(count=>[model+'/'+count,{model,count,samples:Object.fromEntries(Object.entries(metrics).map(([metric,n])=>[metric,Array.from({length:n},(_,i)=>{
        const odd=(metric==='select'||metric==='type')?(i+1)%2:0;
        const target=metric.toLowerCase().includes('type')?(odd?'09:30:00':'10:45:00'):(odd?'10:45:00':'09:30:00');
        return {domMs:1,frameMs:2,target,bound:target,callbackDelta:1};
    })]))}])))};}
const schedule=[{round:0,variant:'Flare'}],a=record('cold'),b=record('warm');
assert.equal(summarize([a,b],schedule,manifest).complete,true);
assert.equal(summarize([a,b],schedule,manifest).variants.Flare['Dial/50'].select.dom.n,16);
for(const mutate of [r=>r.success=false,r=>r.repeats=4,r=>r.modelOrder.pop(),r=>delete r.groups['List/50'],r=>r.groups['Dial/1'].count=50,
 r=>r.groups['List/1'].samples.select.pop(),r=>r.groups['Dial/1'].samples.type[0].bound='09:30:01',r=>r.groups['Dial/1'].samples.firstType[0].callbackDelta=0,
 r=>r.groups['Dial/1'].samples.open[0].domMs=-1,r=>r.groups['Dial/1'].samples.firstOpen[0].frameMs=0,
 r=>r.library='MudBlazor',r=>r.environment.visibility='hidden',r=>r.environment.serviceWorker=true,r=>r.kind='picker-interactions-v3',
 r=>delete r.resourceIntegrity,r=>r.resourceIntegrity.publicationId='old',r=>r.resourceIntegrity.checked[0].actual='b'.repeat(64),
 r=>{r.resourceIntegrity.checked.pop();r.resourceIntegrity.loadedPaths.pop();},r=>r.cache='manual']){
 const bad=structuredClone(b);mutate(bad);assert.equal(summarize([a,bad],schedule,manifest).complete,false);
}
assert.equal(summarize([a],schedule,manifest).complete,false);assert.equal(summarize([a,a],schedule,manifest).complete,false);
assert.throws(()=>summarize([],[],manifest));assert.throws(()=>summarize([],[...schedule,...schedule],manifest));
console.log('Time value summary regression checks passed');

const {timeManifest}=await import('./bench-time-plan.mjs');
const planned=timeManifest({Variants:[...manifest.Variants,{Name:'MudBlazor',Library:'MudBlazor',Assets:assets}]});
assert.deepEqual(planned.Variants.map(v=>v.Name),['Flare-Dial','Flare-Dropdown','Flare-List','MudBlazor']);
assert.equal(planned.Variants[2].SourceVariant,'Flare');assert.equal(planned.Variants[2].TimeModel,'List');
assert.equal(manifest.Variants.length,1);assert.throws(()=>timeManifest({Variants:[...manifest.Variants,...manifest.Variants]}));
const single=record('cold');single.variant='Flare-List';single.modelOrder=['List'];single.groups=Object.fromEntries(Object.entries(single.groups).filter(([k])=>k.startsWith('List/')));
single.resourceIntegrity.publicationId=publicationId(planned);
const warm=structuredClone(single);warm.cache='warm';
const plan=[{variant:'Flare-List',round:0}];assert.equal(summarize([single,warm],plan,planned).complete,true);
const mixed=structuredClone(warm);mixed.modelOrder.push('Dial');assert.equal(summarize([single,mixed],plan,planned).complete,false);
console.log('Independent popup model document checks passed');
