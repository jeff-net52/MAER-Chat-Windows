[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string] $HostPath
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$hostName = 'fr.maer.password_vault'
$chromiumOrigin = 'chrome-extension://afjfndaggdofghcpakcemfkckhiaplkn/'
$firefoxExtension = 'password-vault@maer.fr'
$resolvedHost = [IO.Path]::GetFullPath($HostPath)
if (
  -not [IO.File]::Exists($resolvedHost) -or
  [IO.Path]::GetExtension($resolvedHost) -ine '.exe' -or
  [IO.Path]::GetFileName($resolvedHost) -cne 'maer-password-vault-host.exe'
) {
  throw 'Le binaire MAER Chat Native Messaging est invalide.'
}

$localAppData = [Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)
if ([string]::IsNullOrWhiteSpace($localAppData)) {
  throw 'Le répertoire LocalAppData est indisponible.'
}
$manifestRoot = [IO.Path]::GetFullPath((Join-Path $localAppData 'MAER Chat\NativeMessaging'))
[IO.Directory]::CreateDirectory($manifestRoot) | Out-Null
$utf8NoBom = [Text.UTF8Encoding]::new($false)

function Write-ManifestAtomically {
  param(
    [Parameter(Mandatory = $true)] [string] $Target,
    [Parameter(Mandatory = $true)] [Collections.IDictionary] $Manifest
  )
  $temporary = Join-Path $manifestRoot ('.' + [Guid]::NewGuid().ToString('N') + '.tmp')
  try {
    $json = $Manifest | ConvertTo-Json -Depth 4
    [IO.File]::WriteAllText($temporary, $json, $utf8NoBom)
    Move-Item -LiteralPath $temporary -Destination $Target -Force
  }
  finally {
    if (Test-Path -LiteralPath $temporary) {
      Remove-Item -LiteralPath $temporary -Force
    }
  }
}

$manifestPaths = @{
  chrome = Join-Path $manifestRoot "$hostName-chrome.json"
  edge = Join-Path $manifestRoot "$hostName-edge.json"
  firefox = Join-Path $manifestRoot "$hostName-firefox.json"
}
$chromiumManifest = [ordered]@{
  name = $hostName
  description = 'Pont local sécurisé du coffre de mots de passe MAER Chat'
  path = $resolvedHost
  type = 'stdio'
  allowed_origins = @($chromiumOrigin)
}
$firefoxManifest = [ordered]@{
  name = $hostName
  description = 'Pont local sécurisé du coffre de mots de passe MAER Chat'
  path = $resolvedHost
  type = 'stdio'
  allowed_extensions = @($firefoxExtension)
}

Write-ManifestAtomically -Target $manifestPaths.chrome -Manifest $chromiumManifest
Write-ManifestAtomically -Target $manifestPaths.edge -Manifest $chromiumManifest
Write-ManifestAtomically -Target $manifestPaths.firefox -Manifest $firefoxManifest

$registrations = @(
  @{ Key = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$hostName"; Manifest = $manifestPaths.chrome },
  @{ Key = "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$hostName"; Manifest = $manifestPaths.edge },
  @{ Key = "HKCU:\Software\Mozilla\NativeMessagingHosts\$hostName"; Manifest = $manifestPaths.firefox }
)
foreach ($registration in $registrations) {
  New-Item -Path $registration.Key -Force | Out-Null
  Set-Item -LiteralPath $registration.Key -Value $registration.Manifest
}
