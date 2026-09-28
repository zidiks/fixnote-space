# Packs the built app (target/release after `tauri build`) into the Microsoft Store package:
#   <Out>/FixNote-Store-x64.msix       unsigned, for Partner Center (the Store signs it)
#   <Out>/FixNote-Store-x64-test.msix  unsigned, to install and try (README > Microsoft Store)
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

# An unsigned copy to install for testing (Windows 11: Add-AppxPackage -AllowUnsigned). Windows
# takes an unsigned package only when its publisher carries this marker; the Store copy has none.
$testLayout = Join-Path $Out 'layout-test'
Copy-Item $layout $testLayout -Recurse
$unsigned = $Publisher + ', OID.2.25.311729368913984317654407730594956997722=1'
$testManifest = $manifest.Replace(
  "Publisher=""$([System.Security.SecurityElement]::Escape($Publisher))""",
  "Publisher=""$([System.Security.SecurityElement]::Escape($unsigned))""")
if ($testManifest -eq $manifest) { throw 'the test manifest still has the Store publisher' }
[System.IO.File]::WriteAllText("$testLayout/AppxManifest.xml", $testManifest, [System.Text.UTF8Encoding]::new($false))
$test = Join-Path $Out 'FixNote-Store-x64-test.msix'
& "$tools/makeappx.exe" pack /o /h SHA256 /d $testLayout /p $test
if ($LASTEXITCODE) { throw 'makeappx pack (test copy) failed' }
Remove-Item $testLayout -Recurse

Get-ChildItem $Out -File | ForEach-Object { Write-Host ('{0,12:N0}  {1}' -f $_.Length, $_.Name) }
