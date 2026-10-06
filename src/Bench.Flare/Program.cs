using System.Globalization;
using Flare.Abstractions.Tokens;
using Flare.Extensions;
using Microsoft.JSInterop;
using Microsoft.AspNetCore.Components.WebAssembly.Hosting;

// One culture in all five apps, so the typed date and the month names are the same.
CultureInfo.DefaultThreadCurrentCulture = CultureInfo.DefaultThreadCurrentUICulture = CultureInfo.GetCultureInfo("en-US");

var builder = WebAssemblyHostBuilder.CreateDefault(args);
builder.RootComponents.Add<Bench.Flare.BenchPage>("#app");
var registrationMs = Bench.Flare.ThemeSetup.Register(builder.Services);

var host = builder.Build();
await host.Services.GetRequiredService<IJSRuntime>().InvokeVoidAsync("benchAnalytics.recordSetup",
    new { ms = registrationMs });
await host.RunAsync();
