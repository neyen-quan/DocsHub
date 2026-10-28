$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$payload = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String([Console]::In.ReadToEnd())) | ConvertFrom-Json
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public class DocsHubEditorWindow {
    public long Handle; public uint Process; public string Title;
    public delegate bool Callback(IntPtr hwnd, IntPtr data);
    [DllImport("user32.dll")] public static extern bool EnumWindows(Callback callback, IntPtr data);
    [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hwnd);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hwnd);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hwnd);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hwnd, StringBuilder value, int length);
    public static DocsHubEditorWindow[] List() {
        var windows = new List<DocsHubEditorWindow>();
        EnumWindows(delegate(IntPtr hwnd, IntPtr data) {
            if (IsWindowVisible(hwnd)) {
                var text = new StringBuilder(4096); GetWindowText(hwnd, text, text.Capacity);
                uint pid; GetWindowThreadProcessId(hwnd, out pid);
                if (text.Length > 0) windows.Add(new DocsHubEditorWindow {Handle=hwnd.ToInt64(),Process=pid,Title=text.ToString()});
            }
            return true;
        }, IntPtr.Zero);
        return windows.ToArray();
    }
    public static bool StillOpen(long handle, uint process) {
        var hwnd = new IntPtr(handle); uint current;
        GetWindowThreadProcessId(hwnd, out current);
        return current == process && IsWindow(hwnd) && (IsWindowVisible(hwnd) || IsIconic(hwnd));
    }
}
'@
$base = [IO.Path]::GetFileName([string]$payload.file)
$stem = [IO.Path]::GetFileNameWithoutExtension($base)
$pattern = switch ([string]$payload.editor) { 'paint' {'^(mspaint|paint)$'} 'fireworks' {'fireworks'} 'photos' {'^(photos|microsoft\.photos|photossvc|applicationframehost)$'} }
$deadline = [DateTime]::UtcNow.AddSeconds(45)
$tracked = $null
while ([DateTime]::UtcNow -lt $deadline -and !$tracked) {
    $candidates = @([DocsHubEditorWindow]::List() | Where-Object {
        try {
            $process = Get-Process -Id $_.Process -ErrorAction Stop
            $process.ProcessName -match $pattern -and ($process.ProcessName -ne 'ApplicationFrameHost' -or $_.Title -match '(?i)photos|fotos')
        } catch { $false }
    })
    $matched = @($candidates | Where-Object { $_.Title.IndexOf($base, [StringComparison]::OrdinalIgnoreCase) -ge 0 -or ($stem.Length -gt 2 -and $_.Title.IndexOf($stem, [StringComparison]::OrdinalIgnoreCase) -ge 0) })
    if ($matched.Count -eq 1) { $tracked = $matched[0] }
    elseif ($payload.editor -eq 'photos' -and $candidates.Count -eq 1) { $tracked = $candidates[0] }
    if (!$tracked) { Start-Sleep -Milliseconds 400 }
}
if (!$tracked) { @{status='unknown'} | ConvertTo-Json -Compress; exit 0 }
$misses = 0
while ($misses -lt 3) {
    if ([DocsHubEditorWindow]::StillOpen($tracked.Handle, $tracked.Process)) { $misses = 0 } else { $misses++ }
    Start-Sleep -Milliseconds 500
}
@{status='closed'} | ConvertTo-Json -Compress
