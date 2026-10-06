using System.Diagnostics;
using Flare.Abstractions;
using Flare.Abstractions.Tokens;
using Flare.Extensions;
using Microsoft.Extensions.DependencyInjection;
#if FLUENT_THEME
using Flare.Theme.FluentUI2;
#else
using Flare.Theme.MaterialDesign2;
#endif
#if ALL_THEMES
using Flare.Theme.Aero;
using Flare.Theme.FluentUI2;
using Flare.Theme.LiquidGlass;
using Flare.Theme.MaterialDesign3;
using Flare.Theme.MaterialDesign3Expressive;
using Flare.Theme.VisualStudio;
#endif

namespace Bench.Flare;

// Only this benchmark adapter filters external font assets. Tokens and local assets stay intact.
internal static class ThemeSetup
{
#if FLUENT_THEME
    internal const string Title = "Flare / Fluent UI 2 (one theme)";
    private static ITheme CreateDefault() => new FluentUI2Theme();
#else
    internal const string Title = "Flare / Material Design 2";
    private static ITheme CreateDefault() => new MaterialDesign2Theme();
#endif
    internal static double Register(IServiceCollection services)
    {
        var clock = Stopwatch.StartNew();
        var theme = new LocalTheme(CreateDefault());
        services.AddFlare(options =>
        {
            options.DefaultTheme = theme;
            options.DefaultPaletteId = theme.Id == "md2" ? "md2-indigo" : theme.DefaultPaletteId;
            options.DefaultMode = ThemeMode.Light;
        });
#if ALL_THEMES
        foreach (var extra in new ITheme[] {
            new MaterialDesign3Theme(), new MaterialDesign3ExpressiveTheme(), new FluentUI2Theme(),
            new AeroTheme(), new LiquidGlassTheme(), new VisualStudioTheme() })
            services.AddFlareTheme(new LocalTheme(extra));
#endif
        return clock.Elapsed.TotalMilliseconds;
    }

    private sealed class LocalTheme(ITheme source) : ITheme
    {
        public string Id => source.Id;
        public string DisplayName => source.DisplayName;
        public DesignTokens Design => source.Design;
        public string DefaultPaletteId => source.DefaultPaletteId;
        public IReadOnlyList<string> StyleAssets => source.StyleAssets.Where(href =>
            !Uri.TryCreate(href, UriKind.Absolute, out var uri) || uri.Scheme == "file").ToArray();
        public IReadOnlyList<string> ScriptAssets => source.ScriptAssets;
        public ITheme? Base => source.Base;
        public IReadOnlyList<Palette> Palettes => source.Palettes;
        public IReadOnlyDictionary<string, string>? ExtendedDarkOverride => source.ExtendedDarkOverride;
        public IPaletteGenerator? PaletteGenerator => source.PaletteGenerator;
    }
}
