// Shared, repeatable date/time interactions. Startup and transfer sizes are excluded.
// DOM completion and first-frame latency are separate: a 60 Hz frame must not hide CPU differences.
(function () {
    'use strict';
    const REPEATS = 8, TIMEOUT_MS = 10000;
    let busy = false;
    function frame() { return new Promise(resolve => requestAnimationFrame(resolve)); }
    function visible() {
        if (document.visibilityState !== 'visible') throw new Error('interaction measurement requires a visible document');
    }
    function until(check, what) {
        return new Promise((resolve, reject) => {
            const start = performance.now();
            let done = false;
            const observer = new MutationObserver(() => { if (!done) { try { if (check()) finish(); } catch(error) { finish(error); } } });
            function finish(error) {
                done = true; observer.disconnect();
                if (error) reject(error); else resolve();
            }
            function poll() {
                if (done) return;
                try {
                    if (check()) { finish(); return; }
                    if (performance.now() - start > TIMEOUT_MS) { finish(new Error('timeout: ' + what)); return; }
                } catch (error) { finish(error); return; }
                requestAnimationFrame(poll);
            }
            observer.observe(document.body, {childList:true, subtree:true, attributes:true, characterData:true});
            poll();
        });
    }
    async function timed(action, check, what) {
        visible();
        const start = performance.now();
        await action();
        await until(check, what);
        const domMs = performance.now() - start;
        await frame();
        visible();
        return {domMs, frameMs:performance.now() - start};
    }
    function stats(values) {
        if (!values.length || values.some(v => !Number.isFinite(v) || v < 0)) throw new Error('invalid timing samples');
        const s = [...values].sort((a,b) => a-b), n=s.length;
        return {n, median:n%2 ? s[(n-1)/2] : (s[n/2-1]+s[n/2])/2,
            p95:s[Math.ceil(n*.95)-1], min:s[0], max:s[n-1]};
    }
    function add(group, name, sample) { (group.samples[name] ??= []).push(sample); }
    function summaries(group) {
        for (const [name, values] of Object.entries(group.samples)) group.summary[name] = {
            dom:stats(values.map(v=>v.domMs)), frame:stats(values.map(v=>v.frameMs))};
    }
    async function prepareInput(input) {
        // Focus-driven mask setup is preparation, outside text-to-value latency.
        input.focus(); await frame(); await frame();
    }
    function setInput(input, text) {
        // Honor the field's value setter: input masks keep an editing buffer there.
        input.value=text;
        input.dispatchEvent(new InputEvent('input',{bubbles:true,composed:true,inputType:'insertReplacementText',data:text}));
        input.dispatchEvent(new Event('change',{bubbles:true,composed:true}));
        input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,composed:true}));
    }
    const firstDate = () => document.querySelector('.bench-date');
    const firstTime = () => document.querySelector('.bench-time');
    const value = () => document.getElementById('bench-value').textContent.trim();
    const click = id => document.getElementById(id).click();
    async function unmount() {
        click('bench-unmount');
        await until(()=>!document.getElementById('bench-mounted'),'unmount');
        await frame();
    }
    async function closeDate(c) {
        if (!c.calendarReady()) return;
        await c.closeDate();
        await until(()=>!c.calendarReady(),'close date');
        await frame();
    }
    async function run() {
        if (busy) throw new Error('interactions already running');
        busy = true;
        const c = window.benchConfig;
        const result = {kind:'picker-interactions-v2', library:c.library, repeats:REPEATS, success:false,
            protocol:'one date; one time; 50 dates + 50 times, unchanged container rerender, synthetic full input/commit and day selection',
            environment:{userAgent:navigator.userAgent, viewport:[innerWidth,innerHeight],
                hardwareConcurrency:navigator.hardwareConcurrency, devicePixelRatio,
                visibility:document.visibilityState, themeClasses:document.documentElement.className,
                serviceWorker:!!navigator.serviceWorker?.controller}, groups:{}, errors:[],
            exclusions:['Startup/transfer size','Trusted keyboard/IME/touch UX','Time value selection: unlike popup models','DateTime/Range performance: no common adapter']};
        try {
            visible();
            const frames=[];
            await frame();
            for(let i=0;i<REPEATS;i++){const start=performance.now();await frame();frames.push(performance.now()-start);}
            result.environment.frameBaseline=stats(frames);
            for (const [shape,button,dates,times] of [['date','bench-single-date',1,0],['time','bench-single-time',0,1],['mixed','bench-many',50,50]]) {
                await unmount();click(button);
                await until(()=>document.getElementById('bench-shape').textContent===shape,'shape');
                const g=result.groups[shape]={dates,times,samples:{},summary:{}};
                const ready=()=>{
                    const marker=document.getElementById('bench-mounted');
                    return marker && Number(marker.dataset.dates)===dates && Number(marker.dataset.times)===times &&
                        document.querySelectorAll('.bench-date').length===dates &&
                        document.querySelectorAll('.bench-time').length===times &&
                        c.mounted(times) && (!dates || !!c.dateInput(firstDate()));
                };
                const before=document.getElementsByTagName('*').length;
                add(g,'firstMount',await timed(()=>click('bench-mount'),ready,'mount '+shape));
                g.domNodes=document.getElementsByTagName('*').length-before;
                for(let i=0;i<REPEATS;i++){
                    await unmount();add(g,'remount',await timed(()=>click('bench-mount'),ready,'remount'));
                    const previous=document.getElementById('bench-render-version').textContent;
                    add(g,'parentRerender',await timed(()=>click('bench-rerender'),
                        ()=>document.getElementById('bench-render-version').textContent!==previous,'parent rerender'));
                }
                if(dates){
                    for(let i=0;i<=REPEATS;i++){
                        add(g,i===0?'firstOpenDate':'openDate',await timed(()=>c.openDate(firstDate()),c.calendarReady,'open date'));
                        if(i>0){
                            const beforeTitle=c.title();
                            add(g,'nextMonth',await timed(()=>c.next().click(),()=>c.title()!==beforeTitle,'next month'));
                        }
                        await closeDate(c);
                    }
                    for(let i=0;i<REPEATS;i++){
                        const number=i%2 ? 15 : 14;
                        const input=c.dateInput(firstDate()); await prepareInput(input);
                        add(g,'typeDateCommit',await timed(()=>setInput(input,'10/'+number+'/2026'),
                            ()=>value()==='2026-10-'+number,'typed date commit'));
                        input.blur(); await frame(); await closeDate(c);

                    }
                }
                if(dates){
                    // Reset browsing state uniformly: some calendars retain the browsed month after typing.
                    await unmount();click('bench-mount');await until(ready,'selection mount');await frame();
                    for(let i=0;i<REPEATS;i++){
                        const input=c.dateInput(firstDate()); await prepareInput(input);
                        setInput(input,'10/14/2026');
                        await until(()=>value()==='2026-10-14','selection reset');input.blur();await frame();await closeDate(c);
                        await c.openDate(firstDate());await until(c.calendarReady,'date for selection');await frame();
                        const selectStart=performance.now();
                        add(g,'selectDay',await timed(()=>c.pickDay(15),()=>value()==='2026-10-15','select day'));
                        // Await the library's own close, including an intentional delay; forcing close would
                        // leave an old delayed callback free to close the NEXT popup (Mud ClosingDelay).
                        await until(()=>!c.calendarReady(),'close after day selection');
                        const domMs=performance.now()-selectStart;
                        await frame();visible();
                        add(g,'selectDayClose',{domMs,frameMs:performance.now()-selectStart});
                    }
                }
                if(times){
                    for(let i=0;i<=REPEATS;i++){
                        add(g,i===0?'firstOpenTime':'openTime',await timed(()=>c.openTime(firstTime()),c.timeReady,'open time'));
                        await c.closeTime();await until(()=>!c.timeReady(),'close time');await frame();
                    }
                }
                summaries(g);
            }
            result.success=true;
        } catch(error) {result.errors.push(String(error));}
        finally {
            busy=false;window.benchResult=result;
            const output=document.getElementById('bench-report');if(output)output.textContent=JSON.stringify(result,null,2);
            document.documentElement.dataset.benchComplete=result.success?'pass':'fail';
        }
        return result;
    }
    window.bench={run,until,frame,stats};
})();