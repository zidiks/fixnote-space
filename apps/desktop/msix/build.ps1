# Packs the built app (target/release after `tauri build`) into the Microsoft Store package:
#   <Out>/FixNote-Store-x64.msix       unsigned, for Partner Center (the Store signs it)
#   <Out>/FixNote-Store-x64-test.msix  signed with a throwaway certificate, to install and try
#   <Out>/FixNote-Store-test.cer       that certificate (README > Microsoft Store)
# The identity comes from Partner Center (Product management > Product identity); without it the
# package gets a test identity, fine for trying it out but not accepted by the Store.
param(
  [string]$Release = "$PSScriptRoot/../src-tauri/target/release",
  [string]$Out = "$PSScriptRoot/../src-tauri/target/msix",
  [string]$IdentityName = '',
  [string]$Publisher = '',
  [string]$PublisherDisplayName = ''
)
$ErrorActionPreference = 'Stop'
# Full paths without "..": the SDK tools pick how to treat a file from its path.
$Release = [System.IO.Path]::GetFullPath($Release)
$Out = [System.IO.Path]::GetFullPath($Out)

if (-not $IdentityName) { $IdentityName = 'FixNote.Test' }
if (-not $Publisher) { $Publisher = 'CN=FixNote Test' }
if (-not $PublisherDisplayName) { $PublisherDisplayName = 'FixNote' }

# Windows SDK tools (newest SDK that has them).
$kits = 'C:\Program Files (x86)\Windows Kits\10\bin'
$bin = Get-ChildItem $kits -Directory | Where-Object { Test-Path "$($_.FullName)\x64\makeappx.exe" } |
  Sort-Object { [version]$_.Name } | Select-Object -Last 1
if (-not $bin) { throw "makeappx.exe not found under $kits" }
$tools = "$($bin.FullName)\x64"
Write-Host "Windows SDK $($bin.Name)"

# Store versions have four parts and the last one must be 0.
$conf = Get-Content "$PSScriptRoot/../src-tauri/tauri.conf.json" -Raw | ConvertFrom-Json
if ($conf.version -notmatch '^\d+\.\d+\.\d+$') { throw "version $($conf.version) is not X.Y.Z" }
$version = "$($conf.version).0"

# Package layout: the app, the MCP server, the images, the manifest.
$layout = Join-Path $Out 'layout'
if (Test-Path $Out) { Remove-Item $Out -Recurse -Force }
New-Item -ItemType Directory -Force $layout | Out-Null
Copy-Item "$Release/fixnote-desktop.exe" "$layout/FixNote.exe"
Copy-Item "$Release/fixnote-mcp.exe" "$layout/fixnote-mcp.exe"
if ((Get-Item "$layout/fixnote-mcp.exe").Length -lt 1MB) { throw 'fixnote-mcp.exe is the placeholder: build the MCP server first' }
Copy-Item "$PSScriptRoot/Assets" "$layout/Assets" -Recurse

$manifest = Get-Content "$PSScriptRoot/AppxManifest.xml" -Raw -Encoding UTF8
$values = @{
  '{{IDENTITY_NAME}}' = $IdentityName
  '{{PUBLISHER}}' = $Publisher
  '{{PUBLISHER_DISPLAY_NAME}}' = $PublisherDisplayName
  '{{VERSION}}' = $version
}
foreach ($key in $values.Keys) {
  $manifest = $manifest.Replace($key, [System.Security.SecurityElement]::Escape($values[$key]))
}
if ($manifest -match '\{\{[A-Z_]+\}\}') { throw "$($Matches[0]) is left in the manifest" }
[System.IO.File]::WriteAllText("$layout/AppxManifest.xml", $manifest, [System.Text.UTF8Encoding]::new($false))
Write-Host "Identity $IdentityName, $Publisher ($PublisherDisplayName), version $version"

# resources.pri: lets Windows pick the right image size (scale-*, targetsize-*).
Push-Location $Out
try {
  & "$tools/makepri.exe" createconfig /cf priconfig.xml /dq en-US_ru-RU_es-ES /pv 10.0.0 /o
  if ($LASTEXITCODE) { throw 'makepri createconfig failed' }
  & "$tools/makepri.exe" new /pr layout /cf priconfig.xml /mn layout/AppxManifest.xml /of layout/resources.pri /o
  if ($LASTEXITCODE) { throw 'makepri new failed' }
} finally { Pop-Location }

$msix = Join-Path $Out 'FixNote-Store-x64.msix'
& "$tools/makeappx.exe" pack /o /h SHA256 /d $layout /p $msix
if ($LASTEXITCODE) { throw 'makeappx pack failed' }

# A signed copy to install on a test machine. The certificate's subject must equal Publisher.
$test = Join-Path $Out 'FixNote-Store-x64-test.msix'
Copy-Item $msix $test
$cert = New-SelfSignedCertificate -Type Custom -Subject $Publisher -KeyUsage DigitalSignature `
  -FriendlyName 'FixNote Store test package' -CertStoreLocation 'Cert:\CurrentUser\My' `
  -NotAfter (Get-Date).AddYears(1) `
  -TextExtension @('2.5.29.37={text}1.3.6.1.5.5.7.3.3', '2.5.29.19={text}')
try {
  $pfx = Join-Path ([System.IO.Path]::GetTempPath()) 'msix-test.pfx'
  $password = [guid]::NewGuid().ToString()
  Export-PfxCertificate -Cert $cert -FilePath $pfx -Password (ConvertTo-SecureString $password -AsPlainText -Force) | Out-Null
  & "$tools/signtool.exe" sign /v /debug /fd SHA256 /f $pfx /p $password $test
  if ($LASTEXITCODE) { throw 'signtool sign failed' }
  Export-Certificate -Cert $cert -FilePath (Join-Path $Out 'FixNote-Store-test.cer') | Out-Null
  Remove-Item $pfx
} finally {
  Remove-Item "Cert:\CurrentUser\My\$($cert.Thumbprint)"
}

Get-ChildItem $Out -File | ForEach-Object { Write-Host ('{0,12:N0}  {1}' -f $_.Length, $_.Name) }
