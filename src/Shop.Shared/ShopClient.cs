using System.Net.Http.Json;
using Microsoft.Extensions.DependencyInjection;

namespace Shop.Shared;

public static class ShopApiDefaults
{
    /// <summary>Адрес бэкенда по умолчанию (переопределяется конфигурацией "ShopApi").</summary>
    public const string BaseUrl = "http://localhost:5100";
}

/// <summary>
/// Единый API-клиент для всех трёх фронтендов: одна и та же бизнес-логика обмена с бэкендом,
/// фронтенды отличаются только UI-компонентами.
/// </summary>
public class ShopClient(HttpClient http)
{
    private readonly HttpClient _http = http;

    // ----- Дашборд -----

    public Task<DashboardData?> GetDashboardAsync() =>
        _http.GetFromJsonAsync<DashboardData>("api/dashboard");

    // ----- Товары -----

    public Task<List<Product>?> GetProductsAsync() =>
        _http.GetFromJsonAsync<List<Product>>("api/products");

    public Task<Product?> GetProductAsync(int id) =>
        _http.GetFromJsonAsync<Product>($"api/products/{id}");

    public async Task<Product?> CreateProductAsync(ProductInput input)
    {
        var resp = await _http.PostAsJsonAsync("api/products", input);
        resp.EnsureSuccessStatusCode();
        return await resp.Content.ReadFromJsonAsync<Product>();
    }

    public async Task<Product?> UpdateProductAsync(int id, ProductInput input)
    {
        var resp = await _http.PutAsJsonAsync($"api/products/{id}", input);
        resp.EnsureSuccessStatusCode();
        return await resp.Content.ReadFromJsonAsync<Product>();
    }

    public Task DeleteProductAsync(int id) =>
        _http.DeleteAsync($"api/products/{id}");

    // ----- Клиенты -----

    public Task<List<Customer>?> GetCustomersAsync() =>
        _http.GetFromJsonAsync<List<Customer>>("api/customers");

    public async Task<Customer?> CreateCustomerAsync(CustomerInput input)
    {
        var resp = await _http.PostAsJsonAsync("api/customers", input);
        resp.EnsureSuccessStatusCode();
        return await resp.Content.ReadFromJsonAsync<Customer>();
    }

    public async Task<Customer?> UpdateCustomerAsync(int id, CustomerInput input)
    {
        var resp = await _http.PutAsJsonAsync($"api/customers/{id}", input);
        resp.EnsureSuccessStatusCode();
        return await resp.Content.ReadFromJsonAsync<Customer>();
    }

    public Task DeleteCustomerAsync(int id) =>
        _http.DeleteAsync($"api/customers/{id}");

    // ----- Заказы -----

    public Task<List<Order>?> GetOrdersAsync() =>
        _http.GetFromJsonAsync<List<Order>>("api/orders");

    public async Task<Order?> CreateOrderAsync(OrderInput input)
    {
        var resp = await _http.PostAsJsonAsync("api/orders", input);
        resp.EnsureSuccessStatusCode();
        return await resp.Content.ReadFromJsonAsync<Order>();
    }

    public async Task<Order?> SetOrderStatusAsync(int id, OrderStatus status)
    {
        var resp = await _http.PostAsJsonAsync($"api/orders/{id}/status", new StatusInput { Status = status });
        resp.EnsureSuccessStatusCode();
        return await resp.Content.ReadFromJsonAsync<Order>();
    }

    // ----- Оплаты -----

    public Task<List<Payment>?> GetPaymentsAsync() =>
        _http.GetFromJsonAsync<List<Payment>>("api/payments");

    public async Task<Payment?> CreatePaymentAsync(PaymentInput input)
    {
        var resp = await _http.PostAsJsonAsync("api/payments", input);
        resp.EnsureSuccessStatusCode();
        return await resp.Content.ReadFromJsonAsync<Payment>();
    }

    public async Task RefundPaymentAsync(int id)
    {
        var resp = await _http.PostAsync($"api/payments/{id}/refund", null);
        resp.EnsureSuccessStatusCode();
    }
}

public static class ShopClientServiceCollectionExtensions
{
    /// <summary>Регистрирует HttpClient с адресом бэкенда и типизированный ShopClient.</summary>
    public static IServiceCollection AddShopClient(this IServiceCollection services, string baseUrl)
    {
        services.AddScoped(_ => new HttpClient { BaseAddress = new Uri(baseUrl) });
        services.AddScoped<ShopClient>();
        return services;
    }
}
