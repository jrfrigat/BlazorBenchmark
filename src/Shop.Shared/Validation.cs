using System.ComponentModel.DataAnnotations;

namespace Shop.Shared;

/// <summary>
/// Валидация DataAnnotations на клиенте — те же правила, что на бэкенде.
/// </summary>
public static class ShopValidator
{
    public static bool Validate<T>(T input, out Dictionary<string, string> errors)
    {
        var results = new List<ValidationResult>();
        var ok = Validator.TryValidateObject(input!, new ValidationContext(input!), results, true);
        errors = results
            .Where(r => r.MemberNames?.Any() == true)
            .GroupBy(r => r.MemberNames!.First())
            .ToDictionary(g => g.Key, g => g.First().ErrorMessage ?? "Некорректное значение");
        return ok;
    }
}
