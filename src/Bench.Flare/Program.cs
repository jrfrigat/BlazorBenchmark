using System.Globalization;
using Flare.Abstractions.Tokens;
using Flare.Extensions;
using Flare.Theme.MaterialDesign2;
using Microsoft.AspNetCore.Components.WebAssembly.Hosting;

// One culture in all five apps, so the typed date and the month names are the same.
CultureInfo.DefaultThreadCurrentCulture = CultureInfo.DefaultThreadCurrentUICulture = CultureInfo.GetCultureInfo("en-US");

var builder = WebAssemblyHostBuilder.CreateDefault(args);
builder.RootComponents.Add<Bench.Flare.BenchPage>("#app");
builder.Services.AddFlare(opts =>
{
    opts.DefaultTheme = new MaterialDesign2Theme();
    opts.DefaultPalette = Md2Palettes.Indigo;
    opts.DefaultMode = ThemeMode.Light;
});

await builder.Build().RunAsync();
