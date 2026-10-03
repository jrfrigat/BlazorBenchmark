using System.Globalization;
using MudBlazor.Services;
using Microsoft.AspNetCore.Components.WebAssembly.Hosting;

// One culture in all five apps, so the typed date and the month names are the same.
CultureInfo.DefaultThreadCurrentCulture = CultureInfo.DefaultThreadCurrentUICulture = CultureInfo.GetCultureInfo("en-US");

var builder = WebAssemblyHostBuilder.CreateDefault(args);
builder.RootComponents.Add<Bench.MudBlazor.BenchPage>("#app");
builder.Services.AddMudServices();

await builder.Build().RunAsync();
