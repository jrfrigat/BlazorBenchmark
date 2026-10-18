using System.Globalization;
using System.Text.Json;
using Microsoft.AspNetCore.Components;

namespace Bench.Shared;

/// <summary>Identical fixtures and data operations for every component-library adapter.</summary>
public sealed class ComponentBenchState
{
    public static readonly string[] Kinds = ["button", "text", "number", "checkbox", "switch", "select", "datagrid"];
    public static readonly string[] Options = Enumerable.Range(0, 100).Select(i => $"Option {i:000}").ToArray();
    public string Kind { get; private set; } = "button";
    public int Count { get; private set; } = 1;
    public int RowCount { get; private set; } = 100;
    public bool Mounted { get; private set; }
    public int Version { get; private set; }
    public int Changes { get; private set; }
    public string Snapshot { get; private set; } = "{}";
    public string[] Text { get; } = new string[50];
    public decimal[] Numbers { get; } = new decimal[50];
    public bool[] Checks { get; } = new bool[50];
    public bool[] Switches { get; } = new bool[50];
    public string[] Selections { get; } = new string[50];
    public int[] Clicks { get; } = new int[50];
    public IReadOnlyList<BenchGridRow> Rows { get; private set; } = [];
    public IQueryable<BenchGridRow> QueryRows { get; private set; } = Array.Empty<BenchGridRow>().AsQueryable();
    public Func<Task> Changed { get; set; } = () => Task.CompletedTask;
    private BenchGridRow[] _source = [];
    private bool _descending, _filtered, _windowed;
    private int _page, _updates;

    public ComponentBenchState() => Reset();

    public Task Configure(string kind, int count, int rows)
    {
        if (!Kinds.Contains(kind) || count is not (1 or 50) || rows is not (100 or 1000))
            throw new ArgumentOutOfRangeException(nameof(kind), "Unsupported benchmark fixture.");
        Kind = kind; Count = count; RowCount = rows; Mounted = false; Reset();
        return Notify();
    }
    public Task Mount(bool mounted) { Mounted = mounted; return Notify(); }
    public Task Rerender() { Version++; return Notify(); }
    public Task Click(int i) { Index(i); Clicks[i]++; return Commit(); }
    public Task SetText(int i, string? value) { Index(i); Text[i] = value ?? ""; return Commit(); }
    public Task SetNumber(int i, decimal value) { Index(i); Numbers[i] = value; return Commit(); }
    public Task SetCheck(int i, bool value) { Index(i); Checks[i] = value; return Commit(); }
    public Task SetSwitch(int i, bool value) { Index(i); Switches[i] = value; return Commit(); }
    public Task SetSelection(int i, string? value)
    {
        Index(i);
        if (value is null || !Options.Contains(value)) throw new ArgumentOutOfRangeException(nameof(value));
        Selections[i] = value; return Commit();
    }
    public Task Grid(string action)
    {
        switch (action)
        {
            case "reset": _descending = _filtered = _windowed = false; _page = 0; break;
            case "sort": _descending = !_descending; break;
            case "filter": _filtered = !_filtered; _page = 0; break;
            case "page": _windowed = true; _page = (_page + 1) % 2; break;
            case "update":
                _updates++;
                _source = _source.Select(r => r.Id == 1 ? r with { Price = 2000m + _updates } : r).ToArray();
                break;
            default: throw new ArgumentOutOfRangeException(nameof(action));
        }
        ShapeRows(); return Commit();
    }
    private void Reset()
    {
        Array.Fill(Text, ""); Array.Clear(Numbers); Array.Clear(Checks); Array.Clear(Switches);
        Array.Fill(Selections, Options[0]); Array.Clear(Clicks); Changes = Version = 0;
        _descending = _filtered = _windowed = false; _page = _updates = 0;
        _source = Enumerable.Range(1, RowCount).Select(i =>
            new BenchGridRow(i, $"Product {i:0000}", (i * 37 % 997) + .25m, i % 101, i % 2 == 0)).ToArray();
        ShapeRows(); UpdateSnapshot();
    }
    private void ShapeRows()
    {
        IEnumerable<BenchGridRow> data = _filtered ? _source.Where(r => r.Active) : _source;
        data = _descending ? data.OrderByDescending(r => r.Price).ThenBy(r => r.Id) : data.OrderBy(r => r.Id);
        if (_windowed) data = data.Skip(_page * 50).Take(50);
        Rows = data.ToArray();
        QueryRows = Rows.AsQueryable();
    }
    private void Index(int i) { if (i < 0 || i >= Count) throw new ArgumentOutOfRangeException(nameof(i)); }
    private Task Commit() { Changes++; return Notify(); }
    private Task Notify() { UpdateSnapshot(); return Changed(); }
    private void UpdateSnapshot()
    {
        string value = Kind switch
        {
            "button" => Clicks[0].ToString(CultureInfo.InvariantCulture), "text" => Text[0],
            "number" => Numbers[0].ToString(CultureInfo.InvariantCulture),
            "checkbox" => Checks[0] ? "true" : "false", "switch" => Switches[0] ? "true" : "false",
            "select" => Selections[0], _ => ""
        };
        Snapshot = JsonSerializer.Serialize(new { kind = Kind, count = Count, rowCount = RowCount,
            mounted = Mounted, version = Version, changes = Changes, value,
            rows = Kind == "datagrid" ? Rows.Select(r => new { id = r.Id, name = r.Name,
                price = r.Price.ToString("F2", CultureInfo.InvariantCulture), stock = r.Stock, active = r.Active }) : null });
    }
}

public sealed record BenchGridRow(int Id, string Name, decimal Price, int Stock, bool Active);

/// <summary>Shared cell markup makes row order and displayed values independently observable.</summary>
public static class BenchGridCells
{
    public static RenderFragment Cell(BenchGridRow row, string field) => builder =>
    {
        var text = field switch { "id" => row.Id.ToString(CultureInfo.InvariantCulture), "name" => row.Name,
            "price" => row.Price.ToString("F2", CultureInfo.InvariantCulture),
            "stock" => row.Stock.ToString(CultureInfo.InvariantCulture), "active" => row.Active ? "true" : "false",
            _ => throw new ArgumentOutOfRangeException(nameof(field)) };
        builder.OpenElement(0, "span"); builder.AddAttribute(1, "data-grid-field", field);
        builder.AddAttribute(2, "data-grid-id", row.Id); builder.AddContent(3, text); builder.CloseElement();
    };
}
