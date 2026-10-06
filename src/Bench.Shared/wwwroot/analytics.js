// Common controlled startup/mount analytics. Loaded after markup, before Blazor.
(function () {
    'use strict';
    performance.setResourceTimingBufferSize(2000);
    const params = new URLSearchParams(location.search);
    const errors = [];
    const classes = [{ time: performance.now(), value: document.documentElement.className }];
    const marks = {};
    addEventListener('flare:ready', () => { marks.flareReadyMs = performance.now(); });
    new MutationObserver(() => classes.push({
        time: performance.now(), value: document.documentElement.className
    })).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    addEventListener('error', e => errors.push(String(e.message || e.target?.src || 'resource error')), true);
    addEventListener('unhandledrejection', e => errors.push(String(e.reason)));
    let setup = null;
    let busy = false;
    function resources() {
        return performance.getEntriesByType('resource').map(e => ({
            name: new URL(e.name).pathname, external: new URL(e.name).origin !== location.origin,
            initiator: e.initiatorType, start: e.startTime, end: e.responseEnd, duration: e.duration,
            transfer: e.transferSize, encoded: e.encodedBodySize, decoded: e.decodedBodySize
        }));
    }
    function css() {
        const root = document.querySelector('[data-flare-theme]') || document.documentElement;
        const style = getComputedStyle(root);
        let rules = 0, bytes = 0;
        for (const sheet of document.styleSheets) {
            try {
                rules += sheet.cssRules.length;
                for (const rule of sheet.cssRules) bytes += rule.cssText.length;
            } catch (_) { /* External sheets are reported in resources. */ }
        }
        return { classes: document.documentElement.className, theme: root.dataset.flareTheme || null,
            primary: (style.getPropertyValue('--flare-color-primary') || getComputedStyle(document.documentElement).getPropertyValue('--flare-color-primary')).trim(),
            rules, textCharacters: bytes };
    }
    function styledFields() {
        const dates = document.querySelectorAll('.bench-date');
        const times = document.querySelectorAll('.bench-time');
        const first = dates[0]?.querySelector('input,fluent-text-input');
        const style = first ? getComputedStyle(first) : null;
        return { dates: dates.length, times: times.length, fieldsReady: !!window.benchConfig?.mounted(),
            firstInput: style ? { width: first.getBoundingClientRect().width, height: first.getBoundingClientRect().height,
                font: style.fontFamily, border: style.borderTopStyle, color: style.color } : null, ...css() };
    }
    async function mount() {
        const start = performance.now();
        document.getElementById('bench-mount').click();
        await bench.until(() => !!document.getElementById('bench-mounted') && benchConfig.mounted(), '50 date and time fields');
        await document.fonts.ready;
        await bench.frame();
        return { ms: performance.now() - start, at: performance.now(), styled: styledFields() };
    }
    async function run() {
        if (busy) throw new Error('analytics already running');
        busy = true;
        const result = { variant: params.get('variant') || benchConfig.library,
            round: Number(params.get('round') || 0), cache: params.get('cache') || 'manual',
            environment: { userAgent: navigator.userAgent, viewport: [innerWidth, innerHeight],
                devicePixelRatio, hardwareConcurrency: navigator.hardwareConcurrency,
                fontPolicy: 'system Arial, no external requests', serviceWorker: !!navigator.serviceWorker?.controller },
            errors, classes };
        try {
            await bench.until(() => !!document.getElementById('bench-mount') &&
                shopDiagnostics.collect().appReadyMs !== null, 'empty host ready');
            await document.fonts.ready;
            await bench.frame();
            result.emptyHostFrameMs = performance.now();
            result.startup = shopDiagnostics.collect();
            if (benchConfig.library === 'Flare') await bench.until(() => !!marks.flareReadyMs, 'Flare styled readiness');
            await bench.frame();
            result.styledHostFrameMs = performance.now();
            result.marks = marks;
            result.startupCss = css();
            result.registration = setup;
            result.startupResources = resources();
            result.coldMount = await mount();
            document.getElementById('bench-unmount').click();
            await bench.until(() => !document.getElementById('bench-mounted'), 'unmount');
            await bench.frame();
            result.warmMount = await mount();
            result.themeSwitches = [];
            for (const button of (params.get('switch') === '1' ? document.querySelectorAll('[data-bench-theme]') : [])) {
                const target = button.dataset.benchTheme;
                if (css().theme === target) continue;
                const start = performance.now();
                button.click();
                await bench.until(() => document.getElementById('bench-themes')?.dataset.benchActiveTheme === target, 'applied theme ' + target);
                await bench.until(() => Array.from(document.querySelectorAll('link[rel=stylesheet]')).every(l => !!l.sheet),
                    'theme stylesheets');
                await bench.frame();
                result.themeSwitches.push({ target, ms: performance.now() - start, styled: styledFields() });
            }
            result.resources = resources();
            result.paints = performance.getEntriesByType('paint').map(e => ({ name: e.name, time: e.startTime }));
            result.success = errors.length === 0 &&
                result.coldMount.styled.dates === 50 && result.coldMount.styled.times === 50 &&
                result.coldMount.styled.firstInput?.width > 0 && !result.environment.serviceWorker &&
                !result.resources.some(r => r.external) &&
                (benchConfig.library !== 'Flare' || !!result.coldMount.styled.primary);
        } catch (error) {
            errors.push(String(error));
            result.success = false;
        } finally {
            busy = false;
            window.benchAnalyticsResult = result;
            const output = document.getElementById('bench-report');
            if (output) output.textContent = JSON.stringify(result, null, 2);
            if (params.get('save') === '1') {
                const response = await fetch('/__results', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(result) });
                result.saved = response.ok;
                if (response.ok && params.get('sequence') === '1' && result.success) {
                    const next = (await response.json()).next;
                    if (next) location.assign(next + '&sequence=1');
                }
            }
            document.documentElement.dataset.benchComplete = result.success ? 'pass' : 'fail';
        }
        return result;
    }
    function download() {
        const url = URL.createObjectURL(new Blob([JSON.stringify(window.benchAnalyticsResult, null, 2)], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = 'bench-analytics.json';
        link.click();
        URL.revokeObjectURL(url);
    }
    // A manual startup measurement needs a fresh document and an empty host.
    function restart() {
        const url = new URL(location.href);
        url.searchParams.set('run', '1');
        url.searchParams.set('cache', 'warm');
        url.searchParams.delete('save');
        url.searchParams.delete('sequence');
        location.assign(url.href);
    }
    window.benchAnalytics = { run, restart, download, recordSetup: value => { setup = value; },
        mark: (name, value) => { marks[name] = value; } };
    async function interactions() {
        await bench.until(() => document.getElementById('bench-mount') && shopDiagnostics.collect().appReadyMs !== null &&
            (benchConfig.library !== 'Flare' || !!marks.flareReadyMs), 'styled host ready');
        await document.fonts.ready;
        const result = await bench.run();
        result.variant = params.get('variant') || benchConfig.library;
        result.round = Number(params.get('round') || 0);
        result.cache = params.get('cache') || 'manual';
        window.benchAnalyticsResult = result;
        if (params.get('save') === '1') {
            const response = await fetch('/__results', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(result)});
            if (response.ok && params.get('sequence') === '1' && result.success) {
                const next = (await response.json()).next;
                if (next) location.assign(next + '&sequence=1');
            }
        }
    }
    if (params.get('run') === '1') {
        if (params.get('mode') === 'interactions') interactions(); else run();
    }
})();
