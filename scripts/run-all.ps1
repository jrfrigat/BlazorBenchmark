# Запускает все три приложения бенчмарка (бэкенд не нужен: данные отдаёт Shop.Shared в браузере).
# Использование: powershell -File scripts/run-all.ps1 [-Build]
param([switch]$Build)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

if ($Build) {
    dotnet build (Join-Path $root 'BlazorBenchmark.slnx') -v q
    if ($LASTEXITCODE -ne 0) { throw 'Сборка не удалась' }
}

$jobs = @(
    @{ Name = 'Shop.Flare';    Project = 'src/Shop.Flare/Shop.Flare.csproj';         Url = 'http://localhost:5201' },
    @{ Name = 'Shop.MudBlazor';Project = 'src/Shop.MudBlazor/Shop.MudBlazor.csproj'; Url = 'http://localhost:5202' },
    @{ Name = 'Shop.Radzen';   Project = 'src/Shop.Radzen/Shop.Radzen.csproj';       Url = 'http://localhost:5203' }
)

foreach ($j in $jobs) {
    Start-Process -FilePath 'dotnet' -ArgumentList @('run', '--project', (Join-Path $root $j.Project), '--no-build') `
        -WindowStyle Normal -PassThru | ForEach-Object { Write-Host "Запущено [$($_.Id)] $($j.Name) -> $($j.Url)" }
    Start-Sleep -Seconds 1
}

Write-Host ''
Write-Host 'Flare:    http://localhost:5201'
Write-Host 'MudBlazor:http://localhost:5202'
Write-Host 'Radzen:   http://localhost:5203'
Write-Host ''
Write-Host 'Остановка: закрыть окна dotnet или выполнить  taskkill /IM dotnet.exe /F'
