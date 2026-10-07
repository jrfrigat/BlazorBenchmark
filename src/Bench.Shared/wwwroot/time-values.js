// Component work only. Synthetic DOM/keyboard timings are separate from trusted input QA.
(function () {
    'use strict';
    const N=8, q=s=>document.querySelector(s), click=id=>document.getElementById(id).click();
    let busy=false;
    const bound=()=>q('#bench-time-value').textContent.trim();
    const changes=()=>Number(q('#bench-time-value').dataset.changes);
    async function timed(action,check,label){
        if(document.visibilityState!=='visible')throw new Error('visible document required');
        const start=performance.now();await action();await bench.until(check,label);
        const domMs=performance.now()-start;await bench.frame();
        if(document.visibilityState!=='visible')throw new Error('document hidden during measurement');
        return {domMs,frameMs:performance.now()-start};
    }
    async function unmount(){click('bench-unmount');await bench.until(()=>!q('#bench-mounted'),'unmount');await bench.frame();}
    async function run(){
        if(busy)throw new Error('time measurement already running');busy=true;
        const c=benchTimeConfigs[benchConfig.library];
        const result={kind:'time-values-v2',library:benchConfig.library,repeats:N,success:false,errors:[],groups:{},
            protocol:'synthetic public DOM events; first component action is not cold runtime; 1 or 50 time fields',
            policy:c.policy,selection:c.selection,manual:c.manual,
            environment:{userAgent:navigator.userAgent,viewport:[innerWidth,innerHeight],devicePixelRatio,
                hardwareConcurrency:navigator.hardwareConcurrency,visibility:document.visibilityState,
                themeClasses:document.documentElement.className,serviceWorker:!!navigator.serviceWorker?.controller}};
        try{
            const chosen=new URLSearchParams(location.search).get('model');
            if(chosen && !c.models.includes(chosen))throw new Error('unknown popup model');
            let models=chosen?[chosen]:[...c.models];
            const round=Number(new URLSearchParams(location.search).get('round')||0)%models.length;
            models=[...models.slice(round),...models.slice(0,round)];result.modelOrder=models;
            for(const model of models)for(const count of [1,50]){
                await unmount();
                if(model!=='Default'){click('bench-time-'+model);await bench.until(()=>q('#bench-time-variant').textContent===model,'variant');}
                click(count===1?'bench-single-time':'bench-many-time');
                await bench.until(()=>q('#bench-shape').textContent===(count===1?'time':'times'),'time shape');
                click('bench-time-reset');await bench.until(()=>bound()===''&&changes()===0,'clear bound time');
                const g=result.groups[model+'/'+count]={model,count,samples:{},summary:{}};
                const add=(name,s)=>(g.samples[name]??=[]).push(s);
                const ready=()=>q('#bench-mounted')?.dataset.times===String(count)&&q('#bench-mounted')?.dataset.dates==='0'&&
                    document.querySelectorAll('.bench-time').length===count&&benchConfig.mounted(count);
                add('firstMount',await timed(()=>click('bench-mount'),ready,'time mount'));
                for(let i=0;i<N;i++){
                    await unmount();add('remount',await timed(()=>click('bench-mount'),ready,'remount'));
                    const version=q('#bench-render-version').textContent;
                    add('parentRerender',await timed(()=>click('bench-rerender'),()=>q('#bench-render-version').textContent!==version,'rerender'));
                }
                const close=async()=>{if(c.ready(model)){await c.close(model);await bench.until(()=>!c.ready(model),'close time');await bench.frame();}};
                for(let i=0;i<=N;i++){
                    add(i?'open':'firstOpen',await timed(()=>benchConfig.openTime(q('.bench-time')),()=>c.ready(model),'open time'));
                    const h=i%2?10:9,m=i%2?45:30,target=String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':00';
                    const previous=changes();
                    const s=await timed(()=>c.select(model,h,m),()=>bound()===target&&changes()>previous,'selected bound time');
                    s.target=target;s.bound=bound();s.callbackDelta=changes()-previous;add(i?'select':'firstSelect',s);
                    await close();
                }
                // A new instance avoids reusing a popup's focused selection for the first typed commit.
                await unmount();click('bench-mount');await bench.until(ready,'typed fixture');await bench.frame();
                for(let i=0;i<=N;i++){
                    const text=i%2?'09:30':'10:45',target=text+':00';
                    const e=c.input();if(!e)throw new Error('editable time input missing');
                    e.focus();await bench.frame();await bench.frame();
                    const previous=changes();
                    const s=await timed(()=>c.type(text),()=>bound()===target&&changes()>previous,'typed bound time');
                    s.target=target;s.bound=bound();s.callbackDelta=changes()-previous;add(i?'type':'firstType',s);
                    e.blur();await bench.frame();await close();
                }
                for(const [name,samples]of Object.entries(g.samples))g.summary[name]={dom:bench.stats(samples.map(s=>s.domMs)),frame:bench.stats(samples.map(s=>s.frameMs))};
            }
            result.success=true;
        }catch(error){result.errors.push(String(error));}
        finally{busy=false;window.benchResult=result;q('#bench-report').textContent=JSON.stringify(result,null,2);document.documentElement.dataset.benchComplete=result.success?'pass':'fail';}
        return result;
    }
    window.benchTimeValues={run};
})();
