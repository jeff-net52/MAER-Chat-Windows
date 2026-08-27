[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$hostName = 'fr.maer.password_vault'
$localAppData = [Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)
if ([string]::IsNullOrWhiteSpace($localAppData)) {
  throw 'Le répertoire LocalAppData est indisponible.'
}
$manifestRoot = [IO.Path]::GetFullPath((Join-Path $localAppData 'MAER Chat\NativeMessaging'))
$registrations = @(
  "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$hostName",
  "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$hostName",
  "HKCU:\Software\Mozilla\NativeMessagingHosts\$hostName"
)
foreach ($registration in $registrations) {
  if (Test-Path -LiteralPath $registration) {
    Remove-Item -LiteralPath $registration -Force
  }
}

foreach ($browser in @('chrome', 'edge', 'firefox')) {
  $manifest = Join-Path $manifestRoot "$hostName-$browser.json"
  if (Test-Path -LiteralPath $manifest -PathType Leaf) {
    Remove-Item -LiteralPath $manifest -Force
  }
}
if (
  (Test-Path -LiteralPath $manifestRoot -PathType Container) -and
  -not (Get-ChildItem -LiteralPath $manifestRoot -Force | Select-Object -First 1)
) {
  Remove-Item -LiteralPath $manifestRoot -Force
}
