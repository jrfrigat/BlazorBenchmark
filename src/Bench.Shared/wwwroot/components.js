// The same component workload and verification rules for all five library adapters.
(function () {
    'use strict';
    const N=8, kinds=['button','text','number','checkbox','switch','select','datagrid'];
    const q=s=>document.querySelector(s), click=id=>q('#'+id).click();
    const state=()=>JSON.parse(q('#components-snapshot').textContent);
    let busy=false;
    function visible(){if(document.visibilityState!=='visible')throw new Error('visible document required');}
    function gridMatches() {
        const expected=state().rows, root=q('#components-mounted');if(!root||!expected)return false;
        for(const field of ['id','name','price','stock','active']){
            const actual=Array.from(root.querySelectorAll('[data-grid-field="'+field+'"]'));
            if(actual.length!==expected.length)return false;
            for(let i=0;i<actual.length;i++) if(actual[i].dataset.gridId!==String(expected[i].id)||
                actual[i].textContent!==String(expected[i][field]))return false;
        }
        return true;
    }
    function ready(){const s=state(),root=q('#components-mounted');return s.mounted&&root&&
        root.dataset.kind===s.kind&&(s.kind==='datagrid'?gridMatches():root.querySelectorAll('.component-sample').length===s.count&&
        Array.from(root.querySelectorAll('.component-sample')).every(e=>benchComponentConfigs[benchConfig.library].mounted(e,s.kind)));}
    async function timed(action,check,label){
        visible();const start=performance.now();await action();await bench.until(check,label);
        const domMs=performance.now()-start;await bench.frame();visible();return{domMs,frameMs:performance.now()-start};
    }
    async function unmount(){click('components-unmount');await bench.until(()=>!q('#components-mounted'),'component unmount');await bench.frame();}
    function choose(id,value){const e=q('#'+id);e.value=String(value);e.dispatchEvent(new Event('change',{bubbles:true}));}
    async function configure(kind,count,rows){
        await unmount();choose('components-kind',kind);await bench.until(()=>state().kind===kind,'kind');
        choose('components-count',count);await bench.until(()=>state().count===count,'count');
        choose('components-rows',rows);await bench.until(()=>state().rowCount===rows&&!state().mounted,'rows');await bench.frame();
    }
    async function resetGrid(){const old=state().changes;click('components-grid-reset');await bench.until(()=>state().changes>old&&gridMatches(),'grid reset');await bench.frame();}
    async function run(){
        if(busy)throw new Error('component measurement already running');busy=true;
        const library=benchConfig.library,c=benchComponentConfigs[library];
        const result={kind:'components-v1',library,repeats:N,selectPopup:c.selectPopup,success:false,errors:[],groups:{},
            protocol:'synthetic public DOM events; shared bound-state callbacks; full grid cell/order verification',
            gridPolicy:'100/1000 unvirtualized rows, 5 shared cell templates; shared sorting/filtering/50-row window; native query engines excluded',
            environment:{userAgent:navigator.userAgent,viewport:[innerWidth,innerHeight],devicePixelRatio,
                hardwareConcurrency:navigator.hardwareConcurrency,visibility:document.visibilityState,
                serviceWorker:!!navigator.serviceWorker?.controller}};
        try{
            for(const kind of kinds)for(const size of kind==='datagrid'?[100,1000]:[1,50]){
                await configure(kind,kind==='datagrid'?1:size,kind==='datagrid'?size:100);
                const g=result.groups[kind+'/'+size]={kind,size,samples:{},exclusions:[]};
                const add=(k,s)=>(g.samples[k]??=[]).push(s);
                const before=document.getElementsByTagName('*').length;
                add('firstMount',await timed(()=>click('components-mount'),ready,'component mount'));
                g.domNodes=document.getElementsByTagName('*').length-before;
                for(let i=0;i<N;i++){
                    await unmount();add('remount',await timed(()=>click('components-mount'),ready,'component remount'));
                    const version=state().version;
                    add('parentRerender',await timed(()=>click('components-rerender'),()=>state().version>version&&ready(),'parent rerender'));
                }
                if(kind==='datagrid'){
                    for(const action of ['sort','filter','page','update'])for(let i=0;i<N;i++){
                        await resetGrid();const old=state().changes;
                        const s=await timed(()=>click('components-grid-'+action),()=>state().changes>old&&gridMatches(),'grid '+action);
                        s.expectedRows=state().rows.length;s.verifiedRows=q('#components-mounted').querySelectorAll('[data-grid-field=id]').length;
                        s.verifiedCells=s.verifiedRows*5;s.callbackDelta=state().changes-old;s.verified=true;add(action+'Data',s);
                    }
                    continue;
                }
                const root=()=>q('.component-sample');
                for(let i=0;i<=N;i++){
                    let target=kind==='button'?String(Number(state().value)+1):kind==='text'?(i%2?'Bench beta':'Bench alpha'):
                        kind==='number'?(i%2?'24.75':'12.5'):kind==='select'?(i%2?'Option 003':'Option 002'):(i%2?'false':'true');
                    if(kind==='text'||kind==='number')await c.prepare(root());
                    if(kind==='select'&&c.selectPopup!=='native')add(i?'open':'firstOpen',await timed(()=>c.open(root()),()=>!!c.popup(),'select open'));
                    const old=state().changes;
                    const s=await timed(()=>{
                        if(kind==='button')c.button(root());else if(kind==='text'||kind==='number')c.type(root(),target);
                        else if(kind==='select')c.pick(target,root());else c.toggle(root());
                    },()=>state().changes>old&&(kind==='number'?Number(state().value)===Number(target):state().value===target),'component bound value '+kind);
                    s.target=target;s.bound=state().value;s.callbackDelta=state().changes-old;add(i?'action':'firstAction',s);
                    if(kind==='select'&&c.selectPopup!=='native'){
                        if(c.popup())c.close();await bench.until(()=>!c.popup(),'select close');await bench.frame();
                    }
                }
                if(kind==='select'&&c.selectPopup==='native')g.exclusions.push('Native select popup cannot be timed through synthetic DOM; commit only.');
            }
            result.success=true;
        }catch(error){result.errors.push(String(error));}
        finally{busy=false;window.benchAnalyticsResult=result;window.benchComponentResult=result;
            q('#bench-report').textContent=JSON.stringify(result,null,2);document.documentElement.dataset.benchComplete=result.success?'pass':'fail';}
        return result;
    }
    window.benchComponents={run,gridMatches};
})();
