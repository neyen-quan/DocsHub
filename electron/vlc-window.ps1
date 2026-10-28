param([string]$Action)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$payload = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String([Console]::In.ReadToEnd())) | ConvertFrom-Json
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class DocsHubVlcWindow {
    public delegate bool Callback(IntPtr window, IntPtr data);
    [DllImport("user32.dll")] static extern bool EnumWindows(Callback callback, IntPtr data);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr window, StringBuilder text, int length);
    [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr window, int command);
    [DllImport("user32.dll", SetLastError=true)] public static extern bool SetWindowPos(IntPtr window, IntPtr after, int x, int y, int width, int height, uint flags);
    public static IntPtr Find(uint process) {
        IntPtr found = IntPtr.Zero;
        EnumWindows(delegate(IntPtr window, IntPtr data) {
            uint owner; GetWindowThreadProcessId(window, out owner);
            if (owner == process && IsWindowVisible(window)) {
                var text = new StringBuilder(2048); GetWindowText(window, text, text.Capacity);
                if (text.ToString().IndexOf("VLC", StringComparison.OrdinalIgnoreCase) >= 0) { found=window; return false; }
            }
            return true;
        }, IntPtr.Zero);
        return found;
    }
}
'@
# Use Windows monitor coordinates in physical pixels, including mixed-DPI monitors.
try { [void][DocsHubVlcWindow]::SetThreadDpiAwarenessContext([IntPtr](-4)) } catch {}
Add-Type -AssemblyName System.Windows.Forms
$screens = @([Windows.Forms.Screen]::AllScreens | Sort-Object { $_.Bounds.X + $_.Bounds.Width / 2 })
if ($screens.Count % 2 -eq 1) { $display = $screens[[int][Math]::Floor($screens.Count / 2)] }
else { $display = [Windows.Forms.Screen]::PrimaryScreen }
$area = $display.WorkingArea
$width = [Math]::Max(1, [int][Math]::Round($area.Width * .75))
$height = [Math]::Max(1, [int][Math]::Round($area.Height * .75))
$x = $area.X + [int][Math]::Round(($area.Width - $width) / 2)
$y = $area.Y + [int][Math]::Round(($area.Height - $height) / 2)
$deadline = [DateTime]::UtcNow.AddSeconds(15)
$window = [IntPtr]::Zero
while ($window -eq [IntPtr]::Zero -and [DateTime]::UtcNow -lt $deadline) {
    if (!(Get-Process -Id ([int]$payload.processId) -ErrorAction SilentlyContinue)) { throw 'VLC se cerro antes de poder ubicar su ventana.' }
    $window = [DocsHubVlcWindow]::Find([uint32]$payload.processId)
    if ($window -eq [IntPtr]::Zero) { Start-Sleep -Milliseconds 150 }
}
if ($window -eq [IntPtr]::Zero) { throw 'No se encontro la ventana de VLC para ubicarla en el monitor central.' }
[void][DocsHubVlcWindow]::ShowWindow($window,9)
if (![DocsHubVlcWindow]::SetWindowPos($window,[IntPtr]::Zero,$x,$y,$width,$height,0x0044)) { throw 'Windows no permitio ubicar la ventana de VLC.' }
@{ok=$true;x=$x;y=$y;width=$width;height=$height} | ConvertTo-Json -Compress
