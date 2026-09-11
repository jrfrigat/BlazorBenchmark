# Весь сайт бенчмарка одним образом: лендинг в корне и три приложения в подкаталогах
# /flare/, /mudblazor/, /radzen/ — ровно та же раскладка, что публикуется на GitHub Pages
# (см. .github/workflows/pages.yml). Backend не нужен: данные отдаёт Shop.Shared внутри браузера.
#
# Сборка из корня репозитория:
#   docker build -t blazorbenchmark .
#   docker run --rm -p 8080:80 blazorbenchmark

# ── Этап 1: restore по файлам проектов ───────────────────────
# Сначала копируем только *.csproj: слой restore переиспользуется, пока не менялись зависимости.
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /repo

COPY ["src/Shop.Shared/Shop.Shared.csproj", "src/Shop.Shared/"]
COPY ["src/Shop.Flare/Shop.Flare.csproj", "src/Shop.Flare/"]
COPY ["src/Shop.MudBlazor/Shop.MudBlazor.csproj", "src/Shop.MudBlazor/"]
COPY ["src/Shop.Radzen/Shop.Radzen.csproj", "src/Shop.Radzen/"]
COPY ["nuget.config", "./"]
RUN dotnet restore "src/Shop.Flare/Shop.Flare.csproj" \
 && dotnet restore "src/Shop.MudBlazor/Shop.MudBlazor.csproj" \
 && dotnet restore "src/Shop.Radzen/Shop.Radzen.csproj"

# ── Этап 2: публикация трёх приложений в подкаталоги ─────────
COPY . .
COPY scripts/set-base-href.sh /usr/local/bin/set-base-href
RUN chmod +x /usr/local/bin/set-base-href \
 && dotnet publish "src/Shop.Flare/Shop.Flare.csproj"         -c Release -o /site/flare      --no-restore \
 && dotnet publish "src/Shop.MudBlazor/Shop.MudBlazor.csproj" -c Release -o /site/mudblazor  --no-restore \
 && dotnet publish "src/Shop.Radzen/Shop.Radzen.csproj"       -c Release -o /site/radzen     --no-restore \
 && set-base-href /site/flare/wwwroot     /flare/ \
 && set-base-href /site/mudblazor/wwwroot /mudblazor/ \
 && set-base-href /site/radzen/wwwroot    /radzen/

# ── Этап 3: раздача статики ──────────────────────────────────
FROM nginx:alpine AS final
COPY --from=build /site/flare/wwwroot     /usr/share/nginx/html/flare
COPY --from=build /site/mudblazor/wwwroot /usr/share/nginx/html/mudblazor
COPY --from=build /site/radzen/wwwroot    /usr/share/nginx/html/radzen
COPY landing/ /usr/share/nginx/html/
COPY nginx.conf /etc/nginx/nginx.conf
EXPOSE 80
