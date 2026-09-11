using Microsoft.Extensions.DependencyInjection;

namespace Shop.Shared;

/// <summary>
/// Единый «API-клиент» для всех трёх фронтендов: одна и та же бизнес-логика, фронтенды отличаются
/// только UI-компонентами. Раньше методы ходили по HTTP в ShopApi; теперь бэкенд имитируется прямо
/// в браузере поверх <see cref="ShopStore"/> — приложение целиком статическое и живёт на GitHub Pages.
/// Сигнатуры остались асинхронными: у страниц сохраняются состояния загрузки, а искусственную
/// задержку «сети» можно включить через <see cref="ShopStore.Latency"/>.
/// </summary>
public class ShopClient(ShopStore store)
{
    private readonly ShopStore _store = store;

    private async Task<T> ResultAsync<T>(Func<T> work)
    {
        if (_store.Latency > TimeSpan.Zero)
            await Task.Delay(_store.Latency);
        else
            await Task.Yield();
        return work();
    }

    private Task CompleteAsync(Action work) => ResultAsync<object?>(() => { work(); return null; });

    // ----- Дашборд -----

    public Task<DashboardData> GetDashboardAsync() => ResultAsync(() =>
    {
        var today = DateTime.Today;
        var liveOrders = _store.Orders.Where(o => o.Status != OrderStatus.Cancelled).ToList();

        var byDay = Enumerable.Range(0, 14)
            .Select(i =>
            {
                var day = today.AddDays(-(13 - i));
                var dayOrders = liveOrders.Where(o => o.CreatedAt.Date == day).ToList();
                return new RevenuePoint
                {
                    Date = day.ToString("dd.MM"),
                    Revenue = dayOrders.Sum(o => o.Total),
                    Orders = dayOrders.Count,
                };
            })
            .ToList();

        var categoryById = _store.Products.ToDictionary(p => p.Id, p => p.Category);
        var salesByCategory = liveOrders
            .SelectMany(o => o.Items)
            .GroupBy(i => categoryById.GetValueOrDefault(i.ProductId, "Прочее"))
            .Select(g => new CategoryShare { Category = g.Key, Revenue = g.Sum(i => i.Total) })
            .OrderByDescending(c => c.Revenue)
            .ToList();

        var topProducts = liveOrders
            .SelectMany(o => o.Items)
            .GroupBy(i => i.ProductName)
            .Select(g => new TopProduct { Name = g.Key, Quantity = g.Sum(i => i.Quantity), Revenue = g.Sum(i => i.Total) })
            .OrderByDescending(p => p.Revenue)
            .Take(5)
            .ToList();

        var recent = _store.Orders
            .OrderByDescending(o => o.CreatedAt)
            .Take(8)
            .Select(o => new RecentOrder { Id = o.Id, CustomerName = o.CustomerName, Total = o.Total, Status = o.Status, CreatedAt = o.CreatedAt })
            .ToList();

        return new DashboardData
        {
            RevenueToday = liveOrders.Where(o => o.CreatedAt.Date == today).Sum(o => o.Total),
            OrdersToday = liveOrders.Count(o => o.CreatedAt.Date == today),
            ProductsTotal = _store.Products.Count,
            LowStockCount = _store.Products.Count(p => p.Stock <= 5),
            CustomersTotal = _store.Customers.Count,
            UnpaidAmount = liveOrders.Sum(o => Math.Max(0, o.Total - o.Paid)),
            RevenueByDay = byDay,
            SalesByCategory = salesByCategory,
            TopProducts = topProducts,
            RecentOrders = recent,
        };
    });

    // ----- Товары -----

    public Task<List<Product>> GetProductsAsync() =>
        ResultAsync(() => _store.Products.Select(p => p.Clone()).ToList());

    public Task<Product?> GetProductAsync(int id) =>
        ResultAsync(() => _store.Products.FirstOrDefault(p => p.Id == id)?.Clone());

    public Task<Product> CreateProductAsync(ProductInput input) => ResultAsync(() =>
    {
        Validate(input);

        var product = new Product
        {
            Id = _store.NextId(),
            Name = input.Name.Trim(),
            Sku = input.Sku.Trim().ToUpperInvariant(),
            Category = input.Category.Trim(),
            Price = input.Price,
            Stock = input.Stock,
        };
        _store.Products.Add(product);
        return product.Clone();
    });

    public Task<Product> UpdateProductAsync(int id, ProductInput input) => ResultAsync(() =>
    {
        Validate(input);

        var product = _store.Products.FirstOrDefault(p => p.Id == id)
            ?? throw new ShopException("Товар не найден");

        product.Name = input.Name.Trim();
        product.Sku = input.Sku.Trim().ToUpperInvariant();
        product.Category = input.Category.Trim();
        product.Price = input.Price;
        product.Stock = input.Stock;
        return product.Clone();
    });

    public Task DeleteProductAsync(int id) => CompleteAsync(() =>
    {
        var product = _store.Products.FirstOrDefault(p => p.Id == id)
            ?? throw new ShopException("Товар не найден");
        _store.Products.Remove(product);
    });

    // ----- Клиенты -----

    public Task<List<Customer>> GetCustomersAsync() => ResultAsync(() => _store.Customers.Select(c =>
    {
        var copy = c.Clone();
        copy.OrdersCount = _store.Orders.Count(o => o.CustomerId == c.Id && o.Status != OrderStatus.Cancelled);
        return copy;
    }).ToList());

    public Task<Customer> CreateCustomerAsync(CustomerInput input) => ResultAsync(() =>
    {
        Validate(input);

        var customer = new Customer
        {
            Id = _store.NextId(),
            Name = input.Name.Trim(),
            Phone = input.Phone.Trim(),
            Email = input.Email?.Trim() ?? "",
        };
        _store.Customers.Add(customer);
        return customer.Clone();
    });

    public Task<Customer> UpdateCustomerAsync(int id, CustomerInput input) => ResultAsync(() =>
    {
        Validate(input);

        var customer = _store.Customers.FirstOrDefault(c => c.Id == id)
            ?? throw new ShopException("Клиент не найден");

        customer.Name = input.Name.Trim();
        customer.Phone = input.Phone.Trim();
        customer.Email = input.Email?.Trim() ?? "";

        foreach (var order in _store.Orders.Where(o => o.CustomerId == id))
            order.CustomerName = customer.Name;
        foreach (var payment in _store.Payments)
            if (_store.Orders.Any(o => o.Id == payment.OrderId && o.CustomerId == id))
                payment.CustomerName = customer.Name;
        return customer.Clone();
    });

    public Task DeleteCustomerAsync(int id) => CompleteAsync(() =>
    {
        if (_store.Orders.Any(o => o.CustomerId == id))
            throw new ShopException("Нельзя удалить клиента с заказами");

        var customer = _store.Customers.FirstOrDefault(c => c.Id == id)
            ?? throw new ShopException("Клиент не найден");
        _store.Customers.Remove(customer);
    });

    // ----- Заказы -----

    public Task<List<Order>> GetOrdersAsync() => ResultAsync(() =>
    {
        foreach (var order in _store.Orders)
            order.Paid = _store.Payments.Where(p => p.OrderId == order.Id && !p.Refunded).Sum(p => p.Amount);
        return _store.Orders
            .OrderByDescending(o => o.CreatedAt)
            .ThenByDescending(o => o.Id)
            .Select(o => o.Clone())
            .ToList();
    });

    public Task<Order> CreateOrderAsync(OrderInput input) => ResultAsync(() =>
    {
        Validate(input);

        var customer = _store.Customers.FirstOrDefault(c => c.Id == input.CustomerId)
            ?? throw ShopException.ForField(nameof(OrderInput.CustomerId), "Клиент не найден");

        var items = new List<OrderItem>();
        foreach (var item in input.Items)
        {
            var product = _store.Products.FirstOrDefault(p => p.Id == item.ProductId)
                ?? throw ShopException.ForField(nameof(OrderInput.Items), $"Товар {item.ProductId} не найден");
            if (product.Stock < item.Quantity)
                throw ShopException.ForField(nameof(OrderInput.Items), $"«{product.Name}»: в наличии только {product.Stock}");

            items.Add(new OrderItem { ProductId = product.Id, ProductName = product.Name, UnitPrice = product.Price, Quantity = item.Quantity });
        }

        foreach (var item in items)
            _store.Products.First(p => p.Id == item.ProductId).Stock -= item.Quantity;

        var order = new Order
        {
            Id = _store.NextOrderId(),
            CustomerId = customer.Id,
            CustomerName = customer.Name,
            CreatedAt = DateTime.Now,
            Status = OrderStatus.New,
            Items = items,
        };
        _store.Orders.Add(order);
        return order.Clone();
    });

    public Task<Order> SetOrderStatusAsync(int id, OrderStatus status) => ResultAsync(() =>
    {
        var order = _store.Orders.FirstOrDefault(o => o.Id == id)
            ?? throw new ShopException("Заказ не найден");

        var allowed = order.Status switch
        {
            OrderStatus.New => (OrderStatus[])[OrderStatus.Processing, OrderStatus.Cancelled],
            OrderStatus.Processing => [OrderStatus.Shipped, OrderStatus.Cancelled],
            OrderStatus.Shipped => [OrderStatus.Completed],
            _ => [],
        };
        if (!allowed.Contains(status))
            throw ShopException.ForField(nameof(StatusInput.Status),
                $"Переход «{ShopLabels.OrderStatusText(order.Status)}» → «{ShopLabels.OrderStatusText(status)}» невозможен");

        if (status == OrderStatus.Cancelled)
            foreach (var item in order.Items)
            {
                var product = _store.Products.FirstOrDefault(p => p.Id == item.ProductId);
                if (product is not null) product.Stock += item.Quantity;
            }

        order.Status = status;
        return order.Clone();
    });

    // ----- Оплаты -----

    public Task<List<Payment>> GetPaymentsAsync() => ResultAsync(() => _store.Payments
        .OrderByDescending(p => p.PaidAt)
        .ThenByDescending(p => p.Id)
        .Select(p => p.Clone())
        .ToList());

    public Task<Payment> CreatePaymentAsync(PaymentInput input) => ResultAsync(() =>
    {
        Validate(input);

        var order = _store.Orders.FirstOrDefault(o => o.Id == input.OrderId)
            ?? throw ShopException.ForField(nameof(PaymentInput.OrderId), "Заказ не найден");
        if (order.Status == OrderStatus.Cancelled)
            throw ShopException.ForField(nameof(PaymentInput.OrderId), "Заказ отменён");

        var paid = _store.Payments.Where(p => p.OrderId == order.Id && !p.Refunded).Sum(p => p.Amount);
        if (input.Amount > order.Total - paid + 0.001m)
            throw ShopException.ForField(nameof(PaymentInput.Amount), $"Остаток к оплате: {ShopLabels.Money(order.Total - paid)}");

        var payment = new Payment
        {
            Id = _store.NextId(),
            OrderId = order.Id,
            CustomerName = order.CustomerName,
            Amount = input.Amount,
            Method = input.Method,
            PaidAt = DateTime.Now,
        };
        _store.Payments.Add(payment);
        order.Paid = paid + payment.Amount;
        return payment.Clone();
    });

    public Task RefundPaymentAsync(int id) => CompleteAsync(() =>
    {
        var payment = _store.Payments.FirstOrDefault(p => p.Id == id)
            ?? throw new ShopException("Платёж не найден");
        if (payment.Refunded)
            throw new ShopException("Платёж уже возвращён");

        payment.Refunded = true;
        var order = _store.Orders.FirstOrDefault(o => o.Id == payment.OrderId);
        if (order is not null)
            order.Paid = _store.Payments.Where(p => p.OrderId == order.Id && !p.Refunded).Sum(p => p.Amount);
    });

    private static void Validate<T>(T input)
    {
        if (!ShopValidator.Validate(input, out var errors))
            throw ShopException.FromErrors(errors);
    }
}

public static class ShopClientServiceCollectionExtensions
{
    /// <summary>Регистрирует имитацию бэкенда: одно хранилище на приложение и клиент к нему.</summary>
    public static IServiceCollection AddShopClient(this IServiceCollection services)
    {
        services.AddSingleton<ShopStore>();
        services.AddScoped<ShopClient>();
        return services;
    }
}
