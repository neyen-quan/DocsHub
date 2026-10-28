param([string]$Title='Confirmar actualización de DocsHub',[string]$Button='Cancelar',[string]$Report)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$deadline=[DateTime]::UtcNow.AddSeconds(25)
while([DateTime]::UtcNow -lt $deadline){
  $filter=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty,$Title)
  $window=[System.Windows.Automation.AutomationElement]::RootElement.FindFirst([System.Windows.Automation.TreeScope]::Children,$filter)
  if($window){
    # Keep the real native modal open after the download promise has completed.
    Start-Sleep -Milliseconds 2500
    $buttonFilter=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty,$Button)
    $target=$window.FindFirst([System.Windows.Automation.TreeScope]::Descendants,$buttonFilter)
    if(!$target){throw "No se encontró el botón $Button en el diálogo nativo"}
    if($Report){[System.IO.File]::WriteAllText($Report,'native modal observed')}
    $target.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
    exit 0
  }
  Start-Sleep -Milliseconds 100
}
if($Report){$names=@([System.Windows.Automation.AutomationElement]::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children,[System.Windows.Automation.Condition]::TrueCondition)|ForEach-Object{$_.Current.Name});[System.IO.File]::WriteAllText(($Report+'.windows.json'),($names|ConvertTo-Json))}
throw 'Native confirmation dialog was not found'
