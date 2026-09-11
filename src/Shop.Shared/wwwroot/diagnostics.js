// Идентичный скрипт диагностики для всех трёх фронтендов (Flare / MudBlazor / Radzen).
// Подключается в <head> до blazor.webassembly.js, поэтому успевает подписаться на события
// отрисовки и длинные задачи ещё до старта .NET — иначе FCP/LCP и longtask уже не собрать.
//
// Собирает всё, чем приложения отличаются друг от друга при одинаковом коде страниц:
// тайминги загрузки, вес и состав ресурсов (рантайм Blazor / пакет библиотеки / шрифты),
// объём CSS темы, размер DOM, JS-кучу и параметры устройства.
(function () {
    'use strict';

    var observed = {
        firstPaintMs: null,
        firstContentfulPaintMs: null,
        largestContentfulPaintMs: null,
        longTaskCount: 0,
        longTaskTotalMs: 0,
        longestTaskMs: 0,
        appReadyMs: null,
        appRenders: 0
    };

    function observe(type, handler, extra) {
        try {
            var options = { type: type, buffered: true };
            if (extra) for (var key in extra) options[key] = extra[key];
            new PerformanceObserver(function (list) {
                var entries = list.getEntries();
                for (var i = 0; i < entries.length; i++) handler(entries[i]);
            }).observe(options);
        } catch (e) { /* тип не поддерживается этим браузером — метрика останется null */ }
    }

    observe('paint', function (entry) {
        if (entry.name === 'first-paint') observed.firstPaintMs = entry.startTime;
        if (entry.name === 'first-contentful-paint') observed.firstContentfulPaintMs = entry.startTime;
    });

    observe('largest-contentful-paint', function (entry) {
        observed.largestContentfulPaintMs = entry.startTime;
    });

    observe('longtask', function (entry) {
        observed.longTaskCount++;
        observed.longTaskTotalMs += entry.duration;
        if (entry.duration > observed.longestTaskMs) observed.longestTaskMs = entry.duration;
    });

    function round(value) {
        return (value === null || value === undefined || isNaN(value)) ? null : Math.round(value);
    }

    // Ресурс относится к одной из групп сравнения: рантайм Blazor, пакет UI-библиотеки,
    // шрифты, собственные файлы приложения. Имя пакета берём прямо из пути _content/<пакет>/.
    function groupOf(entry) {
        var url = entry.name;
        if (url.indexOf('/_framework/') >= 0) {
            if (/dotnet[.\-][^/]*\.js(\?|$)/.test(url) || /dotnet\.native/.test(url) || /dotnet\.runtime/.test(url))
                return 'Рантайм .NET';
            if (/\.(wasm|dll)(\?|$)/.test(url)) return 'Сборки приложения (.NET)';
            return 'Загрузчик Blazor';
        }
        var content = url.match(/\/_content\/([^/]+)\//);
        if (content) return 'Пакет ' + content[1];
        if (/fonts\.(googleapis|gstatic)\.com/.test(url) || /\.(woff2?|ttf|otf|eot)(\?|$)/.test(url)) return 'Шрифты';
        if (entry.initiatorType === 'css' || /\.css(\?|$)/.test(url)) return 'CSS приложения';
        if (entry.initiatorType === 'img' || /\.(png|jpe?g|gif|svg|webp|ico)(\?|$)/.test(url)) return 'Изображения';
        return 'Прочее';
    }

    function collectResources() {
        var entries = performance.getEntriesByType('resource');
        var groups = {};
        var totals = { count: 0, transferBytes: 0, decodedBytes: 0, cachedCount: 0, slowestMs: 0, slowestUrl: '' };

        for (var i = 0; i < entries.length; i++) {
            var entry = entries[i];
            var name = groupOf(entry);
            var group = groups[name] || (groups[name] = {
                name: name, count: 0, transferBytes: 0, decodedBytes: 0, cachedCount: 0, durationMs: 0
            });

            var transfer = entry.transferSize || 0;
            var decoded = entry.decodedBodySize || 0;

            group.count++;
            group.transferBytes += transfer;
            group.decodedBytes += decoded;
            group.durationMs += entry.duration || 0;
            if (transfer === 0 && decoded > 0) group.cachedCount++;

            totals.count++;
            totals.transferBytes += transfer;
            totals.decodedBytes += decoded;
            if (transfer === 0 && decoded > 0) totals.cachedCount++;
            if ((entry.duration || 0) > totals.slowestMs) {
                totals.slowestMs = entry.duration;
                totals.slowestUrl = entry.name.replace(/^https?:\/\/[^/]+/, '');
            }
        }

        var list = [];
        for (var key in groups) {
            groups[key].durationMs = round(groups[key].durationMs);
            list.push(groups[key]);
        }
        list.sort(function (a, b) { return b.transferBytes - a.transferBytes || b.decodedBytes - a.decodedBytes; });

        totals.slowestMs = round(totals.slowestMs);
        return { totals: totals, groups: list };
    }

    // Вес темы: сколько CSS-правил и селекторов реально подключила библиотека.
    // Кросс-доменные таблицы (шрифты Google) правила не отдают — они считаются как недоступные.
    function collectCss() {
        var sheets = document.styleSheets;
        var rules = 0, unreadable = 0;
        for (var i = 0; i < sheets.length; i++) {
            try {
                var sheetRules = sheets[i].cssRules;
                rules += sheetRules ? sheetRules.length : 0;
            } catch (e) { unreadable++; }
        }
        return { styleSheetCount: sheets.length, cssRuleCount: rules, unreadableStyleSheets: unreadable };
    }

    function maxDomDepth() {
        var max = 0;
        var walk = function (node, depth) {
            if (depth > max) max = depth;
            var children = node.children;
            for (var i = 0; i < children.length; i++) walk(children[i], depth + 1);
        };
        walk(document.documentElement, 1);
        return max;
    }

    function collectNavigation() {
        var nav = performance.getEntriesByType('navigation')[0];
        if (!nav) return null;
        return {
            type: nav.type,
            redirectCount: nav.redirectCount,
            dnsMs: round(nav.domainLookupEnd - nav.domainLookupStart),
            tcpMs: round(nav.connectEnd - nav.connectStart),
            tlsMs: nav.secureConnectionStart ? round(nav.connectEnd - nav.secureConnectionStart) : null,
            ttfbMs: round(nav.responseStart - nav.requestStart),
            responseMs: round(nav.responseEnd - nav.responseStart),
            domInteractiveMs: round(nav.domInteractive),
            domContentLoadedMs: round(nav.domContentLoadedEventEnd),
            loadEventMs: round(nav.loadEventEnd),
            documentTransferBytes: nav.transferSize || 0,
            documentDecodedBytes: nav.decodedBodySize || 0
        };
    }

    window.shopDiagnostics = {
        // Приложение отмечает момент первой готовой отрисовки (MainLayout, firstRender).
        // Это и есть «сколько ждёт пользователь до рабочего интерфейса» — главный показатель сравнения.
        markAppReady: function () {
            observed.appRenders++;
            if (observed.appReadyMs === null) {
                observed.appReadyMs = performance.now();
                try { performance.mark('shop-app-ready'); } catch (e) { /* нет поддержки User Timing */ }
            }
            return observed.appReadyMs;
        },

        collect: function () {
            var nav = collectNavigation();
            var resources = collectResources();
            var css = collectCss();
            var memory = performance.memory; // Chromium-only; в остальных браузерах undefined
            var connection = navigator.connection || {};

            return {
                // ----- Загрузка страницы -----
                navigationType: nav ? nav.type : '',
                redirectCount: nav ? nav.redirectCount : 0,
                dnsMs: nav ? nav.dnsMs : null,
                tcpMs: nav ? nav.tcpMs : null,
                tlsMs: nav ? nav.tlsMs : null,
                ttfbMs: nav ? nav.ttfbMs : null,
                responseMs: nav ? nav.responseMs : null,
                domInteractiveMs: nav ? nav.domInteractiveMs : null,
                domContentLoadedMs: nav ? nav.domContentLoadedMs : null,
                loadEventMs: nav ? nav.loadEventMs : null,
                documentTransferBytes: nav ? nav.documentTransferBytes : 0,
                documentDecodedBytes: nav ? nav.documentDecodedBytes : 0,

                // ----- Отрисовка -----
                firstPaintMs: round(observed.firstPaintMs),
                firstContentfulPaintMs: round(observed.firstContentfulPaintMs),
                largestContentfulPaintMs: round(observed.largestContentfulPaintMs),
                appReadyMs: round(observed.appReadyMs),
                appRenders: observed.appRenders,
                longTaskCount: observed.longTaskCount,
                longTaskTotalMs: round(observed.longTaskTotalMs),
                longestTaskMs: round(observed.longestTaskMs),

                // ----- Ресурсы -----
                resourceCount: resources.totals.count,
                resourceTransferBytes: resources.totals.transferBytes,
                resourceDecodedBytes: resources.totals.decodedBytes,
                resourceCachedCount: resources.totals.cachedCount,
                slowestResourceMs: resources.totals.slowestMs,
                slowestResourceUrl: resources.totals.slowestUrl,
                resourceGroups: resources.groups,

                // ----- DOM и CSS -----
                domNodes: document.getElementsByTagName('*').length,
                domDepth: maxDomDepth(),
                styleSheetCount: css.styleSheetCount,
                cssRuleCount: css.cssRuleCount,
                unreadableStyleSheets: css.unreadableStyleSheets,

                // ----- Память -----
                usedJsHeapBytes: memory ? memory.usedJSHeapSize : null,
                totalJsHeapBytes: memory ? memory.totalJSHeapSize : null,
                jsHeapLimitBytes: memory ? memory.jsHeapSizeLimit : null,

                // ----- Устройство и окружение -----
                devicePixelRatio: window.devicePixelRatio || 1,
                viewportWidth: window.innerWidth,
                viewportHeight: window.innerHeight,
                screenWidth: screen.width,
                screenHeight: screen.height,
                hardwareConcurrency: navigator.hardwareConcurrency || 0,
                deviceMemoryGb: navigator.deviceMemory || 0,
                connectionType: connection.effectiveType || '',
                connectionDownlinkMbps: connection.downlink || 0,
                connectionRttMs: connection.rtt || 0,
                language: navigator.language || '',
                userAgent: navigator.userAgent,
                collectedAt: new Date().toISOString()
            };
        },

        // Отчёт в буфер обмена — чтобы сравнивать три приложения, а не пересказывать цифры.
        copyReport: function (text) {
            if (!navigator.clipboard) return false;
            navigator.clipboard.writeText(text);
            return true;
        }
    };
})();
