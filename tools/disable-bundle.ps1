#requires -Version 5.1
<#
.SYNOPSIS
  Emergency recovery for a DSH profile bundle that breaks Web boot.

.DESCRIPTION
  A bundle listed in a profile's `dsh.profile.bundles` is loaded at every app
  start. If its client half fails to activate, the Web boot audit aborts and the
  window shows nothing, which usually means the Settings UI needed to disable it
  is unreachable too. This script edits the profile's package.json directly, so
  it works with the GUI down.

  It only rewrites the `dsh.profile.bundles` array: the named bundles are
  removed, every other bundle and every other package.json field is preserved,
  and a timestamped backup is written beside the original.

  Run it with Harness fully closed, then start Harness.

.EXAMPLE
  pwsh -File tools\disable-bundle.ps1 -Profile desktop -Bundle '@local/dsh-touch'
#>
[CmdletBinding()]
param(
  [string] $Profile = 'desktop',
  [string[]] $Bundle = @('@local/dsh-touch'),
  [switch] $WhatIf
)

$ErrorActionPreference = 'Stop'
$dshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $HOME '.dsh' }
$profileDir = Join-Path (Join-Path $dshHome 'profiles') $Profile
$manifestPath = Join-Path $profileDir 'package.json'

if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
  throw "Profile manifest not found: $manifestPath"
}

$raw = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8
$manifest = $raw | ConvertFrom-Json

if (-not $manifest.dsh -or -not $manifest.dsh.profile -or -not $manifest.dsh.profile.bundles) {
  Write-Host "No dsh.profile.bundles array in $manifestPath — nothing to do."
  return
}

$before = @($manifest.dsh.profile.bundles)
$after = @($before | Where-Object { $Bundle -notcontains $_ })
$removed = @($before | Where-Object { $Bundle -contains $_ })

Write-Host "profile : $profileDir"
Write-Host "bundles before: $($before -join ', ')"
Write-Host "removing      : $($removed -join ', ')"

if ($removed.Count -eq 0) {
  Write-Host 'Nothing to remove; the profile is already clean.'
  return
}

Write-Host "bundles after : $($after -join ', ')"

if ($WhatIf) {
  Write-Host '(-WhatIf: no file written)'
  return
}

$stamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$backup = "$manifestPath.bak-$stamp"
Copy-Item -LiteralPath $manifestPath -Destination $backup
Write-Host "backup : $backup"

# Rewrite only the bundles array, keeping 2-space indentation, so the rest of
# the file (dependencies and anything hand-edited) survives byte for byte.
$lines = Get-Content -LiteralPath $manifestPath
$out = New-Object System.Collections.Generic.List[string]
$inBundles = $false
$indent = '        '
$written = $false

foreach ($line in $lines) {
  if (-not $inBundles) {
    $out.Add($line)
    if ($line -match '"bundles"\s*:\s*\[') {
      if ($line -match '\]') {
        # Single-line array: replace in place.
        $out[$out.Count - 1] = $line -replace '\[.*\]', ('[' + (($after | ForEach-Object { '"' + $_ + '"' }) -join ', ') + ']')
        $written = $true
      } else {
        $inBundles = $true
      }
    }
    continue
  }

  if ($line -match '^\s*\]') {
    $out.Add($line)
    $inBundles = $false
    $written = $true
    continue
  }

  if (-not $written -and $line -match '^\s*"') {
    # Re-emit the kept bundles once, at the first element's indentation.
    foreach ($name in $after) { $out.Add("$indent`"$name`",") }
    $out[$out.Count - 1] = $out[$out.Count - 1] -replace ',$'
    $written = $true
  }
  # Original bundle lines are dropped.
}

Set-Content -LiteralPath $manifestPath -Value $out -Encoding UTF8
Write-Host ''
Write-Host 'Done. Start Harness again.'
Write-Host "To undo: copy $backup over $manifestPath"
