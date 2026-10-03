# Publishes the five picker bench apps (src/Bench.*) in Release to artifacts/bench/<library>, each served from
# its own root by scripts/bench-serve.mjs. The bench compares the libraries' date and time pickers; the shop apps
# are not part of it.
#
#   powershell -File scripts/bench-publish.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root 'artifacts/bench'
$libraries = 'Flare', 'MudBlazor', 'Radzen', 'Blazorise', 'FluentUI'

if (Test-Path $out) { Remove-Item $out -Recurse -Force }
foreach ($library in $libraries) {
    Write-Host "Publishing $library..." -ForegroundColor Cyan
    $publish = Join-Path $root "artifacts/bench-publish/$library"
    dotnet publish (Join-Path $root "src/Bench.$library/Bench.$library.csproj") -c Release -o $publish -v q --nologo | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Publishing $library failed" }
    Copy-Item (Join-Path $publish 'wwwroot') (Join-Path $out $library) -Recurse -Force
}
Write-Host "Done: $out" -ForegroundColor Green
