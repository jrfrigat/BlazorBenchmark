# Публикует все три фронтенда в Release и снимает размеры PWA:
# полный объём публикации, полезная нагрузка WASM (dll), статические ресурсы фреймворка (_content/*),
# а также gzip-размеры ключевых файлов. Отчёт: artifacts/size-report.md + artifacts/publish/<app>.
param([switch]$KeepPublish)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $root 'artifacts'
$pubRoot = Join-Path $outDir 'publish'
New-Item -ItemType Directory -Force -Path $pubRoot | Out-Null

$apps = @(
    @{ Name = 'Flare';     Project = 'src/Shop.Flare/Shop.Flare.csproj';         ContentDir = '_content/Flare.Components' },
    @{ Name = 'MudBlazor'; Project = 'src/Shop.MudBlazor/Shop.MudBlazor.csproj'; ContentDir = '_content/MudBlazor' },
    @{ Name = 'Radzen';    Project = 'src/Shop.Radzen/Shop.Radzen.csproj';       ContentDir = '_content/Radzen.Blazor' }
)

function Format-KB([long]$bytes) { '{0:N0} КБ' -f ($bytes / 1KB) }

function Get-DirSize([string]$path) {
    if (-not (Test-Path $path)) { return 0 }
    (Get-ChildItem $path -Recurse -File | Measure-Object Length -Sum).Sum
}

function Get-GZipSize([string]$path) {
    if (-not (Test-Path $path)) { return 0 }
    $ms = New-Object System.IO.MemoryStream
    $in = [System.IO.File]::OpenRead($path)
    try {
        $gz = New-Object System.IO.Compression.GZipStream($ms, [System.IO.Compression.CompressionLevel]::Optimal, $true)
        $in.CopyTo($gz); $gz.Close()
        return $ms.Length
    } finally { $in.Dispose(); $ms.Dispose() }
}

$rows = [System.Collections.Generic.List[object]]::new()

foreach ($app in $apps) {
    $project = Join-Path $root $app.Project
    $pub = Join-Path $pubRoot $app.Name
    Write-Host "Публикация $($app.Name)…" -ForegroundColor Cyan
    dotnet publish $project -c Release -o $pub -v q --nologo | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Публикация $($app.Name) не удалась" }

    $total = Get-DirSize $pub
    $wasm = Get-DirSize (Join-Path $pub '_framework')
    $content = Get-DirSize (Join-Path $pub '_content')
    $frameworkAssets = Get-DirSize (Join-Path $pub $app.ContentDir)

    $appDll = Get-ChildItem (Join-Path $pub '_framework') -Filter 'Shop.*.dll' -Recurse | Sort-Object Length -Descending | Select-Object -First 1
    $appDllGz = if ($appDll) { Get-GZipSize $appDll.FullName } else { 0 }

    $css = Get-ChildItem (Join-Path $pub $app.ContentDir) -Filter '*.css' -Recurse | Sort-Object Length -Descending | Select-Object -First 1
    $cssGz = if ($css) { Get-GZipSize $css.FullName } else { 0 }

    $rows.Add([pscustomobject]@{
        'Приложение'          = $app.Name
        'Всё, publish'        = Format-KB $total
        '_framework (WASM)'   = Format-KB $wasm
        '_framework gzip'     = Format-KB ((Get-ChildItem (Join-Path $pub '_framework') -Filter '*.wasm' -Recurse | Measure-Object Length -Sum).Sum)
        '_content (все паки)' = Format-KB $content
        'CSS фреймворка'      = if ($css) { "$($css.Name), $(Format-KB $css.Length) (gzip $(Format-KB $cssGz))" } else { '—' }
        'App DLL'             = if ($appDll) { "$($appDll.Name), $(Format-KB $appDll.Length) (gzip $(Format-KB $appDllGz))" } else { '—' }
    })

    if (-not $KeepPublish) { Remove-Item $pub -Recurse -Force }
}

$report = Join-Path $outDir 'size-report.md'
$header = "# Размер PWA — сравнение (Release, без trim/AOT)`n`nДата: $(Get-Date -Format 'yyyy-MM-dd HH:mm')`n`n"
$table = ($rows | Format-Table -AutoSize | Out-String -Width 400)
$rows | Export-Csv -Path (Join-Path $outDir 'size-report.csv') -NoTypeInformation -Encoding UTF8
$header + '```' + "`n" + $table + '```' + "`n" + "Детали по файлам: artifacts/size-report.csv; публикации: artifacts/publish/ (с -KeepPublish)`n" | Set-Content -Path $report -Encoding UTF8

Write-Host ''
Write-Host $table
Write-Host "Отчёт: $report"
