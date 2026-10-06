// Драйвер замера date/time-пикеров, общий для пяти приложений Bench.*. Приложение описывает только
// свою разметку в window.benchConfig (как открыть календарь, где следующий месяц, как закрыть);
// сценарии, тайминг и отчет одинаковы, поэтому разница в цифрах - это разница библиотек.
//
// Время шага - от действия до первого кадра, в котором DOM уже показывает результат:
// ждем условие (MutationObserver + проверка в каждом кадре), затем еще один requestAnimationFrame.
(function () {
    'use strict';

    var TIMEOUT_MS = 10000;

    function frame() { return new Promise(function (r) { requestAnimationFrame(function () { r(); }); }); }

    function until(check, what) {
        return new Promise(function (resolve, reject) {
            if (check()) { resolve(); return; }
            var done = false;
            var observer = new MutationObserver(function () { if (!done && check()) finish(); });
            function finish() { done = true; observer.disconnect(); resolve(); }
            observer.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
            var started = performance.now();
            (function poll() {
                if (done) return;
                if (check()) { finish(); return; }
                if (performance.now() - started > TIMEOUT_MS) { done = true; observer.disconnect(); reject(new Error('timeout: ' + what)); return; }
                requestAnimationFrame(poll);
            })();
        });
    }

    async function timed(action, check, what) {
        var t0 = performance.now();
        await action();
        await until(check, what);
        await frame();
        return performance.now() - t0;
    }

    function median(values) {
        var s = values.slice().sort(function (a, b) { return a - b; });
        var m = Math.floor(s.length / 2);
        return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    }

    function round(v) { return Math.round(v * 10) / 10; }

    function firstDate() { return document.querySelector('.bench-date'); }
    function firstTime() { return document.querySelector('.bench-time'); }

    function setInput(input, text) {
        // Native setter, so frameworks that track the value property see the change.
        var setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        input.focus();
        setter.call(input, text);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        input.blur();
    }

    async function run() {
        var c = window.benchConfig;
        if (!c) throw new Error('window.benchConfig is not defined');
        var r = { library: c.library, scenarios: {} };

        if (document.getElementById('bench-mounted')) {
            document.getElementById('bench-unmount').click();
            await until(function () { return !document.getElementById('bench-mounted'); }, 'unmount before interactions');
            await frame();
        }
        var nodesBefore = document.getElementsByTagName('*').length;
        r.scenarios.mount = round(await timed(
            function () { document.getElementById('bench-mount').click(); },
            function () { return !!document.getElementById('bench-mounted') && c.mounted(); }, 'mount'));
        r.domNodesPer100Fields = document.getElementsByTagName('*').length - nodesBefore;

        // First open is cold (the popup's code and styles run for the first time); the rest are warm.
        var opens = [];
        for (var i = 0; i < 6; i++) {
            opens.push(await timed(function () { return c.openDate(firstDate()); }, c.calendarReady, 'openDate'));
            if (i === 0) {
                var titleBefore = c.title();
                var steps = [];
                for (var m = 0; m < 12; m++) {
                    var before = c.title();
                    steps.push(await timed(function () { c.next().click(); }, function () { return c.title() !== before; }, 'nextMonth'));
                }
                r.scenarios.nextMonthMedian = round(median(steps));
                r.scenarios.nextMonthMax = round(Math.max.apply(null, steps));
                r.titleAfter12 = c.title() + ' (from ' + titleBefore + ')';
            }
            await c.closeDate();
            await until(function () { return !c.calendarReady(); }, 'closeDate');
            await frame();
        }
        r.scenarios.openDateCold = round(opens[0]);
        r.scenarios.openDateWarm = round(median(opens.slice(1)));

        r.scenarios.typeDate = round(await timed(
            function () { setInput(c.dateInput(firstDate()), c.typed); },
            function () { return document.getElementById('bench-value').textContent.trim() === '2026-10-15'; }, 'typeDate'));

        var times = [];
        for (var t = 0; t < 4; t++) {
            times.push(await timed(function () { return c.openTime(firstTime()); }, c.timeReady, 'openTime'));
            await c.closeTime();
            await until(function () { return !c.timeReady(); }, 'closeTime');
            await frame();
        }
        r.scenarios.openTimeCold = round(times[0]);
        r.scenarios.openTimeWarm = round(median(times.slice(1)));

        r.startup = window.shopDiagnostics ? window.shopDiagnostics.collect() : null;
        window.benchResult = r;
        r.success = true;
        var output = document.getElementById('bench-report');
        if (output) output.textContent = JSON.stringify(r, null, 2);
        return r;
    }

    window.bench = { run: run, until: until, frame: frame };
})();
