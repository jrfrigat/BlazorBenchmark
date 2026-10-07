import {createHash} from 'node:crypto';
import {open,mkdir,readFile} from 'node:fs/promises';
export const publicationId = manifest => createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
export function integrityError(record, manifest) {
    const audit=record.resourceIntegrity;
    if (audit?.success !== true || !Array.isArray(audit.errors) || audit.errors.length || audit.publicationId !== publicationId(manifest) || !Array.isArray(audit.checked) || !audit.checked.length || !Array.isArray(audit.loadedPaths))
        return 'unverified publication resources';
    const variant=manifest.Variants.find(v=>v.Name===record.variant);
    const assets=new Map((variant?.Assets || []).map(a=>['/'+a.Path,a.Sha256.toLowerCase()]));
    const seen=new Set();
    for(const item of audit.checked){
        if(seen.has(item.path) || !assets.has(item.path) || item.expected !== assets.get(item.path) || item.actual !== item.expected)
            return 'resource hash mismatch';
        seen.add(item.path);
    }
    const extra=record.kind==='time-values-v1'?['/_content/Bench.Shared/time-configs.js','/_content/Bench.Shared/time-values.js']:[];
    for(const path of [...extra,'/_content/Bench.Shared/bench.js','/_content/Bench.Shared/analytics.js','/_content/Bench.Shared/bench-configs.js'])
        if(!seen.has(path)) return 'missing driver resource check';
    if(new Set(audit.loadedPaths).size !== audit.loadedPaths.length || audit.loadedPaths.length !== seen.size || audit.loadedPaths.some(path=>!seen.has(path)))
        return 'incomplete loaded resource checks';
    return null;
}
export function protectHtml(html, assets) {
    const hashes=new Map(assets.map(a=>[a.Path,a.Sha256]));
    return html.replace(/<(script|link)\b[^>]*>/gi, tag=>{
        const attr=tag.match(/(?:src|href)="([^"]+)"/i);
        if(!attr || (!tag.startsWith('<script') && !/rel="stylesheet"/.test(tag))) return tag;
        const path=new URL(attr[1],'http://localhost/').pathname.slice(1);
        const hash=hashes.get(path);
        if(!hash) throw new Error('unlisted HTML resource '+path);
        const integrity='sha256-'+Buffer.from(hash,'hex').toString('base64');
        return tag.replace(/ integrity="[^"]*"/g,'').replace(/\s*\/?>$/, ' integrity="'+integrity+'">');
    });
}
export async function reserveOrigins(path, ports, id) {
    if(new Set(ports).size !== ports.length || ports.some(p=>!Number.isInteger(p)||p<1024||p>65535))
        throw new Error('invalid origin reservation');
    await mkdir(path,{recursive:true});
    // One exclusive journal file per origin also protects simultaneous server processes.
    for(const port of ports) {
        const file=path+'/'+port+'.json';
        let handle;
        try { handle=await open(file,'wx'); }
        catch(error) { if(error.code==='EEXIST') throw new Error('origin already reserved: '+port+' '+await readFile(file,'utf8')); throw error; }
        try { await handle.writeFile(JSON.stringify({port,publicationId:id,reservedAt:new Date().toISOString()})); }
        finally { await handle.close(); }
    }
}
