// Идентичный скрипт диагностики для всех трёх фронтендов (Flare / MudBlazor / Radzen).
// Собирает метрики нагрузки страницы: тайминги загрузки, ресурсы, DOM, JS-кучу.
window.shopDiagnostics = {
  collect: function () {
    var nav = performance.getEntriesByType('navigation')[0];
    var resources = performance.getEntriesByType('resource');
    var transfer = 0;
    for (var i = 0; i < resources.length; i++) {
      transfer += resources[i].transferSize || 0;
    }
    var m = performance.memory; // Chromium-only; в остальных браузерах null
    return {
      domInteractiveMs: nav ? Math.round(nav.domInteractive) : null,
      domContentLoadedMs: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
      loadEventMs: nav ? Math.round(nav.loadEventEnd) : null,
      resourceCount: resources.length,
      resourceTransferBytes: transfer,
      domNodes: document.getElementsByTagName('*').length,
      usedJsHeapBytes: m ? m.usedJSHeapSize : null,
      totalJsHeapBytes: m ? m.totalJSHeapSize : null,
      jsHeapLimitBytes: m ? m.jsHeapSizeLimit : null,
      devicePixelRatio: window.devicePixelRatio || 1,
      userAgent: navigator.userAgent
    };
  }
};
