// Regression checks for the reporting contract, independent of browser timing noise.
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const dir = await mkdtemp(join(tmpdir(),'bench-summary-'));
function sample(variant,round,appReady,success=true) {
    return {variant,round,cache:'cold',success,startup:{appReadyMs:appReady,firstContentfulPaintMs:40,largestContentfulPaintMs:null},
        emptyHostFrameMs:appReady+20,startupResources:[{name:'/_framework/blazor.webassembly.js',start:10,transfer:100}],
        coldMount:{ms:80},warmMount:{ms:60},registration:variant.startsWith('Flare')?{ms:4}:null};
}
try {
    for (const record of [sample('Flare',0,100),sample('FlareAll',0,130),
        sample('Flare',1,120),sample('FlareAll',1,140),sample('Flare',2,999,false)]) {
        await writeFile(join(dir,'round-'+record.round+'-'+record.variant+'-cold.json'),JSON.stringify(record));
    }
    execFileSync(process.execPath,[resolve('scripts/bench-summary.mjs'),dir]);
    const result=JSON.parse(await readFile(join(dir,'summary.json'),'utf8'));
    assert.equal(result.runs,5);
    assert.equal(result.failures.length,1);
    assert.equal(result.variants.Flare.cold.appReady.n,2);
    assert.equal(result.variants.Flare.cold.appReady.median,110);
    assert.equal(result.variants.Flare.cold.lcpAtEmptyHost,null);
    assert.equal(result.pairedAllMinusMd2.cold.median,25);
    assert.deepEqual(result.pairedAllMinusMd2.cold.values,[30,20]);
    assert.equal(result.variants.Flare.cold.startupTransfer.median,100);
    await writeFile(join(dir,'schedule.json'),JSON.stringify([{}, {}, {}]));
    assert.throws(() => execFileSync(process.execPath,[resolve('scripts/bench-summary.mjs'),dir]),
        error => error.status === 1);
    const incomplete=JSON.parse(await readFile(join(dir,'summary.json'),'utf8'));
    assert.equal(incomplete.expectedRuns,6);
    assert.equal(incomplete.complete,false);
    await writeFile(join(dir,'round-2-Flare-cold.json'),JSON.stringify(sample('Flare',2,110)));
    await writeFile(join(dir,'round-2-FlareAll-cold.json'),JSON.stringify(sample('FlareAll',2,135)));
    execFileSync(process.execPath,[resolve('scripts/bench-summary.mjs'),dir]);
    const complete=JSON.parse(await readFile(join(dir,'summary.json'),'utf8'));
    assert.equal(complete.complete,true);

    console.log('Summary regression checks passed');
} finally { await rm(dir,{recursive:true,force:true}); }
