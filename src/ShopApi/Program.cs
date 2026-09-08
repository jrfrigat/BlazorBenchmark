using System.Collections;
using System.ComponentModel.DataAnnotations;
using Shop.Shared;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddCors(o => o.AddPolicy("all", p => p.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod()));

var app = builder.Build();
app.UseCors("all");

var store = new ShopStore();

app.MapGet("/api/dashboard", () =>
{
    var today = DateTime.Today;
    var liveOrders = store.Orders.Where(o => o.Status != OrderStatus.Cancelled).ToList();

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

    var categoryById = store.Products.ToDictionary(p => p.Id, p => p.Category);
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

    var recent = store.Orders
        .OrderByDescending(o => o.CreatedAt)
        .Take(8)
        .Select(o => new RecentOrder { Id = o.Id, CustomerName = o.CustomerName, Total = o.Total, Status = o.Status, CreatedAt = o.CreatedAt })
        .ToList();

    return Results.Json(new DashboardData
    {
        RevenueToday = liveOrders.Where(o => o.CreatedAt.Date == today).Sum(o => o.Total),
        OrdersToday = liveOrders.Count(o => o.CreatedAt.Date == today),
        ProductsTotal = store.Products.Count,
        LowStockCount = store.Products.Count(p => p.Stock <= 5),
        CustomersTotal = store.Customers.Count,
        UnpaidAmount = liveOrders.Sum(o => Math.Max(0, o.Total - o.Paid)),
        RevenueByDay = byDay,
        SalesByCategory = salesByCategory,
        TopProducts = topProducts,
        RecentOrders = recent,
    });
});

// ----- Товары -----

app.MapGet("/api/products", () => store.Products);

app.MapGet("/api/products/{id:int}", (int id) =>
    store.Products.FirstOrDefault(p => p.Id == id) is { } p ? Results.Ok(p) : Results.NotFound());

app.MapPost("/api/products", (ProductInput input) =>
{
    if (!MiniValidate(input, out var errors)) return Results.BadRequest(errors);

    var product = new Product
    {
        Id = store.NextId(),
        Name = input.Name.Trim(),
        Sku = input.Sku.Trim().ToUpperInvariant(),
        Category = input.Category.Trim(),
        Price = input.Price,
        Stock = input.Stock,
    };
    store.Products.Add(product);
    return Results.Ok(product);
});

app.MapPut("/api/products/{id:int}", (int id, ProductInput input) =>
{
    if (!MiniValidate(input, out var errors)) return Results.BadRequest(errors);

    var product = store.Products.FirstOrDefault(p => p.Id == id);
    if (product is null) return Results.NotFound();

    product.Name = input.Name.Trim();
    product.Sku = input.Sku.Trim().ToUpperInvariant();
    product.Category = input.Category.Trim();
    product.Price = input.Price;
    product.Stock = input.Stock;
    return Results.Ok(product);
});

app.MapDelete("/api/products/{id:int}", (int id) =>
{
    var product = store.Products.FirstOrDefault(p => p.Id == id);
    if (product is null) return Results.NotFound();
    store.Products.Remove(product);
    return Results.Ok();
});

// ----- Клиенты -----

app.MapGet("/api/customers", () => store.Customers.Select(c =>
{
    c.OrdersCount = store.Orders.Count(o => o.CustomerId == c.Id && o.Status != OrderStatus.Cancelled);
    return c;
}).ToList());

app.MapPost("/api/customers", (CustomerInput input) =>
{
    if (!MiniValidate(input, out var errors)) return Results.BadRequest(errors);

    var customer = new Customer
    {
        Id = store.NextId(),
        Name = input.Name.Trim(),
        Phone = input.Phone.Trim(),
        Email = input.Email?.Trim() ?? "",
    };
    store.Customers.Add(customer);
    return Results.Ok(customer);
});

app.MapPut("/api/customers/{id:int}", (int id, CustomerInput input) =>
{
    if (!MiniValidate(input, out var errors)) return Results.BadRequest(errors);

    var customer = store.Customers.FirstOrDefault(c => c.Id == id);
    if (customer is null) return Results.NotFound();

    customer.Name = input.Name.Trim();
    customer.Phone = input.Phone.Trim();
    customer.Email = input.Email?.Trim() ?? "";

    foreach (var order in store.Orders.Where(o => o.CustomerId == id))
        order.CustomerName = customer.Name;
    return Results.Ok(customer);
});

app.MapDelete("/api/customers/{id:int}", (int id) =>
{
    if (store.Orders.Any(o => o.CustomerId == id))
        return Results.BadRequest(new Dictionary<string, string> { [""] = "Нельзя удалить клиента с заказами" });

    var customer = store.Customers.FirstOrDefault(c => c.Id == id);
    if (customer is null) return Results.NotFound();
    store.Customers.Remove(customer);
    return Results.Ok();
});

// ----- Заказы -----

app.MapGet("/api/orders", () =>
{
    foreach (var order in store.Orders)
        order.Paid = store.Payments.Where(p => p.OrderId == order.Id && !p.Refunded).Sum(p => p.Amount);
    return store.Orders.OrderByDescending(o => o.CreatedAt).ThenByDescending(o => o.Id).ToList();
});

app.MapPost("/api/orders", (OrderInput input) =>
{
    if (!MiniValidate(input, out var errors)) return Results.BadRequest(errors);

    var customer = store.Customers.FirstOrDefault(c => c.Id == input.CustomerId);
    if (customer is null) return Results.BadRequest(new Dictionary<string, string> { ["CustomerId"] = "Клиент не найден" });

    var items = new List<OrderItem>();
    foreach (var item in input.Items)
    {
        var product = store.Products.FirstOrDefault(p => p.Id == item.ProductId);
        if (product is null) return Results.BadRequest(new Dictionary<string, string> { ["Items"] = $"Товар {item.ProductId} не найден" });
        if (product.Stock < item.Quantity)
            return Results.BadRequest(new Dictionary<string, string> { ["Items"] = $"«{product.Name}»: в наличии только {product.Stock}" });

        items.Add(new OrderItem { ProductId = product.Id, ProductName = product.Name, UnitPrice = product.Price, Quantity = item.Quantity });
    }

    foreach (var item in items)
    {
        var product = store.Products.First(p => p.Id == item.ProductId);
        product.Stock -= item.Quantity;
    }

    var order = new Order
    {
        Id = store.NextOrderId(),
        CustomerId = customer.Id,
        CustomerName = customer.Name,
        CreatedAt = DateTime.Now,
        Status = OrderStatus.New,
        Items = items,
    };
    store.Orders.Add(order);
    return Results.Ok(order);
});

app.MapPost("/api/orders/{id:int}/status", (int id, StatusInput input) =>
{
    var order = store.Orders.FirstOrDefault(o => o.Id == id);
    if (order is null) return Results.NotFound();

    var allowed = order.Status switch
    {
        OrderStatus.New => (OrderStatus[])[OrderStatus.Processing, OrderStatus.Cancelled],
        OrderStatus.Processing => [OrderStatus.Shipped, OrderStatus.Cancelled],
        OrderStatus.Shipped => [OrderStatus.Completed],
        _ => [],
    };
    if (!allowed.Contains(input.Status))
        return Results.BadRequest(new Dictionary<string, string> { ["Status"] = $"Переход «{ShopLabels.OrderStatusText(order.Status)}» → «{ShopLabels.OrderStatusText(input.Status)}» невозможен" });

    if (input.Status == OrderStatus.Cancelled)
        foreach (var item in order.Items)
        {
            var product = store.Products.FirstOrDefault(p => p.Id == item.ProductId);
            if (product is not null) product.Stock += item.Quantity;
        }

    order.Status = input.Status;
    return Results.Ok(order);
});

// ----- Оплаты -----

app.MapGet("/api/payments", () => store.Payments.OrderByDescending(p => p.PaidAt).ThenByDescending(p => p.Id).ToList());

app.MapPost("/api/payments", (PaymentInput input) =>
{
    if (!MiniValidate(input, out var errors)) return Results.BadRequest(errors);

    var order = store.Orders.FirstOrDefault(o => o.Id == input.OrderId);
    if (order is null) return Results.BadRequest(new Dictionary<string, string> { ["OrderId"] = "Заказ не найден" });
    if (order.Status == OrderStatus.Cancelled)
        return Results.BadRequest(new Dictionary<string, string> { ["OrderId"] = "Заказ отменён" });

    var paid = store.Payments.Where(p => p.OrderId == order.Id && !p.Refunded).Sum(p => p.Amount);
    if (input.Amount > order.Total - paid + 0.001m)
        return Results.BadRequest(new Dictionary<string, string> { ["Amount"] = $"Остаток к оплате: {order.Total - paid:C}" });

    var payment = new Payment
    {
        Id = store.NextId(),
        OrderId = order.Id,
        CustomerName = order.CustomerName,
        Amount = input.Amount,
        Method = input.Method,
        PaidAt = DateTime.Now,
    };
    store.Payments.Add(payment);
    return Results.Ok(payment);
});

app.MapPost("/api/payments/{id:int}/refund", (int id) =>
{
    var payment = store.Payments.FirstOrDefault(p => p.Id == id);
    if (payment is null) return Results.NotFound();
    if (payment.Refunded) return Results.BadRequest(new Dictionary<string, string> { [""] = "Платёж уже возвращён" });

    payment.Refunded = true;
    return Results.Ok(payment);
});

app.Run();

/// <summary>Серверная валидация тех же DataAnnotations, что на клиентах. Ошибки — словарь поле → текст.</summary>
static bool MiniValidate<T>(T input, out Dictionary<string, string> errors)
{
    var results = new List<ValidationResult>();
    var ok = Validator.TryValidateObject(input!, new ValidationContext(input!), results, true);
    errors = results
        .Where(r => r.MemberNames?.Any() == true)
        .GroupBy(r => r.MemberNames!.First())
        .ToDictionary(g => g.Key, g => g.First().ErrorMessage ?? "Некорректное значение");
    return ok;
}

/// <summary>Хранилище в памяти с детерминированным сидом (Random с фиксированным зерном).</summary>
public class ShopStore
{
    private int _id;
    private int _orderId = 1000;

    public List<Product> Products { get; } = [];
    public List<Customer> Customers { get; } = [];
    public List<Order> Orders { get; } = [];
    public List<Payment> Payments { get; } = [];

    public int NextId() => Interlocked.Increment(ref _id);
    public int NextOrderId() => Interlocked.Increment(ref _orderId);

    public ShopStore()
    {
        var rnd = new Random(20260908);

        var catalog = new (string name, string category, decimal min, decimal max)[]
        {
            ("Ноутбук Pro 14", "Ноутбуки", 89990, 149990),
            ("Ноутбук Air 13", "Ноутбуки", 64990, 89990),
            ("Ультрабук Slim 15", "Ноутбуки", 74990, 99990),
            ("Смартфон Nova 12", "Смартфоны", 39990, 59990),
            ("Смартфон Nova 12 Max", "Смартфоны", 54990, 79990),
            ("Смартфон Pixel Lite", "Смартфоны", 24990, 34990),
            ("Наушники AirSound", "Аудио", 9990, 17990),
            ("Наушники BassMax XL", "Аудио", 6990, 12990),
            ("Колонка RoomBeat", "Аудио", 5990, 11990),
            ("Монитор View 27\"", "Мониторы", 19990, 34990),
            ("Монитор UltraWide 34\"", "Мониторы", 44990, 69990),
            ("Монитор Office 24\"", "Мониторы", 12990, 18990),
            ("Клавиатура TypeMaster", "Аксессуары", 4990, 9990),
            ("Мышь GlidePro", "Аксессуары", 2990, 5990),
            ("Док-станция Hub 8-в-1", "Аксессуары", 6990, 10990),
            ("SSD NVMe 1 ТБ", "Комплектующие", 8990, 12990),
            ("SSD NVMe 2 ТБ", "Комплектующие", 14990, 19990),
            ("Оперативная память 16 ГБ", "Комплектующие", 5990, 8990),
            ("Веб-камера StreamCam", "Аксессуары", 7990, 11990),
            ("Принтер LaserJet Home", "Печать", 13990, 19990),
            ("МФУ OfficeCenter", "Печать", 21990, 32990),
            ("Роутер WiFi 6 Mesh", "Сеть", 8990, 14990),
            ("Коммутатор Gigabit 8p", "Сеть", 3990, 6990),
            ("ИБП PowerGuard 1000", "Сеть", 9990, 13990),
        };

        foreach (var (name, category, min, max) in catalog)
        {
            Products.Add(new Product
            {
                Id = NextId(),
                Name = name,
                Sku = "SKU-" + Products.Count.ToString("000"),
                Category = category,
                Price = Math.Round((min + (decimal)rnd.NextDouble() * (max - min)) / 10) * 10 - 0.1m,
                Stock = rnd.Next(0, 60),
            });
        }
        // Несколько позиций с низким остатком — для бейджа дефицита
        Products[2].Stock = 3;
        Products[7].Stock = 2;
        Products[15].Stock = 5;

        var people = new (string name, string phone, string email)[]
        {
            ("Иванов Алексей", "+7 912 345-67-01", "ivanov@mail.ru"),
            ("Петрова Мария", "+7 912 345-67-02", "petrova@gmail.com"),
            ("Сидоров Дмитрий", "+7 912 345-67-03", "sidorov@yandex.ru"),
            ("Кузнецова Анна", "+7 912 345-67-04", "kuznetsova@mail.ru"),
            ("Смирнов Сергей", "+7 912 345-67-05", "smirnov@outlook.com"),
            ("Волкова Елена", "+7 912 345-67-06", "volkova@gmail.com"),
            ("Попов Андрей", "+7 912 345-67-07", "popov@mail.ru"),
            ("Соколова Ольга", "+7 912 345-67-08", "sokolova@yandex.ru"),
            ("Лебедев Игорь", "+7 912 345-67-09", "lebedev@gmail.com"),
            ("Новикова Татьяна", "+7 912 345-67-10", "novikova@mail.ru"),
            ("Морозов Павел", "+7 912 345-67-11", "morozov@list.ru"),
            ("Васильева Наталья", "+7 912 345-67-12", "vasilyeva@gmail.com"),
        };
        foreach (var (name, phone, email) in people)
            Customers.Add(new Customer { Id = NextId(), Name = name, Phone = phone, Email = email });

        // Заказы за последние 30 дней
        for (var day = 29; day >= 0; day--)
        {
            var ordersToday = rnd.Next(1, 5);
            for (var n = 0; n < ordersToday; n++)
            {
                var customer = Customers[rnd.Next(Customers.Count)];
                var itemsCount = rnd.Next(1, 4);
                var items = new List<OrderItem>();
                for (var i = 0; i < itemsCount; i++)
                {
                    var product = Products[rnd.Next(Products.Count)];
                    if (items.Any(x => x.ProductId == product.Id)) continue;
                    items.Add(new OrderItem { ProductId = product.Id, ProductName = product.Name, UnitPrice = product.Price, Quantity = rnd.Next(1, 4) });
                }
                if (items.Count == 0) continue;

                var createdAt = DateTime.Now.AddDays(-day).AddHours(-rnd.Next(0, 10)).AddMinutes(-rnd.Next(0, 59));
                var status = day switch
                {
                    0 => rnd.Next(100) < 70 ? OrderStatus.New : OrderStatus.Processing,
                    1 => rnd.Next(100) < 50 ? OrderStatus.Processing : OrderStatus.New,
                    >= 2 and <= 4 => (OrderStatus)(rnd.Next(100) / 34), // New / Processing / Shipped
                    _ => rnd.Next(100) < 85 ? OrderStatus.Completed : OrderStatus.Cancelled,
                };

                var order = new Order
                {
                    Id = NextOrderId(),
                    CustomerId = customer.Id,
                    CustomerName = customer.Name,
                    CreatedAt = createdAt,
                    Status = status,
                    Items = items,
                };
                Orders.Add(order);

                if (status is OrderStatus.Completed or OrderStatus.Shipped && rnd.Next(100) < 85)
                {
                    var partial = rnd.Next(100) < 20;
                    Payments.Add(new Payment
                    {
                        Id = NextId(),
                        OrderId = order.Id,
                        CustomerName = customer.Name,
                        Amount = partial ? Math.Round(order.Total / 2, 2) : order.Total,
                        Method = (PaymentMethod)rnd.Next(3),
                        PaidAt = createdAt.AddMinutes(rnd.Next(5, 240)),
                    });
                }
            }
        }
    }
}
