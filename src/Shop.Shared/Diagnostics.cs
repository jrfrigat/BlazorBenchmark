using System.Globalization;
using System.Text;
using System.Text.Json;
using Microsoft.JSInterop;

namespace Shop.Shared;

/// <summary>Группа ресурсов страницы: рантайм .NET, пакет UI-библиотеки, шрифты и т. д.</summary>
public class ResourceGroupInfo
{
    public string Name { get; set; } = "";
    public int Count { get; set; }
    public long TransferBytes { get; set; }
    public long DecodedBytes { get; set; }
    public int CachedCount { get; set; }
    public double DurationMs { get; set; }
}

/// <summary>
/// Снимок нагрузки приложения, собираемый одинаковым скриптом diagnostics.js во всех фронтендах:
/// тайминги загрузки, отрисовка, состав и вес ресурсов, размер DOM и CSS, JS-куча, устройство.
/// </summary>
public class DiagnosticsReport
{
    // ----- Загрузка страницы -----
    public string NavigationType { get; set; } = "";
    public int RedirectCount { get; set; }
    public double? DnsMs { get; set; }
    public double? TcpMs { get; set; }
    public double? TlsMs { get; set; }
    public double? TtfbMs { get; set; }
    public double? ResponseMs { get; set; }
    public double? DomInteractiveMs { get; set; }
    public double? DomContentLoadedMs { get; set; }
    public double? LoadEventMs { get; set; }
    public long DocumentTransferBytes { get; set; }
    public long DocumentDecodedBytes { get; set; }

    // ----- Отрисовка -----
    public double? FirstPaintMs { get; set; }
    public double? FirstContentfulPaintMs { get; set; }
    public double? LargestContentfulPaintMs { get; set; }
    /// <summary>Момент первой готовой отрисовки интерфейса приложения (MainLayout, firstRender).</summary>
    public double? AppReadyMs { get; set; }
    public int AppRenders { get; set; }
    public int LongTaskCount { get; set; }
    public double? LongTaskTotalMs { get; set; }
    public double? LongestTaskMs { get; set; }

    // ----- Ресурсы -----
    public int ResourceCount { get; set; }
    public long ResourceTransferBytes { get; set; }
    public long ResourceDecodedBytes { get; set; }
    public int ResourceCachedCount { get; set; }
    public double? SlowestResourceMs { get; set; }
    public string SlowestResourceUrl { get; set; } = "";
    public List<ResourceGroupInfo> ResourceGroups { get; set; } = [];

    // ----- DOM и CSS -----
    public int DomNodes { get; set; }
    public int DomDepth { get; set; }
    public int StyleSheetCount { get; set; }
    public int CssRuleCount { get; set; }
    public int UnreadableStyleSheets { get; set; }

    // ----- Память -----
    public long? UsedJsHeapBytes { get; set; }
    public long? TotalJsHeapBytes { get; set; }
    public long? JsHeapLimitBytes { get; set; }

    // ----- Устройство и окружение -----
    public double DevicePixelRatio { get; set; }
    public int ViewportWidth { get; set; }
    public int ViewportHeight { get; set; }
    public int ScreenWidth { get; set; }
    public int ScreenHeight { get; set; }
    public int HardwareConcurrency { get; set; }
    public double DeviceMemoryGb { get; set; }
    public string ConnectionType { get; set; } = "";
    public double ConnectionDownlinkMbps { get; set; }
    public double ConnectionRttMs { get; set; }
    public string Language { get; set; } = "";
    public string UserAgent { get; set; } = "";
    public string CollectedAt { get; set; } = "";

    /// <summary>Имя приложения бенчмарка — подставляет фронтенд, скрипт про него не знает.</summary>
    public string AppName { get; set; } = "";

    public static string Bytes(long value) => value switch
    {
        >= 1_048_576 => $"{value / 1_048_576.0:F2} МБ",
        >= 1024 => $"{value / 1024.0:F1} КБ",
        _ => $"{value} Б",
    };

    public static string Ms(double? value) =>
        value is null ? "нет данных" : $"{value.Value.ToString("N0", CultureInfo.InvariantCulture)} мс";

    private static string Num(double value) => value.ToString("N0", CultureInfo.InvariantCulture);

    /// <summary>
    /// Разделы отчёта — одинаковые во всех трёх приложениях: каждая страница «Диагностика»
    /// только рисует их своими компонентами, набор и порядок показателей общий.
    /// </summary>
    public IReadOnlyList<DiagnosticsSection> ToSections() =>
    [
        new("Отрисовка", [
            new("Первая отрисовка (FP)", Ms(FirstPaintMs)),
            new("Первый контент (FCP)", Ms(FirstContentfulPaintMs)),
            new("Крупнейший элемент (LCP)", Ms(LargestContentfulPaintMs)),
            new("Интерфейс приложения готов", Ms(AppReadyMs)),
            new("Длинных задач (> 50 мс)", $"{LongTaskCount} шт., суммарно {Ms(LongTaskTotalMs)}"),
            new("Самая длинная задача", Ms(LongestTaskMs)),
        ]),
        new("Загрузка страницы", [
            new("Тип навигации", string.IsNullOrEmpty(NavigationType) ? "—" : NavigationType),
            new("DNS / TCP / TLS", $"{Ms(DnsMs)} / {Ms(TcpMs)} / {(TlsMs is null ? "без TLS" : Ms(TlsMs))}"),
            new("Ответ сервера (TTFB)", Ms(TtfbMs)),
            new("Загрузка документа", $"{Ms(ResponseMs)}, {Bytes(DocumentTransferBytes)} (распаковано {Bytes(DocumentDecodedBytes)})"),
            new("DOM interactive", Ms(DomInteractiveMs)),
            new("DOMContentLoaded", Ms(DomContentLoadedMs)),
            new("Load event", Ms(LoadEventMs)),
        ]),
        new("Ресурсы", [
            new("Всего запросов", $"{ResourceCount} шт., из них из кэша {ResourceCachedCount}"),
            new("Передано по сети", Bytes(ResourceTransferBytes)),
            new("Распаковано", Bytes(ResourceDecodedBytes)),
            new("Самый долгий ресурс", SlowestResourceMs is null
                ? "нет данных"
                : $"{Ms(SlowestResourceMs)} — {SlowestResourceUrl}"),
        ]),
        new("DOM и стили", [
            new("Узлов в DOM", Num(DomNodes)),
            new("Глубина DOM", Num(DomDepth)),
            new("Таблиц стилей", Num(StyleSheetCount) + (UnreadableStyleSheets > 0 ? $" (недоступно для чтения: {UnreadableStyleSheets})" : "")),
            new("CSS-правил", CssRuleCount > 0 ? Num(CssRuleCount) : "нет данных"),
        ]),
        new("Память", [
            new("JS-куча, занято", UsedJsHeapBytes is { } used ? Bytes(used) : "нет данных (только Chromium)"),
            new("JS-куча, выделено", TotalJsHeapBytes is { } total ? Bytes(total) : "нет данных"),
            new("JS-куча, предел", JsHeapLimitBytes is { } limit ? Bytes(limit) : "нет данных"),
        ]),
        new("Устройство", [
            new("Окно / экран", $"{ViewportWidth}×{ViewportHeight} / {ScreenWidth}×{ScreenHeight}"),
            new("Device pixel ratio", DevicePixelRatio.ToString("0.##", CultureInfo.InvariantCulture)),
            new("Ядер CPU / память", $"{(HardwareConcurrency > 0 ? HardwareConcurrency.ToString() : "—")} / {(DeviceMemoryGb > 0 ? DeviceMemoryGb + " ГБ" : "—")}"),
            new("Сеть", string.IsNullOrEmpty(ConnectionType)
                ? "нет данных"
                : $"{ConnectionType}, {ConnectionDownlinkMbps} Мбит/с, RTT {ConnectionRttMs} мс"),
            new("Язык браузера", string.IsNullOrEmpty(Language) ? "—" : Language),
            new("User agent", UserAgent),
        ]),
    ];

    /// <summary>Текстовый отчёт для буфера обмена: удобно складывать рядом три приложения.</summary>
    public string ToPlainText()
    {
        var text = new StringBuilder();
        text.AppendLine($"Диагностика — {(string.IsNullOrEmpty(AppName) ? "приложение" : AppName)} ({CollectedAt})");
        foreach (var section in ToSections())
        {
            text.AppendLine();
            text.AppendLine($"[{section.Title}]");
            foreach (var row in section.Rows)
                text.AppendLine($"{row.Name}: {row.Value}");
        }

        text.AppendLine();
        text.AppendLine("[Ресурсы по группам]");
        foreach (var group in ResourceGroups)
            text.AppendLine($"{group.Name}: {group.Count} шт., {Bytes(group.TransferBytes)} по сети, {Bytes(group.DecodedBytes)} распаковано");
        return text.ToString();
    }

    public string ToJson() => JsonSerializer.Serialize(this, DiagnosticsJson.Options);
}

/// <summary>Раздел отчёта диагностики.</summary>
public sealed record DiagnosticsSection(string Title, IReadOnlyList<DiagnosticsRow> Rows);

/// <summary>Строка отчёта диагностики: показатель и значение.</summary>
public sealed record DiagnosticsRow(string Name, string Value);

internal static class DiagnosticsJson
{
    public static readonly JsonSerializerOptions Options = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };
}

/// <summary>
/// Служба диагностики: читает метрики страницы через идентичный diagnostics.js,
/// подключённый в каждом из трёх приложений. Один код — одинаковые показатели.
/// </summary>
public class DiagnosticsService(IJSRuntime js)
{
    /// <summary>Отмечает первую готовую отрисовку интерфейса; вызывается из MainLayout (firstRender).</summary>
    public async Task MarkAppReadyAsync()
    {
        try { await js.InvokeVoidAsync("shopDiagnostics.markAppReady"); }
        catch (JSDisconnectedException) { }
        catch (JSException) { }
        catch (InvalidOperationException) { }
    }

    public async Task<DiagnosticsReport?> CollectAsync(string appName = "")
    {
        try
        {
            var report = await js.InvokeAsync<DiagnosticsReport>("shopDiagnostics.collect");
            if (report is not null) report.AppName = appName;
            return report;
        }
        catch (JSDisconnectedException) { return null; }
        catch (JSException) { return null; }
        catch (InvalidOperationException) { return null; }
    }

    /// <summary>Копирует текстовый отчёт в буфер обмена. Возвращает false, если браузер не дал доступ.</summary>
    public async Task<bool> CopyAsync(string text)
    {
        try { return await js.InvokeAsync<bool>("shopDiagnostics.copyReport", text); }
        catch (JSDisconnectedException) { return false; }
        catch (JSException) { return false; }
        catch (InvalidOperationException) { return false; }
    }
}
