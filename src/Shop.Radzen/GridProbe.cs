using Microsoft.AspNetCore.Components.Rendering;
using Radzen;
using Radzen.Blazor;

using Shop.Shared;

namespace ShopRadzen.Pages;

/// <summary>Диагностический компонент: рендерит RadzenDataGrid в try/catch и выводит текст исключения.</summary>
public class GridProbeCore : Microsoft.AspNetCore.Components.ComponentBase
{
    protected override void BuildRenderTree(RenderTreeBuilder builder)
    {
        try
        {
            builder.OpenComponent<RadzenDataGrid<ShowcaseData.DemoProduct>>(0);
            builder.AddAttribute(1, "Data", ShowcaseData.Products);
            builder.AddAttribute(2, "Columns", (Microsoft.AspNetCore.Components.RenderFragment)(cols =>
            {
                cols.OpenComponent<RadzenDataGridColumn<ShowcaseData.DemoProduct>>(0);
                cols.AddAttribute(1, "Property", "Name");
                cols.AddAttribute(2, "Title", "Название");
                cols.CloseComponent();
            }));
            builder.CloseComponent();

            builder.OpenElement(10, "h5");
            builder.AddContent(11, "Грид с Template-колонкой:");
            builder.CloseElement();

            builder.OpenComponent<RadzenDataGrid<ShowcaseData.DemoProduct>>(20);
            builder.AddAttribute(21, "Data", ShowcaseData.Products);
            builder.AddAttribute(22, "Columns", (Microsoft.AspNetCore.Components.RenderFragment)(cols =>
            {
                cols.OpenComponent<RadzenDataGridColumn<ShowcaseData.DemoProduct>>(0);
                cols.AddAttribute(1, "Property", "Name");
                cols.AddAttribute(2, "Title", "Название");
                cols.CloseComponent();

                cols.OpenComponent<RadzenDataGridColumn<ShowcaseData.DemoProduct>>(10);
                cols.AddAttribute(11, "Title", "Остаток");
                cols.AddAttribute(12, "Template", (Microsoft.AspNetCore.Components.RenderFragment<ShowcaseData.DemoProduct>)(p => badge =>
                {
                    badge.OpenComponent<RadzenBadge>(0);
                    badge.AddAttribute(1, "BadgeStyle", BadgeStyle.Success);
                    badge.AddAttribute(2, "IsPill", true);
                    badge.AddAttribute(3, "Text", p.Stock.ToString());
                    badge.CloseComponent();
                }));
                cols.CloseComponent();
            }));
            builder.CloseComponent();
        }
        catch (Exception ex)
        {
            builder.OpenElement(0, "pre");
            builder.AddAttribute(1, "style", "white-space:pre-wrap;color:#b32121;font-size:12px");
            builder.AddContent(2, ex.ToString());
            builder.CloseElement();
        }
    }
}
