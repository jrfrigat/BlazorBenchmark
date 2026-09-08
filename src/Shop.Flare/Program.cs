using Flare.Abstractions.Tokens;
using Flare.Extensions;
using Flare.Theme.MaterialDesign2;
using Microsoft.AspNetCore.Components.Web;
using Microsoft.AspNetCore.Components.WebAssembly.Hosting;
using Shop.Flare;
using Shop.Shared;

var builder = WebAssemblyHostBuilder.CreateDefault(args);
builder.RootComponents.Add<App>("#app");
builder.RootComponents.Add<HeadOutlet>("head::after");

builder.Services.AddFlare(opts =>
{
    opts.DefaultTheme = new MaterialDesign2Theme();
    opts.DefaultPalette = Md2Palettes.Indigo;
    opts.DefaultMode = ThemeMode.Light;
});

builder.Services.AddShopClient(builder.Configuration["ShopApi"] ?? ShopApiDefaults.BaseUrl);
builder.Services.AddScoped<DiagnosticsService>();

await builder.Build().RunAsync();
