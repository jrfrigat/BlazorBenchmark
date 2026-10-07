// Serve a fresh origin per variant/round; reuse that origin for the warm reload.
// node scripts/bench-compare-serve.mjs <publication> <results> [basePort=6940] [rounds=10] [delay=40]
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, stat, readdir } from 'node:fs/promises';
import { resolve, join, extname, relative, isAbsolute, dirname } from 'node:path';
import {fileURLToPath} from 'node:url';
import {timeManifest} from './bench-time-plan.mjs';
import {publicationId,integrityError,protectHtml,reserveOrigins} from './bench-resource-integrity.mjs';

const [pubArg, resultArg, baseArg='6940', roundsArg='10', delayArg='40', mode='startup'] = process.argv.slice(2);
if (!['startup','interactions','time-values'].includes(mode)) throw new Error('invalid mode');
if (!pubArg || !resultArg) throw new Error('publication and results directories required');
const publication=resolve(pubArg), results=resolve(resultArg);
const base=Number(baseArg), rounds=Number(roundsArg), delay=Number(delayArg);
if (![base, rounds, delay].every(Number.isInteger) || base<1024 || rounds<1 || rounds>50 || delay<0)
    throw new Error('invalid port, round count or delay');
const manifest=JSON.parse((await readFile(join(publication,'manifest.json'),'utf8')).replace(/^\uFEFF/, ''));
if(mode==='time-values') Object.assign(manifest,timeManifest(manifest));
if (base + rounds * manifest.Variants.length - 1 > 65535) throw new Error('port range exceeds 65535');
try { if ((await readdir(results)).length) throw new Error('Use a fresh results directory'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
await mkdir(results,{recursive:true});
await writeFile(join(results,'manifest.json'),JSON.stringify(manifest,null,2));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css',
    '.json':'application/json','.wasm':'application/wasm','.dat':'application/octet-stream',
    '.woff2':'font/woff2','.svg':'image/svg+xml','.png':'image/png','.blat':'application/octet-stream'};
async function exists(path) {try{return (await stat(path)).isFile();}catch{return false;}}
// Avoid ports blocked by Chromium (the validated range starts above 1023).
const blockedPorts = new Set([1719,1720,1723,2049,3659,4045,5060,5061,6000,6566,6665,6666,6667,6668,6669,6697,10080]);
const id=publicationId(manifest);

const ledger=resolve(dirname(fileURLToPath(import.meta.url)),'../.claude/tests/bench-origin-ledger');
// Historical comparison and diagnostic origins had no journal; never reuse them.
if(base <= 6921 && base + rounds * manifest.Variants.length >= 6200) throw new Error('legacy origin range 6200-6921 is reserved');
const reserved=[];
let planned=base;
for(let i=0;i<rounds*manifest.Variants.length;i++){while(blockedPorts.has(planned))planned++;reserved.push(planned++);}
await reserveOrigins(ledger,reserved,id);
const schedule=[];
let nextPort = base;
for(let round=0;round<rounds;round++){
    const order=round%2 ? [...manifest.Variants].reverse() : manifest.Variants;
    for(const variant of order){
        while (blockedPorts.has(nextPort)) nextPort++;
        if (nextPort > 65535) throw new Error('port range exceeds 65535');
        const port=nextPort++, root=join(publication,variant.SourceVariant||variant.Name,'publish/wwwroot');
        const guard=await readFile(join(root,'_content/Bench.Shared/resource-integrity.js'));
        const guardAsset=variant.Assets.find(a=>a.Path==='_content/Bench.Shared/resource-integrity.js');
        if(!guardAsset) throw new Error('publication has no integrity guard');
        const guardSri='sha256-'+Buffer.from(guardAsset.Sha256,'hex').toString('base64');
        schedule.push({round,variant:variant.Name,port,url:'http://localhost:'+port+
            '/?run=1&save=1&variant='+variant.Name+'&round='+round+'&cache=cold&mode='+mode+(variant.TimeModel?'&model='+variant.TimeModel:'')});
        createServer(async(req,res)=>{
            try {
                const url=new URL(req.url,'http://localhost:'+port);
                if(url.pathname==='/__manifest'){
                    res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify({publicationId:id,assets:variant.Assets}));return;
                }
                if(url.pathname==='/__integrity.js'){
                    res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'}).end(guard);return;
                }
                if(url.pathname==='/__results'){
                    if(req.method!=='POST'){res.writeHead(405).end();return;}
                    let body='';
                    for await(const chunk of req){body+=chunk;if(body.length>2000000){res.writeHead(413).end();return;}}
                    const record=JSON.parse(body);
                    if(record.variant!==variant.Name||record.round!==round||!['cold','warm'].includes(record.cache))
                        {res.writeHead(400).end();return;}
                    // Retain failed resource audits too; summary must explain their failure.
                    await writeFile(join(results,'round-'+round+'-'+variant.Name+'-'+record.cache+'.json'),body);
                    if(mode!=='startup' && (record.kind!==(mode==='time-values'?'time-values-v2':'picker-interactions-v3') || integrityError(record,manifest))){
                        res.writeHead(409,{'Content-Type':'application/json'}).end(JSON.stringify({error:'unverified publication resources'}));return;
                    }
                    console.log('saved',round,variant.Name,record.cache,record.success,record.startup?.appReadyMs);
                    const index=schedule.findIndex(item=>item.port===port);
                    const next=record.cache==='cold'?schedule[index].url.replace('cache=cold','cache=warm'):schedule[index+1]?.url;
                    res.writeHead(201,{'Content-Type':'application/json'}).end(JSON.stringify({next:next||null}));return;
                }
                await new Promise(r=>setTimeout(r,delay));
                const path=resolve(root,'.'+decodeURIComponent(url.pathname));
                const rel=relative(root,path);
                if(rel.startsWith('..')||isAbsolute(rel)){res.writeHead(403).end();return;}
                let found=await exists(path)?path:!extname(url.pathname)?join(root,'index.html'):null;
                if(!found||!await exists(found)){res.writeHead(404).end();return;}
                if(extname(found)==='.html'){
                    const html=protectHtml(await readFile(found,'utf8'),variant.Assets).replace('</head>', '<script src="/__integrity.js?publication='+id+'" integrity="'+guardSri+'"></script></head>');
                    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}).end(html);return;
                }
                const headers={'Content-Type':types[extname(found)]||'application/octet-stream',
                    'Vary':'Accept-Encoding','Cache-Control':extname(found)==='.html'?'no-cache':'public, max-age=3600'};
                const br=(req.headers['accept-encoding']||'').includes('br')&&await exists(found+'.br');
                if(br) headers['Content-Encoding']='br';
                res.writeHead(200,headers).end(await readFile(br?found+'.br':found));
            }catch(error){console.error(error);if(!res.headersSent)res.writeHead(500);res.end();}
        }).listen(port,'127.0.0.1');
    }
}
await writeFile(join(results,'schedule.json'),JSON.stringify(schedule,null,2));
console.log('Ready:',schedule.length,'origins,',rounds,'rounds, delay',delay);

console.log('Open:',schedule[0].url+'&sequence=1');
console.log('Summary: node scripts/'+(mode==='time-values'?'bench-time-summary.mjs':mode==='interactions'?'bench-interactions-summary.mjs':'bench-summary.mjs'),results);
