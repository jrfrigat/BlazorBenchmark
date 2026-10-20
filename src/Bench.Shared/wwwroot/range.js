// Repeatable date range interactions shared by the five bench apps. Startup and transfer sizes are
// excluded. DOM completion and first-frame latency stay separate: a 60 Hz frame must not hide CPU
// differences. The fields profile is two linked date fields; the calendar profile is each library's
// native inline range; the popup profile is the native popup range, only where the library ships one.
(function () {
    'use strict';
    const REPEATS = 8, TIMEOUT_MS = 10000;
    const PROTOCOL = 'fields: two linked date fields, both ends typed and picked through their own popups; ' +
        'calendar: native inline range with one visible month; popup: native popup range where one exists';
    let busy = false;
    function frame() { return new Promise(resolve => requestAnimationFrame(resolve)); }
    function visible() {
        if (document.visibilityState !== 'visible') throw new Error('interaction measurement requires a visible document');
    }
    function until(check, what) {
        return new Promise((resolve, reject) => {
            const start = performance.now();
            let done = false;
            const observer = new MutationObserver(() => { if (!done) { try { if (check()) finish(); } catch (error) { finish(error); } } });
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
            observer.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
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
        return { domMs, frameMs: performance.now() - start };
    }
    function stats(values) {
        if (!values.length || values.some(v => !Number.isFinite(v) || v < 0)) throw new Error('invalid timing samples');
        const s = [...values].sort((a, b) => a - b), n = s.length;
        return {
            n, median: n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2,
            p95: s[Math.ceil(n * .95) - 1], min: s[0], max: s[n - 1]
        };
    }
    function add(group, name, sample) { (group.samples[name] ??= []).push(sample); }
    function summaries(group) {
        for (const [name, values] of Object.entries(group.samples)) group.summary[name] = {
            dom: stats(values.map(v => v.domMs)), frame: stats(values.map(v => v.frameMs))
        };
    }
    async function prepareInput(input) {
        input.focus(); await frame(); await frame();
    }
    function setInput(input, text) {
        input.value = text;
        input.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertReplacementText', data: text }));
        input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true }));
    }
    const click = id => document.getElementById(id).click();
    const marker = id => (document.getElementById(id)?.textContent ?? '').trim();
    const snapshot = () => 'state[start=' + marker('bench-range-start') + ',end=' + marker('bench-range-end') +
        ',shape=' + marker('bench-range-shape') + ',count=' + marker('bench-range-count') +
        ',popovers=' + document.querySelectorAll('.mud-popover-open').length +
        ',dialog=' + document.querySelectorAll('.rz-datepicker-popup-container').length +
        ',calendars=' + document.querySelectorAll('.datepicker-calendar.show').length + ']';
    const date = day => '2026-10-' + String(day).padStart(2, '0');
    async function unmount() {
        if (!document.getElementById('bench-mounted')) return;
        click('bench-range-unmount');
        await until(() => !document.getElementById('bench-mounted'), 'unmount');
        await frame();
    }
    async function closePopup(c, root) {
        if (!c.ready(root)) return;
        const start = performance.now();
        while (c.ready(root)) {
            await c.close(root);
            await new Promise(resolve => setTimeout(resolve, 150));
            if (performance.now() - start > TIMEOUT_MS) throw new Error('timeout: close popup');
        }
        await frame();
    }
    async function resetFields(unit, c) {
        const start = c.input(unit, 0), end = c.input(unit, 1);
        await prepareInput(start);
        setInput(start, '10/14/2026');
        await until(() => marker('bench-range-start') === date(14), 'reset start');
        await prepareInput(end);
        setInput(end, '10/20/2026');
        await until(() => marker('bench-range-end') === date(20), 'reset end');
        start.blur(); end.blur();
        await frame();
        // A picker that opens on a typed value keeps its popup after typing; close it so the next
        // open belongs to the field the scenario picks.
        await closePopup(c, unit);
    }
    async function run() {
        if (busy) throw new Error('range interactions already running');
        busy = true;
        const c = window.rangeConfig;
        const result = {
            kind: 'picker-range-v1', library: c.library, repeats: REPEATS, success: false, protocol: PROTOCOL,
            environment: {
                userAgent: navigator.userAgent, viewport: [innerWidth, innerHeight],
                hardwareConcurrency: navigator.hardwareConcurrency, devicePixelRatio,
                visibility: document.visibilityState, themeClasses: document.documentElement.className,
                serviceWorker: !!navigator.serviceWorker?.controller
            },
            groups: {}, errors: [],
            exclusions: ['Startup and transfer size', 'Trusted keyboard/IME/touch UX', 'DateTime/Range value modelling',
                'Fields profile of analogs is a marked composition of two date pickers, not a native range popup',
                'Popup profile runs only where the library ships a native popup range']
        };
        try {
            visible();
            const frames = [];
            await frame();
            for (let i = 0; i < REPEATS; i++) { const start = performance.now(); await frame(); frames.push(performance.now() - start); }
            result.environment.frameBaseline = stats(frames);
            const profiles = [['fields', 'bench-range-fields'], ['calendar', 'bench-range-calendar'],
                ['popup', 'bench-range-popup']].filter(([profile]) => profile !== 'popup' || c.hasPopup);
            for (const count of [1, 50]) {
                for (const [profile, button] of profiles) {
                    await unmount();
                    click(button);
                    click('bench-range-count-' + count);
                    await until(() => document.getElementById('bench-range-shape').textContent === profile &&
                        document.getElementById('bench-range-count').textContent === String(count), 'profile ' + profile + '/' + count);
                    const g = result.groups[profile + '/' + count] = { units: count, samples: {}, summary: {} };
                    const ready = () => {
                        const m = document.getElementById('bench-mounted');
                        return m && m.dataset.shape === profile && Number(m.dataset.count) === count && c.mounted(profile, count);
                    };
                    add(g, 'firstMount', await timed(() => click('bench-range-mount'), ready, 'mount ' + profile));
                    for (let i = 0; i < REPEATS; i++) {
                        await unmount();
                        add(g, 'remount', await timed(() => click('bench-range-mount'), ready, 'remount'));
                        const previous = document.getElementById('bench-render-version').textContent;
                        add(g, 'parentRerender', await timed(() => click('bench-range-rerender'),
                            () => document.getElementById('bench-render-version').textContent !== previous, 'parent rerender'));
                    }
                    const unit = document.querySelector('.bench-range');
                    if (profile === 'fields') {
                        const start = c.field(unit, 0), end = c.field(unit, 1);
                        for (let i = 0; i <= REPEATS; i++) {
                            add(g, i === 0 ? 'firstOpenStart' : 'openStart',
                                await timed(() => c.open(start), () => c.ready(start), 'open start'));
                            if (i === 0) {
                                const before = c.title(start);
                                add(g, 'nextMonth', await timed(() => c.next(start).click(),
                                    () => c.title(start) !== before, 'next month'));
                                const moved = c.title(start);
                                add(g, 'prevMonth', await timed(() => c.prev(start).click(),
                                    () => c.title(start) !== moved, 'previous month'));
                            }
                            await closePopup(c, start);
                        }
                        for (let i = 0; i <= REPEATS; i++) {
                            add(g, i === 0 ? 'firstOpenEnd' : 'openEnd',
                                await timed(() => c.open(end), () => c.ready(end), 'open end'));
                            await closePopup(c, end);
                        }
                        for (let i = 0; i < REPEATS; i++) {
                            const [from, to] = i % 2 ? [16, 18] : [15, 19];
                            const s = c.input(unit, 0), e = c.input(unit, 1);
                            await prepareInput(s);
                            add(g, 'typeRange', await timed(async () => {
                                setInput(s, '10/' + from + '/2026');
                                await until(() => marker('bench-range-start') === date(from), 'typed start');
                                s.blur();
                                await prepareInput(e);
                                setInput(e, '10/' + to + '/2026');
                            }, () => marker('bench-range-end') === date(to), 'typed range ' + from + '/' + to));
                            s.blur(); e.blur(); await frame();
                        }
                        for (let i = 0; i < REPEATS; i++) {
                            const [from, to] = i % 2 ? [26, 30] : [21, 25];
                            await resetFields(unit, c);
                            await closePopup(c, end);
                            await c.open(end);
                            await until(() => c.ready(end), 'end popup for selection');
                            await frame();
                            add(g, 'selectEnd', await timed(() => c.pick(end, to),
                                () => marker('bench-range-end') === date(to), 'select end ' + to + ' #' + i));
                            await until(() => !c.ready(end), 'close end after pick');
                            await frame();
                            await c.open(start);
                            await until(() => c.ready(start), 'start popup for selection');
                            await frame();
                            add(g, 'selectStart', await timed(() => c.pick(start, from),
                                () => marker('bench-range-start') === date(from), 'select start'));
                            await until(() => !c.ready(start), 'close start after pick');
                            await frame();
                        }
                    } else if (profile === 'calendar') {
                        for (let i = 0; i < REPEATS; i++) {
                            const before = c.calendarTitle(unit);
                            add(g, 'nextMonth', await timed(() => c.calendarNext(unit).click(),
                                () => c.calendarTitle(unit) !== before, 'next month'));
                            const moved = c.calendarTitle(unit);
                            add(g, 'prevMonth', await timed(() => c.calendarPrev(unit).click(),
                                () => c.calendarTitle(unit) !== moved, 'previous month'));
                        }
                        for (let i = 0; i < REPEATS; i++) {
                            const [from, to] = i % 2 ? [26, 30] : [21, 25];
                            add(g, 'selectRange', await timed(async () => {
                                c.calendarPick(unit, from);
                                await frame();
                                c.calendarPick(unit, to);
                            }, () => marker('bench-range-start') === date(from) && marker('bench-range-end') === date(to),
                                'select range ' + from + '-' + to));
                            await frame();
                        }
                    } else {
                        for (let i = 0; i <= REPEATS; i++) {
                            add(g, i === 0 ? 'firstOpen' : 'open',
                                await timed(() => c.open(unit), () => c.ready(unit), 'open popup'));
                            if (i === 0) {
                                const before = c.title(unit);
                                add(g, 'nextMonth', await timed(() => c.next(unit).click(),
                                    () => c.title(unit) !== before, 'next month'));
                                const moved = c.title(unit);
                                add(g, 'prevMonth', await timed(() => c.prev(unit).click(),
                                    () => c.title(unit) !== moved, 'previous month'));
                            }
                            await closePopup(c, unit);
                        }
                        for (let i = 0; i < REPEATS; i++) {
                            const [from, to] = i % 2 ? [26, 30] : [21, 25];
                            add(g, 'selectRange', await timed(async () => {
                                if (!c.ready(unit)) {
                                    await c.open(unit);
                                    await until(() => c.ready(unit), 'popup for range start');
                                }
                                await frame();
                                c.pick(unit, from);
                                await frame();
                                if (!c.ready(unit)) {
                                    await c.open(unit);
                                    await until(() => c.ready(unit), 'popup for range end');
                                }
                                await frame();
                                c.pick(unit, to);
                            }, () => marker('bench-range-start') === date(from) && marker('bench-range-end') === date(to),
                                'select range ' + from + '-' + to));
                            await closePopup(c, unit);
                        }
                    }
                    summaries(g);
                }
            }
            result.success = true;
        } catch (error) {
            result.errors.push(String(error) + ' ' + snapshot());
        } finally {
            busy = false;
            window.benchRangeResult = result;
            const output = document.getElementById('bench-report');
            if (output) output.textContent = JSON.stringify(result, null, 2);
            document.documentElement.dataset.benchComplete = result.success ? 'pass' : 'fail';
        }
        return result;
    }
    window.benchRange = { run, until, frame, stats };
})();
