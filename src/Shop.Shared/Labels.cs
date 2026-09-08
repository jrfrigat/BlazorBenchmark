using System.Globalization;

namespace Shop.Shared;

/// <summary>Общие подписи и форматирование — одинаковые во всех трёх фронтендах.</summary>
public static class ShopLabels
{
    public static readonly Dictionary<OrderStatus, string> OrderStatus = new()
    {
        [Shared.OrderStatus.New] = "Новый",
        [Shared.OrderStatus.Processing] = "В работе",
        [Shared.OrderStatus.Shipped] = "Отправлен",
        [Shared.OrderStatus.Completed] = "Выполнен",
        [Shared.OrderStatus.Cancelled] = "Отменён",
    };

    public static readonly Dictionary<PaymentMethod, string> PaymentMethod = new()
    {
        [Shared.PaymentMethod.Card] = "Карта",
        [Shared.PaymentMethod.Cash] = "Наличные",
        [Shared.PaymentMethod.Transfer] = "Перевод",
    };

    public static string OrderStatusText(OrderStatus status) => OrderStatus[status];
    public static string PaymentMethodText(PaymentMethod method) => PaymentMethod[method];

    /// <summary>Нейтральный тон для цвета — каждый фреймворк отображает своим цветовым API.</summary>
    public enum StatusTone
    {
        Neutral,
        Info,
        Success,
        Warning,
        Error,
    }

    public static StatusTone OrderStatusTone(OrderStatus status) => status switch
    {
        Shared.OrderStatus.New => StatusTone.Info,
        Shared.OrderStatus.Processing => StatusTone.Warning,
        Shared.OrderStatus.Shipped => StatusTone.Neutral,
        Shared.OrderStatus.Completed => StatusTone.Success,
        Shared.OrderStatus.Cancelled => StatusTone.Error,
        _ => StatusTone.Neutral,
    };

    public static string PaymentLabel(Order order) => order.Paid <= 0
        ? "Не оплачен"
        : (order.IsFullyPaid ? "Оплачен" : $"Оплачен {order.Paid / order.Total:P0}");

    // Инвариантный формат + знак ₽: WASM-приложения по умолчанию запускаются с
    // InvariantGlobalization (ICU не грузится — это честнее для сравнения размеров PWA),
    // поэтому культуру ru-RU для чисел не используем.
    public static string Money(decimal value) => $"{value.ToString("N0", CultureInfo.InvariantCulture)} ₽";

    public static readonly CultureInfo RuCulture = GetRuCulture();

    private static CultureInfo GetRuCulture()
    {
        try { return new CultureInfo("ru-RU"); }
        catch (CultureNotFoundException) { return CultureInfo.CurrentCulture; }
    }

    public static string Date(DateTime value) => value.ToString("dd.MM.yyyy");
    public static string DateTimeShort(DateTime value) => value.ToString("dd.MM HH:mm");
}
