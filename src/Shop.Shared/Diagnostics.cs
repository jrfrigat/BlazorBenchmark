
using Microsoft.JSInterop;

namespace Shop.Shared;

/// <summary>Снимок нагрузки приложения, собираемый одинаковым скриптом diagnostics.js во всех фронтендах.</summary>
public class DiagnosticsReport
{
    public double? DomInteractiveMs { get; set; }
    public double? DomContentLoadedMs { get; set; }
    public double? LoadEventMs { get; set; }
    public int ResourceCount { get; set; }
    public long ResourceTransferBytes { get; set; }
    public int DomNodes { get; set; }
    public long? UsedJsHeapBytes { get; set; }
    public long? TotalJsHeapBytes { get; set; }
    public long? JsHeapLimitBytes { get; set; }
    public double DevicePixelRatio { get; set; }
    public string UserAgent { get; set; } = "";

    public static string Bytes(long value) => value switch
    {
        >= 1_048_576 => $"{value / 1_048_576.0:F2} МБ",
        >= 1024 => $"{value / 1024.0:F1} КБ",
        _ => $"{value} Б",
    };
}

/// <summary>
/// Служба диагностики: читает метрики страницы через идентичный diagnostics.js,
/// подключённый в каждом из трёх приложений. Один код — одинаковые показатели.
/// </summary>
public class DiagnosticsService(IJSRuntime js)
{
    public async Task<DiagnosticsReport?> CollectAsync()
    {
        try
        {
            return await js.InvokeAsync<DiagnosticsReport>("shopDiagnostics.collect");
        }
        catch (JSDisconnectedException) { return null; }
        catch (JSException) { return null; }
        catch (InvalidOperationException) { return null; }
    }
}
