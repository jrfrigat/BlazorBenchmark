// Public DOM adapters for the opt-in time-values protocol. No library internals are called.
(function () {
    'use strict';
    const q = s => document.querySelector(s);
    const pick = (root, selector, text) => {
        const e = Array.from(root.querySelectorAll(selector)).find(e => e.textContent.trim() === text && !e.disabled);
        if (!e) throw new Error('time option missing: ' + text);
        e.click();
    };
    const key = (e, value, extra = {}) => e.dispatchEvent(new KeyboardEvent('keydown', {key:value,bubbles:true,composed:true,...extra}));
    const change = (e, value) => {
        if (!e) throw new Error('time input missing');
        e.value = value;
        e.dispatchEvent(new InputEvent('input', {bubbles:true,composed:true,inputType:'insertReplacementText',data:value}));
        e.dispatchEvent(new Event('change', {bubbles:true,composed:true}));
    };
    const input = () => q('.bench-time input');
    const flarePanel = () => q('.flare-timepicker [role=dialog]:popover-open');
    const flareList = () => q('.flare-timepicker [role=listbox]');
    const radzen = () => Array.from(document.querySelectorAll('.rz-datepicker-popup-container')).find(e => e.style.display === 'block');
    const listOpen = () => !!q('.flare-timepicker input[aria-expanded=true]');
    window.benchTimeConfigs = {
        Flare: {
            models:['Dial','Dropdown','List'], input,
            policy:'24h; 08:00..18:00; MinuteStep=15; seconds off; Dial permits individual minutes',
            selection:'Dial: synthetic digit keys and OK; Dropdown: two options and OK; List: one option',
            manual:'supported',
            ready:model => model === 'List' ? listOpen() && !!flareList()?.querySelector('[role=option]') : !!flarePanel(),
            close:model => {
                if(model === 'List') key(input(),'Escape');
                else key(flarePanel(),'Escape');
            },
            select:async(model,h,m) => {
                const hh=String(h).padStart(2,'0'), mm=String(m).padStart(2,'0');
                if(model === 'List') {pick(flareList(),'[role=option]',hh+':'+mm);return;}
                const p=flarePanel();
                if(model === 'Dropdown') {
                    const cols=p.querySelectorAll('[role=listbox]');
                    pick(cols[0],'button',hh); await bench.until(()=>cols[0].querySelector('[aria-selected=true]')?.textContent.trim()===hh,'hour option');
                    pick(cols[1],'button',mm); await bench.until(()=>cols[1].querySelector('[aria-selected=true]')?.textContent.trim()===mm,'minute option');
                } else {
                    p.querySelector('[aria-label=Hours]').click();
                    const dial=p.querySelector('[role=slider]');
                    for(const digit of hh)key(dial,digit);
                    await bench.until(()=>dial.getAttribute('aria-label')==='Minutes','minute dial');
                    for(const digit of mm)key(dial,digit);
                    await bench.until(()=>Number(dial.getAttribute('aria-valuenow'))===m,'dial minute');
                }
                pick(p,'button','OK');
            },
            type:value => {change(input(),value);key(input(),'Enter');}
        },
        MudBlazor: {
            models:['Default'], input, policy:'24h; MinuteSelectionStep=15; no native Min/Max time API; seconds off',
            selection:'synthetic Ctrl+Left/Right for hours, Shift+Left/Right in five-minute steps, Enter; default closing delay retained',
            manual:'supported with Editable=true',
            ready:() => benchConfigs.MudBlazor.timeReady(), close:() => benchConfigs.MudBlazor.closeTime(),
            select:async(_,h,m) => {
                const buttons=()=>q('.mud-popover-open .mud-timepicker-hourminute').querySelectorAll('button');
                let currentH=Number(buttons()[0].textContent.trim())||0;
                let currentM=Number(buttons()[1].textContent.trim())||0;
                while(currentH!==h){const direction=currentH<h?1:-1;currentH+=direction;
                    key(input(),direction>0?'ArrowRight':'ArrowLeft',{ctrlKey:true});
                    await bench.until(()=>Number(buttons()[0].textContent.trim())===currentH,'Mud hour');}
                while(currentM!==m){const direction=currentM<m?5:-5;currentM+=direction;
                    key(input(),direction>0?'ArrowRight':'ArrowLeft',{shiftKey:true});
                    await bench.until(()=>Number(buttons()[1].textContent.trim())===currentM,'Mud minute');}
                key(input(),'Enter');
            },
            type:value => {change(input(),value);input().blur();}
        },
        Radzen: {
            models:['Default'],input,policy:'24h; MinutesStep=15; no date range applied to pure time fixture; seconds off',
            selection:'two numeric changes then OK',manual:'supported with AllowInput=true',
            ready:() => !!radzen(),close:() => benchConfigs.Radzen.closeTime(),
            select:async(_,h,m) => {
                const p=radzen();change(p.querySelector('.rz-hour-picker input'),String(h));
                await bench.until(()=>Number(p.querySelector('.rz-hour-picker input').value)===h,'Radzen hour');
                change(p.querySelector('.rz-minute-picker input'),String(m));
                await bench.until(()=>Number(p.querySelector('.rz-minute-picker input').value)===m,'Radzen minute');
                pick(p,'button','Ok');
            },
            type:value => change(input(),value)
        },
        Blazorise: {
            models:['Default'],input,policy:'24h; 08:00..18:00; MinuteIncrement=15; seconds off',
            selection:'two numeric changes; each commits immediately; external close excluded from value latency',manual:'supported',
            ready:() => benchConfigs.Blazorise.timeReady(),close:() => benchConfigs.Blazorise.closeTime(),
            select:async(_,h,m) => {
                const controls=()=>q('.bench-time .dropdown-menu.show').querySelectorAll('input[type=number]');
                change(controls()[0],String(h));
                await bench.until(()=>q('#bench-time-value').textContent.startsWith(String(h).padStart(2,'0')+':'),'Blazorise hour committed');
                change(controls()[1],String(m));
            },
            type:value => change(input(),value)
        },
        FluentUI: {
            models:['Default'],input,
            policy:'standard FluentUI list; 08:00..18:00; Increment=15; seconds off',
            selection:'one existing fluent-option',manual:'existing-option text only; free text not exposed by TimePicker',
            ready:() => benchConfigs.FluentUI.timeReady(),close:() => benchConfigs.FluentUI.closeTime(),
            select:async(_,h,m) => {
                const value=String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':00';
                const e=q('.bench-time fluent-listbox:popover-open fluent-option[value="'+value+'"]');
                if(!e)throw new Error('Fluent option missing '+value);e.click();
            },
            type:value => {
                const e=window.benchTimeConfigs.FluentUI.input();
                const [h,m]=value.split(':').map(Number);
                change(e,(h%12||12)+':'+String(m).padStart(2,'0')+(h<12?' AM':' PM'));key(e,'Enter');e.blur();
            }
        }
    };
})();
