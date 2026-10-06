import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto,createHash} from 'node:crypto';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {protectHtml,reserveOrigins} from './bench-resource-integrity.mjs';
const context={window:{},URL,Uint8Array};
vm.runInNewContext(await readFile(new URL('../src/Bench.Shared/wwwroot/resource-integrity.js',import.meta.url),'utf8'),context);
const bytes=Buffer.from('export const version=2;');
const hash=createHash('sha256').update(bytes).digest('hex');
const manifest={publicationId:'new',assets:[{Path:'loaded.js',Sha256:hash},{Path:'unused-popup.js',Sha256:hash}]};
const requests=[];
const fetchBody=body=>async(url,options)=>{
    requests.push({url,cache:options.cache});
    return {ok:true,arrayBuffer:async()=>body};
};
const verify=context.window.benchIntegrity.verify;
const good=await verify(manifest,['http://localhost:9000/loaded.js'],'http://localhost:9000',fetchBody(bytes),webcrypto.subtle);
assert.equal(good.success,true);assert.equal(good.checked.length,1);
assert.deepEqual(requests,[{url:'http://localhost:9000/loaded.js',cache:'default'}]);
requests.length=0;
const stale=await verify(manifest,['http://localhost:9000/loaded.js'],'http://localhost:9000',fetchBody(Buffer.from('export const version=1;')),webcrypto.subtle);
assert.equal(stale.success,false);assert.match(stale.errors[0],/hash mismatch/);
assert.equal(requests.length,1);
assert.equal((await verify(manifest,[], 'http://localhost:9000',fetchBody(bytes),webcrypto.subtle)).success,false);
assert.equal((await verify(manifest,['http://localhost:9000/unknown.css'], 'http://localhost:9000',fetchBody(bytes),webcrypto.subtle)).success,false);
assert.equal((await verify(manifest,['https://elsewhere/loaded.js'], 'http://localhost:9000',fetchBody(bytes),webcrypto.subtle)).success,false);
const html=protectHtml('<script src="loaded.js"></script><link rel="stylesheet" href="style.css" />',
    [...manifest.assets,{Path:'style.css',Sha256:hash}]);
assert.equal((html.match(/integrity="sha256-/g)||[]).length,2);
assert.equal(html.includes('/ integrity'),false);
assert.throws(()=>protectHtml('<script src="old.js"></script>',manifest.assets));
const dir=await mkdtemp(join(tmpdir(),'bench-origins-'));
try {
    await reserveOrigins(dir,[9000,9001],'new');
    await assert.rejects(()=>reserveOrigins(dir,[9000],'other'),/already reserved/);
    await assert.rejects(()=>reserveOrigins(dir,[9001],'new'),/already reserved/);
    const outcomes=await Promise.allSettled([reserveOrigins(dir,[9002],'a'),reserveOrigins(dir,[9002],'b')]);
    assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
    assert.equal(outcomes.filter(x=>x.status==='rejected').length,1);
    await assert.rejects(()=>reserveOrigins(dir,[70000],'new'),/invalid/);
} finally {await rm(dir,{recursive:true,force:true});}
console.log('Resource integrity and origin reservation checks passed');
