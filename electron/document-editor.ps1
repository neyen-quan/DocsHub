param([string]$Action)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$payload = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String([Console]::In.ReadToEnd())) | ConvertFrom-Json

function Start-Editor([string]$Executable, [string]$File) {
    $info = New-Object System.Diagnostics.ProcessStartInfo
    $info.FileName = $Executable
    # Always quote, even for short paths: older Macromedia parsers expect it.
    $info.Arguments = '"' + $File + '"'
    $info.WorkingDirectory = [IO.Path]::GetDirectoryName($File)
    $info.UseShellExecute = $true
    $process = [Diagnostics.Process]::Start($info)
    if ($process) { $process.Dispose() }
}

if ($Action -eq 'paint') {
    $candidates = New-Object 'System.Collections.Generic.List[string]'
    foreach ($base in @($env:SystemRoot, $env:WINDIR)) {
        if ($base) { foreach ($sub in @('Sysnative', 'System32', 'SysWOW64')) { $candidates.Add((Join-Path $base "$sub\mspaint.exe")) } }
    }
    if ($env:LOCALAPPDATA) { $candidates.Add((Join-Path $env:LOCALAPPDATA 'Microsoft\WindowsApps\mspaint.exe')) }
    $command = Get-Command mspaint.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($command) { $candidates.Add($command.Source) }
    foreach ($candidate in @($candidates | Select-Object -Unique)) {
        try { if (Test-Path -LiteralPath $candidate -PathType Leaf) { Start-Editor $candidate ([string]$payload.file); @{ok=$true} | ConvertTo-Json -Compress; exit 0 } } catch {}
    }
    # Current-user Store packages need no administrator permissions.
    $packages = @(Get-AppxPackage -Name Microsoft.Paint -ErrorAction SilentlyContinue) + @(Get-AppxPackage -Name Microsoft.MSPaint -ErrorAction SilentlyContinue)
    foreach ($package in $packages) {
        if (!$package.InstallLocation) { continue }
        foreach ($relative in @('PaintApp\mspaint.exe', 'mspaint.exe')) {
            $candidate = Join-Path $package.InstallLocation $relative
            try { if (Test-Path -LiteralPath $candidate -PathType Leaf) { Start-Editor $candidate ([string]$payload.file); @{ok=$true} | ConvertTo-Json -Compress; exit 0 } } catch {}
        }
    }
    throw 'Windows no pudo iniciar Paint. Comproba que Paint abra desde el menu Inicio; DocsHub no necesita que busques su ejecutable.'
}
if ($Action -eq 'fireworks') {
    $script = [string]$payload.script
    # A registered Fireworks script handler also covers its DDE/single-instance handoff.
    try {
        $key = Get-Item -LiteralPath 'Registry::HKEY_CLASSES_ROOT\.jsf' -ErrorAction Stop
        $class = $key.GetValue('')
        if ($class) {
            $handler = (Get-Item -LiteralPath "Registry::HKEY_CLASSES_ROOT\$class\shell\open\command" -ErrorAction Stop).GetValue('')
            if ($handler -match [regex]::Escape([string]$payload.executable)) {
                $info = New-Object System.Diagnostics.ProcessStartInfo
                $info.FileName = $script
                $info.UseShellExecute = $true
                $process = [Diagnostics.Process]::Start($info)
                if ($process) { $process.Dispose() }
                @{ok=$true} | ConvertTo-Json -Compress
                exit 0
            }
        }
    } catch {}
    # Short names avoid legacy path parsing limitations when Windows provides them.
    try { $fso = New-Object -ComObject Scripting.FileSystemObject; $short = $fso.GetFile($script).ShortPath; if ($short) { $script = $short } } catch {}
    Start-Editor ([string]$payload.executable) $script
    @{ok=$true} | ConvertTo-Json -Compress
    exit 0
}
throw 'Editor desconocido.'
