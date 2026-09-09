$ErrorActionPreference = 'Stop'

$srcPath = Join-Path $PSScriptRoot 'src'

if (-not (Test-Path -LiteralPath $srcPath -PathType Container)) {
    throw "Каталог src не найден: $srcPath"
}

$projectDirectories = Get-ChildItem -LiteralPath $srcPath -Directory

foreach ($projectDirectory in $projectDirectories) {
    foreach ($buildDirectoryName in @('bin', 'obj')) {
        $buildDirectory = Join-Path $projectDirectory.FullName $buildDirectoryName

        if (Test-Path -LiteralPath $buildDirectory -PathType Container) {
            Remove-Item -LiteralPath $buildDirectory -Recurse -Force
            Write-Host "Удалён: $buildDirectory"
        }
    }
}

Write-Host 'Очистка завершена.'
