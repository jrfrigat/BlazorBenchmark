# Собирает сайт бенчмарка локально — ровно так же, как его собирают GitHub Pages и Docker:
# лендинг в корне, три приложения в подкаталогах /flare/, /mudblazor/, /radzen/.
# Нужен, чтобы проверить публикацию до пуша: локально видно и базовый путь, и работу прямых ссылок.
#
#   powershell -File scripts/publish-site.ps1 [-BasePath /BlazorBenchmark] [-Serve]
param(
    # Путь, по которому сайт будет открыт. Для GitHub Pages это "/<репозиторий>", для Docker — "".
    [string]$BasePath = '',
    # Поднять локальный сервер на http://localhost:8080 после сборки.
    [switch]$Serve
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$site = Join-Path $root 'artifacts/site'
$publish = Join-Path $root 'artifacts/publish-site'

$apps = @(
    @{ Name = 'flare';     Project = 'src/Shop.Flare/Shop.Flare.csproj' },
    @{ Name = 'mudblazor'; Project = 'src/Shop.MudBlazor/Shop.MudBlazor.csproj' },
    @{ Name = 'radzen';    Project = 'src/Shop.Radzen/Shop.Radzen.csproj' }
)

if (Test-Path $site) { Remove-Item $site -Recurse -Force }
New-Item -ItemType Directory -Force -Path $site | Out-Null
Copy-Item (Join-Path $root 'landing/*') $site -Recurse -Force

$base = $BasePath.TrimEnd('/')

foreach ($app in $apps) {
    Write-Host "Публикация $($app.Name)…" -ForegroundColor Cyan
    $out = Join-Path $publish $app.Name
    dotnet publish (Join-Path $root $app.Project) -c Release -o $out -v q --nologo | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Публикация $($app.Name) не удалась" }

    $target = Join-Path $site $app.Name
    Copy-Item (Join-Path $out 'wwwroot') $target -Recurse -Force

    # Базовый путь правим и в index.html, и в service-worker.js: сервис-воркер с чужим base
    # закэширует ресурсы другого приложения, и после перезагрузки страница останется пустой.
    $href = "$base/$($app.Name)/"
    $index = Join-Path $target 'index.html'
    (Get-Content $index -Raw) -replace '<base href="[^"]*"', "<base href=`"$href`"" |
        Set-Content $index -NoNewline -Encoding UTF8

    $worker = Join-Path $target 'service-worker.js'
    if (Test-Path $worker) {
        (Get-Content $worker -Raw) -replace 'const base = "[^"]*";', "const base = `"$href`";" |
            Set-Content $worker -NoNewline -Encoding UTF8
    }

    # Копия index.html на случай хостинга, который ищет 404.html рядом со страницей.
    # GitHub Pages смотрит только корневой 404.html — его даёт landing/404.html.
    Copy-Item $index (Join-Path $target '404.html') -Force
}

# Корневой 404.html приезжает из landing/: именно он разбирает прямые ссылки внутрь приложений,
# а ссылка «На главную» в нём считается от <base>, поэтому базовый путь правим и здесь.
$notFound = Join-Path $site '404.html'
(Get-Content $notFound -Raw) -replace '<base href="[^"]*"', "<base href=`"$base/`"" |
    Set-Content $notFound -NoNewline -Encoding UTF8

# Без .nojekyll GitHub Pages выбрасывает каталоги _framework и _content.
New-Item -ItemType File -Force -Path (Join-Path $site '.nojekyll') | Out-Null

$total = (Get-ChildItem $site -Recurse -File | Measure-Object Length -Sum).Sum
Write-Host ''
Write-Host ("Сайт собран: {0} ({1:N1} МБ)" -f $site, ($total / 1MB))

if ($Serve) {
    if (-not (Get-Command dotnet-serve -ErrorAction SilentlyContinue)) {
        Write-Host 'Нужен dotnet-serve: dotnet tool install -g dotnet-serve' -ForegroundColor Yellow
        return
    }
    Write-Host 'Сервер: http://localhost:8080 (Ctrl+C — остановить)' -ForegroundColor Green
    dotnet serve --directory $site --port 8080
}
