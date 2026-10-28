param([string]$Action)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$payload = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String([Console]::In.ReadToEnd())) | ConvertFrom-Json
$file = [string]$payload.file
if (!(Test-Path -LiteralPath $file -PathType Leaf)) { throw 'El video ya no esta disponible.' }

# Invoke exactly the registered Explorer action when Windows exposes it here.
try {
    $shell = New-Object -ComObject Shell.Application
    $folder = $shell.Namespace([IO.Path]::GetDirectoryName($file))
    $item = $folder.ParseName([IO.Path]::GetFileName($file))
    foreach ($verb in $item.Verbs()) {
        $name = ([string]$verb.Name).Replace('&','')
        if ($name -match '(?i)clipchamp') {
            $verb.DoIt()
            @{ok=$true;method='explorer'} | ConvertTo-Json -Compress
            exit 0
        }
    }
} catch {}

# Packaged context-menu actions are not always listed by Shell.Application.
# Activate Clipchamp's registered file contract, passing the video itself.
$packages = @(Get-AppxPackage -Name '*Clipchamp*' -ErrorAction SilentlyContinue)
if (!$packages.Count) { throw 'No se encontro Clipchamp instalado para este usuario. Abri Clipchamp desde Inicio para comprobar su instalacion.' }
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class DocsHubClipchamp {
    [ComImport, Guid("2e941141-7f97-4756-ba1d-9decde894a3d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IActivationManager {
        [PreserveSig] int ActivateApplication([MarshalAs(UnmanagedType.LPWStr)] string app, [MarshalAs(UnmanagedType.LPWStr)] string args, uint options, out uint pid);
        [PreserveSig] int ActivateForFile([MarshalAs(UnmanagedType.LPWStr)] string app, IntPtr items, [MarshalAs(UnmanagedType.LPWStr)] string verb, out uint pid);
        [PreserveSig] int ActivateForProtocol([MarshalAs(UnmanagedType.LPWStr)] string app, IntPtr items, out uint pid);
    }
    [DllImport("shell32.dll", CharSet=CharSet.Unicode, PreserveSig=true)]
    static extern int SHCreateItemFromParsingName(string file, IntPtr context, ref Guid iid, out IntPtr item);
    [DllImport("shell32.dll", PreserveSig=true)]
    static extern int SHCreateShellItemArrayFromShellItem(IntPtr item, ref Guid iid, out IntPtr items);
    public static uint Open(string app, string file, string verb) {
        IntPtr item = IntPtr.Zero, items = IntPtr.Zero; object manager = null;
        try {
            var itemId = new Guid("43826d1e-e718-42ee-bc55-a1e261c37bfe");
            Marshal.ThrowExceptionForHR(SHCreateItemFromParsingName(file, IntPtr.Zero, ref itemId, out item));
            var arrayId = new Guid("b63ea76d-1f85-456f-a19c-48159efa858b");
            Marshal.ThrowExceptionForHR(SHCreateShellItemArrayFromShellItem(item, ref arrayId, out items));
            manager = Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("45ba127d-10a8-46ea-8ab7-56ea9078943c")));
            uint pid; Marshal.ThrowExceptionForHR(((IActivationManager)manager).ActivateForFile(app, items, verb, out pid));
            return pid;
        } finally {
            if (items != IntPtr.Zero) Marshal.Release(items);
            if (item != IntPtr.Zero) Marshal.Release(item);
            if (manager != null && Marshal.IsComObject(manager)) Marshal.FinalReleaseComObject(manager);
        }
    }
}
'@
$extension = [IO.Path]::GetExtension($file)
$lastError = $null
foreach ($package in $packages) {
    try {
        $manifest = Get-AppxPackageManifest -Package $package.PackageFullName
        foreach ($application in $manifest.SelectNodes("//*[local-name()='Application']")) {
            $associations = @($application.SelectNodes(".//*[local-name()='FileTypeAssociation']"))
            $supported = @($associations | Where-Object {
                @($_.SelectNodes(".//*[local-name()='FileType']") | Where-Object { $_.InnerText -eq $extension -or $_.InnerText -eq '*' }).Count -gt 0
            })
            if (!$supported.Count) { continue }
            $verbs = @($supported | ForEach-Object { $_.SelectNodes(".//*[local-name()='Verb']") } | ForEach-Object { $_.GetAttribute('Id') } | Where-Object { $_ })
            $verb = 'open'
            if ($verbs -contains 'edit') { $verb = 'edit' } elseif ($verbs.Count) { $verb = $verbs[0] }
            $appId = $package.PackageFamilyName + '!' + $application.GetAttribute('Id')
            $editorProcess = [DocsHubClipchamp]::Open($appId, $file, $verb)
            @{ok=$true;method='file-activation';process=$editorProcess} | ConvertTo-Json -Compress
            exit 0
        }
    } catch { $lastError = $_.Exception.Message }
}
if ($lastError) { throw "Windows no pudo enviar el video a Clipchamp: $lastError" }
throw 'Clipchamp no registra este formato de video en Windows. Comproba si Editar con Clipchamp funciona sobre el mismo archivo en el Explorador.'
