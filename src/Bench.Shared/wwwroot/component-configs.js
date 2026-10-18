// Public DOM adapters. No library-internal services or component methods are called.
(function () {
    'use strict';
    const q = s => document.querySelector(s);
    function deep(root, selector) {
        const found = root.querySelector(selector); if (found) return found;
        for (const e of root.querySelectorAll('*')) if (e.shadowRoot) {
            const nested = deep(e.shadowRoot, selector); if (nested) return nested;
        }
        return null;
    }
    function press(e) {
        if (!e) throw new Error('component action target missing');
        const b = e.getBoundingClientRect(), init = { bubbles:true, cancelable:true, composed:true,
            view:window, button:0, detail:1, clientX:b.x+b.width/2, clientY:b.y+b.height/2 };
        if(e.tabIndex>=0)e.focus({preventScroll:true});
        for (const type of ['pointerdown','mousedown','pointerup','mouseup','click'])
            e.dispatchEvent(type.startsWith('pointer') ? new PointerEvent(type,init) : new MouseEvent(type,init));
    }
    function input(root) { const e = deep(root, 'input:not([type=hidden]),textarea'); if (!e) throw new Error('editable input missing'); return e; }
    function type(root, value) {
        const e = input(root); e.value = value;
        e.dispatchEvent(new InputEvent('input',{bubbles:true,composed:true,inputType:'insertReplacementText',data:value}));
        e.dispatchEvent(new Event('change',{bubbles:true,composed:true}));
        e.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,composed:true}));
        e.blur();
    }
    function findOption(root, text) {
        return root && Array.from(root.querySelectorAll('[role=option],fluent-option,li'))
            .find(e => e.textContent.trim() === text && !e.disabled && e.getAttribute('aria-disabled') !== 'true');
    }
    function option(root, text) {
        const e = findOption(root, text);
        if (!e) throw new Error('select option missing: '+text); e.click();
    }
    const outside = () => press(q('.component-bench h1'));
    const common = {input,type,optionReady:(root,text)=>{const e=findOption(root,text);return !!e&&e.getBoundingClientRect().height>0;},
        settled:root=>!!root&&(root.closest('[popover],.mud-popover,.rz-dropdown-panel')||root)
            .getAnimations({subtree:true}).every(a=>a.playState!=='running'),
        mounted:(r,kind)=>kind==='text'||kind==='number'?!!deep(r,'input:not([type=hidden]),textarea'):
        kind==='button'?!!deep(r,'button,fluent-button'):
        kind==='select'?!!r.querySelector('select,[role=combobox],fluent-dropdown,.flare-select,.rz-dropdown'):
        !!deep(r,'input[type=checkbox],[role=checkbox],[role=switch],fluent-checkbox,fluent-switch'),
        button:r=>press(deep(r,'button,fluent-button')),
        toggle:r=>{const e=deep(r,'input[type=checkbox]'); if(e) e.click(); else press(r.querySelector('[role=checkbox],[role=switch],fluent-checkbox,fluent-switch'));},
        prepare:async r=>{input(r).focus();await bench.frame();await bench.frame();}};
    window.benchComponentConfigs = {
        Flare:{...common,selectPopup:'custom',
            open:r=>press(r.querySelector('[role=combobox]') || r.querySelector('.flare-select__control')),
            popup:()=>q('[popover]:popover-open [role=listbox]') || q('[role=listbox]:popover-open'),
            pick:text=>option(window.benchComponentConfigs.Flare.popup(),text),close:outside},
        MudBlazor:{...common,selectPopup:'custom',
            open:r=>press(r.querySelector('[role=combobox]:not(input)') || r.querySelector('input[role=combobox]:not([type=hidden])')),
            popup:()=>q('.mud-popover-open [role=listbox]') || q('.mud-popover-open'),
            pick:text=>option(window.benchComponentConfigs.MudBlazor.popup(),text),close:outside},
        Radzen:{...common,selectPopup:'custom',
            toggle:r=>press(r.querySelector('[role=checkbox],[role=switch],.rz-chkbox-box,.rz-switch')),
            open:r=>press(r.querySelector('.rz-dropdown-trigger,[role=combobox]')),
            popup:()=>Array.from(document.querySelectorAll('.rz-dropdown-panel')).find(e=>e.getBoundingClientRect().height>0),
            pick:text=>option(window.benchComponentConfigs.Radzen.popup(),text),close:outside},
        Blazorise:{...common,selectPopup:'native',open:()=>{},popup:()=>true,
            pick:(text,r)=>{const e=r.querySelector('select');e.value=text;e.dispatchEvent(new Event('change',{bubbles:true}));},close:()=>{}},
        FluentUI:{...common,selectPopup:'custom',
            toggle:r=>press(r.querySelector('fluent-checkbox,fluent-switch') || deep(r,'input[type=checkbox],[role=checkbox],[role=switch]')),
            open:r=>press(r.querySelector('fluent-dropdown,[role=combobox]')),
            popup:()=>q('fluent-listbox:popover-open'),
            pick:text=>option(window.benchComponentConfigs.FluentUI.popup(),text),close:outside}
    };
})();
