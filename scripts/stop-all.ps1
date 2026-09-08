# Останавливает все процессы бенчмарка: по именам приложений и по владельцам портов
# (dotnet-хосты WASM-приложений не всегда называются как проект, поэтому порт — надёжнее).
$ports = 5100, 5201, 5202, 5203

foreach ($p in $ports) {
    Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique |
        ForEach-Object {
            $proc = Get-Process -Id $_ -ErrorAction SilentlyContinue
            if ($proc -and $proc.ProcessName -notin @('System', 'Idle')) {
                Write-Host "Остановлено [$($_)] $($proc.ProcessName) (порт $p)"
                Stop-Process -Id $_ -Force
            }
        }
}

foreach ($n in 'ShopApi', 'Shop.Flare', 'Shop.MudBlazor', 'Shop.Radzen') {
    Get-Process -Name $n -ErrorAction SilentlyContinue | Stop-Process -Force
}
