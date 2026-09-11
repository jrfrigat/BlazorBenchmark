using System.ComponentModel.DataAnnotations;

namespace Shop.Shared;

// Клиент получает КОПИИ записей хранилища (Clone), как раньше получал копии через JSON по HTTP:
// правка в гриде или диалоге не должна менять «серверные» данные в обход бизнес-правил.

public class Product
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string Sku { get; set; } = "";
    public string Category { get; set; } = "";
    public decimal Price { get; set; }
    public int Stock { get; set; }

    public Product Clone() => (Product)MemberwiseClone();
}

public class Customer
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string Phone { get; set; } = "";
    public string Email { get; set; } = "";
    public int OrdersCount { get; set; }

    public Customer Clone() => (Customer)MemberwiseClone();
}

public enum OrderStatus
{
    New = 0,
    Processing = 1,
    Shipped = 2,
    Completed = 3,
    Cancelled = 4,
}

public enum PaymentMethod
{
    Card = 0,
    Cash = 1,
    Transfer = 2,
}

public class OrderItem
{
    public int ProductId { get; set; }
    public string ProductName { get; set; } = "";
    public decimal UnitPrice { get; set; }
    public int Quantity { get; set; }
    public decimal Total => UnitPrice * Quantity;

    public OrderItem Clone() => (OrderItem)MemberwiseClone();
}

public class Order
{
    public int Id { get; set; }
    public int CustomerId { get; set; }
    public string CustomerName { get; set; } = "";
    public DateTime CreatedAt { get; set; }
    public OrderStatus Status { get; set; }
    public List<OrderItem> Items { get; set; } = [];
    public decimal Total => Items.Sum(i => i.Total);
    /// <summary>Оплачено по заказу (платежи без возвратов).</summary>
    public decimal Paid { get; set; }
    public bool IsFullyPaid => Paid >= Total;

    public Order Clone()
    {
        var copy = (Order)MemberwiseClone();
        copy.Items = Items.Select(i => i.Clone()).ToList();
        return copy;
    }
}

public class Payment
{
    public int Id { get; set; }
    public int OrderId { get; set; }
    public string CustomerName { get; set; } = "";
    public decimal Amount { get; set; }
    public PaymentMethod Method { get; set; }
    public DateTime PaidAt { get; set; }
    public bool Refunded { get; set; }

    public Payment Clone() => (Payment)MemberwiseClone();
}

// ----- Ввод (валидация DataAnnotations, одинаковая во всех фронтендах) -----

public class ProductInput
{
    [Required(ErrorMessage = "Укажите название")]
    [StringLength(60, MinimumLength = 2, ErrorMessage = "Название: от 2 до 60 символов")]
    public string Name { get; set; } = "";

    [Required(ErrorMessage = "Укажите артикул")]
    [RegularExpression(@"^[A-Za-z0-9\-]{3,12}$", ErrorMessage = "Артикул: 3–12 символов, латиница/цифры/дефис")]
    public string Sku { get; set; } = "";

    [Required(ErrorMessage = "Укажите категорию")]
    public string Category { get; set; } = "";

    [Range(0.01, 10_000_000, ErrorMessage = "Цена: от 0,01")]
    public decimal Price { get; set; }

    [Range(0, 1_000_000, ErrorMessage = "Остаток: от 0")]
    public int Stock { get; set; }
}

public class CustomerInput
{
    [Required(ErrorMessage = "Укажите имя")]
    [StringLength(60, MinimumLength = 2, ErrorMessage = "Имя: от 2 до 60 символов")]
    public string Name { get; set; } = "";

    [Required(ErrorMessage = "Укажите телефон")]
    [Phone(ErrorMessage = "Некорректный телефон")]
    public string Phone { get; set; } = "";

    [EmailAddress(ErrorMessage = "Некорректный e-mail")]
    public string Email { get; set; } = "";
}

public class OrderItemInput
{
    [Range(1, int.MaxValue, ErrorMessage = "Выберите товар")]
    public int ProductId { get; set; }

    [Range(1, 1000, ErrorMessage = "Количество: от 1 до 1000")]
    public int Quantity { get; set; } = 1;
}

public class OrderInput
{
    [Range(1, int.MaxValue, ErrorMessage = "Выберите клиента")]
    public int CustomerId { get; set; }

    [MinLength(1, ErrorMessage = "Добавьте хотя бы одну позицию")]
    public List<OrderItemInput> Items { get; set; } = [];
}

public class PaymentInput
{
    [Range(1, int.MaxValue, ErrorMessage = "Выберите заказ")]
    public int OrderId { get; set; }

    [Range(0.01, 10_000_000, ErrorMessage = "Сумма: от 0,01")]
    public decimal Amount { get; set; }

    public PaymentMethod Method { get; set; } = PaymentMethod.Card;
}

public class StatusInput
{
    public OrderStatus Status { get; set; }
}

// ----- Дашборд -----

public class DashboardData
{
    public decimal RevenueToday { get; set; }
    public int OrdersToday { get; set; }
    public int ProductsTotal { get; set; }
    public int LowStockCount { get; set; }
    public int CustomersTotal { get; set; }
    public decimal UnpaidAmount { get; set; }
    public List<RevenuePoint> RevenueByDay { get; set; } = [];
    public List<CategoryShare> SalesByCategory { get; set; } = [];
    public List<TopProduct> TopProducts { get; set; } = [];
    public List<RecentOrder> RecentOrders { get; set; } = [];
}

public class RevenuePoint
{
    public string Date { get; set; } = "";
    public decimal Revenue { get; set; }
    public int Orders { get; set; }
}

public class CategoryShare
{
    public string Category { get; set; } = "";
    public decimal Revenue { get; set; }
}

public class TopProduct
{
    public string Name { get; set; } = "";
    public int Quantity { get; set; }
    public decimal Revenue { get; set; }
}

public class RecentOrder
{
    public int Id { get; set; }
    public string CustomerName { get; set; } = "";
    public decimal Total { get; set; }
    public OrderStatus Status { get; set; }
    public DateTime CreatedAt { get; set; }
}
