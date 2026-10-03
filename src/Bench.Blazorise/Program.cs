using System.Globalization;
using Blazorise;
using Blazorise.Bootstrap5;
using Blazorise.Icons.FontAwesome;
using Microsoft.AspNetCore.Components.WebAssembly.Hosting;

// One culture in all five apps, so the typed date and the month names are the same.
CultureInfo.DefaultThreadCurrentCulture = CultureInfo.DefaultThreadCurrentUICulture = CultureInfo.GetCultureInfo("en-US");

var builder = WebAssemblyHostBuilder.CreateDefault(args);
builder.RootComponents.Add<Bench.Blazorise.BenchPage>("#app");
builder.Services.AddBlazorise().AddBootstrap5Providers().AddFontAwesomeIcons();

await builder.Build().RunAsync();
