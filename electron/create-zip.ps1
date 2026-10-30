$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.IO.Compression
$inputData=[System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String([Console]::In.ReadToEnd().Trim()))|ConvertFrom-Json
$root=[System.IO.Path]::GetFullPath([string]$inputData.folder).TrimEnd([System.IO.Path]::DirectorySeparatorChar)+[System.IO.Path]::DirectorySeparatorChar
$destination=[System.IO.Path]::GetFullPath([string]$inputData.destination)
$stream=$null;$zip=$null
try{
 $stream=[System.IO.File]::Open($destination,[System.IO.FileMode]::CreateNew,[System.IO.FileAccess]::ReadWrite,[System.IO.FileShare]::None)
 $zip=[System.IO.Compression.ZipArchive]::new($stream,[System.IO.Compression.ZipArchiveMode]::Create,$true,[System.Text.Encoding]::UTF8)
 foreach($item in $inputData.entries){
  $file=[System.IO.Path]::GetFullPath([string]$item.path);$name=[string]$item.name
  if(-not $file.StartsWith($root,[StringComparison]::OrdinalIgnoreCase)-or $name.StartsWith('/')-or $name.Contains(':')-or $name.Contains('\')-or $name.Split('/') -contains '..'){throw 'La seleccion contiene una ruta insegura.'}
  $check=$file
  while($check -and $check.Length -ge $root.TrimEnd([System.IO.Path]::DirectorySeparatorChar).Length){
   if(([System.IO.File]::GetAttributes($check)-band [System.IO.FileAttributes]::ReparsePoint)-ne 0){throw 'No se comprimen enlaces o carpetas redirigidas.'}
   $check=[System.IO.Path]::GetDirectoryName($check)
  }
  $entry=$zip.CreateEntry($name,[System.IO.Compression.CompressionLevel]::Optimal)
  $stamp=[System.IO.File]::GetLastWriteTime($file);if($stamp.Year -ge 1980 -and $stamp.Year -le 2107){$entry.LastWriteTime=[DateTimeOffset]$stamp}
  if(-not [bool]$item.directory){
   $source=[System.IO.File]::Open($file,[System.IO.FileMode]::Open,[System.IO.FileAccess]::Read,[System.IO.FileShare]::Read)
   try{$target=$entry.Open();try{$source.CopyTo($target)}finally{$target.Dispose()}}finally{$source.Dispose()}
  }
 }
 $zip.Dispose();$zip=$null;$stream.Flush($true)
 [Console]::Out.WriteLine('{"ok":true}')
}finally{if($zip){$zip.Dispose()};if($stream){$stream.Dispose()}}
