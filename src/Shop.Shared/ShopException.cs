namespace Shop.Shared;

/// <summary>
/// Ошибка бизнес-правила имитируемого бэкенда: раньше приходила как HTTP 400 с телом-словарём,
/// теперь бросается локально. <see cref="Errors"/> — те же пары «поле → сообщение», что отдавал API.
/// </summary>
public class ShopException(string message, IReadOnlyDictionary<string, string>? errors = null) : Exception(message)
{
    public IReadOnlyDictionary<string, string> Errors { get; } = errors ?? new Dictionary<string, string>();

    /// <summary>Собирает исключение из словаря ошибок валидации: сообщение — первое из них.</summary>
    public static ShopException FromErrors(IReadOnlyDictionary<string, string> errors) =>
        new(errors.Values.FirstOrDefault() ?? "Некорректные данные", errors);

    /// <summary>Ошибка по одному полю.</summary>
    public static ShopException ForField(string field, string message) =>
        new(message, new Dictionary<string, string> { [field] = message });
}
