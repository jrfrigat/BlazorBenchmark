using System.Globalization;
using Microsoft.FluentUI.AspNetCore.Components;
using Microsoft.AspNetCore.Components.WebAssembly.Hosting;

// One culture in all five apps, so the typed date and the month names are the same.
CultureInfo.DefaultThreadCurrentCulture = CultureInfo.DefaultThreadCurrentUICulture = CultureInfo.GetCultureInfo("en-US");

var builder = WebAssemblyHostBuilder.CreateDefault(args);
builder.RootComponents.Add<Bench.FluentUI.BenchPage>("#app");
builder.Services.AddFluentUIComponents();

await builder.Build().RunAsync();
