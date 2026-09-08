using Microsoft.AspNetCore.Components.Web;
using Microsoft.AspNetCore.Components.WebAssembly.Hosting;
using MudBlazor.Services;
using ShopMudBlazor;
using Shop.Shared;

var builder = WebAssemblyHostBuilder.CreateDefault(args);
builder.RootComponents.Add<App>("#app");
builder.RootComponents.Add<HeadOutlet>("head::after");

builder.Services.AddMudServices();
builder.Services.AddShopClient(builder.Configuration["ShopApi"] ?? ShopApiDefaults.BaseUrl);
builder.Services.AddScoped<DiagnosticsService>();

await builder.Build().RunAsync();
