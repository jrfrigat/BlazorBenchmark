namespace Shop.Shared;

/// <summary>
/// Общие демо-данные для страницы «Компоненты»: одни и те же числа/строки во всех трёх
/// приложениях, чтобы графики, таблицы и поля выглядели сопоставимо.
/// </summary>
public static class ShowcaseData
{
    public sealed record MonthPoint(string Month, double Revenue, double Orders);

    public static readonly string[] Cities = ["Москва", "Санкт-Петербург", "Новосибирск", "Екатеринбург", "Казань"];

    public static readonly string[] Categories = ["Электроника", "Аксессуары", "Бытовая техника"];

    public static readonly List<MonthPoint> Monthly =
    [
        new("Янв", 128, 42),
        new("Фев", 156, 51),
        new("Мар", 149, 47),
        new("Апр", 182, 60),
        new("Май", 210, 68),
        new("Июн", 195, 63),
        new("Июл", 234, 77),
        new("Авг", 251, 82),
    ];

    public sealed record DemoProduct(string Name, string Category, decimal Price, int Stock)
    {
        public decimal Value => Price;
    }

    public static readonly List<DemoProduct> Products =
    [
        new("Смартфон Nova 12", "Электроника", 49_990m, 24),
        new("Ноутбук Air 13", "Электроника", 79_990m, 12),
        new("Наушники AirSound", "Аксессуары", 12_490m, 47),
        new("Монитор View 27\"", "Электроника", 26_990m, 8),
        new("Клавиатура TypeMaster", "Аксессуары", 7_490m, 31),
        new("Робот-пылесос CleanBot", "Бытовая техника", 34_990m, 15),
    ];

    public static readonly decimal[] CategoryShare = [55m, 30m, 15m];
}
