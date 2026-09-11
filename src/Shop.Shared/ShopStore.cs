namespace Shop.Shared;

/// <summary>
/// Имитация бэкенда: данные магазина в памяти браузера с детерминированным сидом
/// (Random с фиксированным зерном — все три приложения стартуют с одинаковыми данными).
/// Живёт один экземпляр на приложение; изменения теряются при перезагрузке вкладки.
/// </summary>
public sealed class ShopStore
{
    private int _id;
    private int _orderId = 1000;

    public List<Product> Products { get; } = [];
    public List<Customer> Customers { get; } = [];
    public List<Order> Orders { get; } = [];
    public List<Payment> Payments { get; } = [];

    /// <summary>
    /// Искусственная задержка «сети» перед каждым вызовом <see cref="ShopClient"/>.
    /// По умолчанию отключена: бенчмарк меряет отрисовку компонентов, а не ожидание.
    /// </summary>
    public TimeSpan Latency { get; set; } = TimeSpan.Zero;

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
