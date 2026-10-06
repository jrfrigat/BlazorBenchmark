import assert from 'node:assert/strict';
import {stats,summarize,contract} from './bench-interactions-summary.mjs';
assert.deepEqual(stats([1,4,3,2]),{n:4,median:2.5,p95:4,min:1,max:4});
assert.equal(stats(Array.from({length:20},(_,i)=>i+1)).p95,19);
assert.throws(()=>stats([1,NaN]));assert.throws(()=>stats([]));assert.throws(()=>stats([-1]));
function record(cache){
    return {kind:'picker-interactions-v2',variant:'Flare',round:0,cache,success:true,errors:[],
        environment:{visibility:'visible',serviceWorker:false},groups:Object.fromEntries(Object.entries(contract).map(([shape,c])=>
            [shape,{dates:c.dates,times:c.times,samples:Object.fromEntries(Object.entries(c.metrics).map(([name,n])=>
                [name,Array.from({length:n},(_,i)=>({domMs:i+1,frameMs:i+2}))]))}]))};
}
const schedule=[{round:0,variant:'Flare'}],a=record('cold'),b=record('warm');
assert.equal(summarize([a,b],schedule).complete,true);
assert.equal(summarize([a,b],schedule).variants.Flare.date.remount.dom.n,16);
assert.equal(summarize([a,b],schedule).variants.Flare.date.remount.pages.length,2);
assert.equal(summarize([a],schedule).complete,false);
assert.equal(summarize([a,a],schedule).failures[0].reason,'duplicate identity');
for(const mutate of [r=>r.success=false,r=>r.environment.visibility='hidden',r=>r.environment.serviceWorker=true,
    r=>r.groups.date.dates=50,r=>r.groups.mixed.samples.remount.pop(),r=>r.groups.time.samples.openTime[0].domMs=-1,
    r=>r.groups.date.samples.selectDay[0].frameMs=0,r=>r.cache='manual',r=>delete r.groups.time]){
    const invalid=structuredClone(b);mutate(invalid);assert.equal(summarize([a,invalid],schedule).complete,false);
}
assert.throws(()=>summarize([],[]));
assert.throws(()=>summarize([],[...schedule,...schedule]));
console.log('Interaction summary regression checks passed');