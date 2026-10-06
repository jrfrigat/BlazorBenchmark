# Fresh controlled WASM publications. No AOT; trimming and compression match across variants.
param([string]$Output = 'artifacts/bench-compare')
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$out = [IO.Path]::GetFullPath((Join-Path $root $Output))
if (-not $out.StartsWith($root + [IO.Path]::DirectorySeparatorChar)) { throw 'Output must be inside this repository' }
if (Test-Path $out) { throw 'Use a fresh Output directory to prevent stale published assets' }
[IO.Directory]::CreateDirectory($out) | Out-Null
$variants = @(
    @{Name='Flare';Library='Flare';Theme='Md2';Family='Material'},
    @{Name='FlareAll';Library='Flare';Theme='All';Family='Material'},
    @{Name='FlareFluent';Library='Flare';Theme='Fluent2';Family='Fluent'},
    @{Name='MudBlazor';Library='MudBlazor';Theme='';Family='Material'},
    @{Name='Radzen';Library='Radzen';Theme='';Family='Material'},
    @{Name='Blazorise';Library='Blazorise';Theme='';Family='Bootstrap'},
    @{Name='FluentUI';Library='FluentUI';Theme='';Family='Fluent'}
)
$manifest = @{
    CreatedAt=(Get-Date).ToUniversalTime().ToString('o')
    BenchmarkSha=(git -C $root rev-parse HEAD)
    FlareSha=(git -C (Join-Path $root '../Flare') rev-parse HEAD)
    BenchmarkDirty=@(git -C $root status --short)
    Framework='net10.0';Configuration='Release';Trimmed=$true;Aot=$false;DelayMs=40
    FontPolicy='System Arial, no remote fonts; provider font assets filtered in benchmark adapter'
    Runtime=(dotnet --version);Variants=@()
}
foreach ($variant in $variants) {
    $name=$variant.Name
    $project=Join-Path $root "src/Bench.$($variant.Library)/Bench.$($variant.Library).csproj"
    $publish=Join-Path $out "$name/publish"
    $arguments=@('publish',$project,'-c','Release','-f','net10.0','-o',$publish,'--nologo',
        '-p:FlareLibTargetFrameworks=net10.0')
    if ($variant.Theme) { $arguments += "-p:ThemeSet=$($variant.Theme)" }
    Write-Host "Publishing $name..."
    & dotnet @arguments *> (Join-Path $out "$name.log")
    if ($LASTEXITCODE -ne 0) { throw "Publishing $name failed; see $out/$name.log" }
    $www=Join-Path $publish 'wwwroot'
    if ($name -eq 'FlareFluent') {
        $html=Join-Path $www 'index.html'
        $text=[IO.File]::ReadAllText($html).Replace('Flare.Theme.MaterialDesign2/css','Flare.Theme.FluentUI2/css')
        $text=$text.Replace('data-default-theme="md2"','data-default-theme="fluent2"')
        $text=$text.Replace('data-default-palette="md2-indigo"','data-default-palette="fluent-blue"')
        [IO.File]::WriteAllText($html,$text)
        # Modified HTML is served uncompressed; avoid stale compressed copies.
        foreach ($suffix in '.br','.gz') {
            $compressed=$html+$suffix
            if (Test-Path $compressed) { Remove-Item -LiteralPath $compressed }
        }
    }
    $assets=@(Get-ChildItem $www -File -Recurse | Where-Object { $_.Extension -ne '.br' -and $_.Extension -ne '.gz' } |
        ForEach-Object { @{Path=$_.FullName.Substring($www.Length+1).Replace('\','/');Bytes=$_.Length;
            Sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash} })
    $variant.Assets=$assets
    $variant.PackageReferences=@(([xml](Get-Content $project -Raw)).Project.ItemGroup.PackageReference |
        ForEach-Object { @{Name=$_.Include;Version=$_.Version} })
    $manifest.Variants += $variant
}
$manifest | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $out 'manifest.json') -Encoding utf8
Write-Host "Published controlled comparison: $out"
