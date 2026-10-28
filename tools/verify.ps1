#requires -Version 5.1
<#
.SYNOPSIS
  Run every pre-install check for a Client plugin bundle.

.DESCRIPTION
  Order matters: a syntax error makes the other checks meaningless, and the
  bundle is only worth installing if all of them pass.

    1. `node --check`        — the file must parse as JavaScript.
    2. check-inject.js       — every `ctx.<service>` read must be declared in
                               `exports.inject`; an undeclared read throws at
                               activation and the Web boot audit then aborts the
                               whole application.
    3. apply_harness.js      — loads the real bundle, runs `apply()` against a
                               mock Client context that enforces the inject
                               contract, and renders every registered component.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File tools\verify.ps1
#>
[CmdletBinding()]
param(
  [string] $Bundle = 'plugin\dsh-touch\client.js'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$target = Join-Path $root $Bundle

if (-not (Test-Path -LiteralPath $target -PathType Leaf)) {
  throw "Bundle not found: $target"
}

$results = @()

function Step([string] $name, [scriptblock] $body) {
  Write-Host ''
  Write-Host "=== $name ===" -ForegroundColor Cyan
  & $body
  $script:results += [pscustomobject]@{ Step = $name; Exit = $LASTEXITCODE }
}

Step '1. syntax (node --check)' {
  node --check $target
  if ($LASTEXITCODE -eq 0) { Write-Host 'OK parses as JavaScript' -ForegroundColor Green }
}

Step '2. inject contract (check-inject)' {
  node (Join-Path $PSScriptRoot 'check-inject.js') $target
}

Step '3. activation + render (apply_harness)' {
  node (Join-Path $PSScriptRoot 'apply_harness.js') $target
}

Step '4. workspace vs session branches (branch_test)' {
  node (Join-Path $PSScriptRoot 'branch_test.js') $target
}

Write-Host ''
Write-Host '=== summary ===' -ForegroundColor Cyan
foreach ($r in $results) {
  $mark = if ($r.Exit -eq 0) { 'PASS' } else { 'FAIL' }
  $colour = if ($r.Exit -eq 0) { 'Green' } else { 'Red' }
  Write-Host ("{0}  {1}" -f $mark, $r.Step) -ForegroundColor $colour
}

$failed = @($results | Where-Object { $_.Exit -ne 0 })
if ($failed.Count -gt 0) {
  Write-Host ''
  Write-Host 'Do NOT install this bundle until every step passes.' -ForegroundColor Red
  exit 1
}

Write-Host ''
Write-Host 'All checks passed.' -ForegroundColor Green
