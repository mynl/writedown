# dev-setup.ps1 — churn firewall (see CLAUDE.md "READ THIS FIRST").
#
# Keeps dev-heavy artifacts OFF the Synology-synced project tree by relocating
# node_modules to V: behind a junction. Rust target/ is handled separately by
# src-tauri/.cargo/config.toml.
#
# Run this ONCE after cloning, and AGAIN after every `npm install` / `npm ci`
# (npm deletes the junction and rebuilds a real node_modules on C:).
#
#   pwsh scripts/dev-setup.ps1

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$vRoot = 'V:\dev\writedown'
$vNode = Join-Path $vRoot 'node_modules'
$projNode = Join-Path $repo 'node_modules'

if (-not (Test-Path 'V:\')) { throw 'V: drive not found — the dev drive is required.' }
New-Item -ItemType Directory -Force -Path $vNode, (Join-Path $vRoot 'target') | Out-Null

$item = Get-Item $projNode -Force -ErrorAction SilentlyContinue
if ($item -and $item.LinkType -eq 'Junction') {
    Write-Host "node_modules already a junction -> $($item.Target)"
}
elseif ($item) {
    # npm rebuilt a real node_modules on C: — move it to V: and re-junction.
    Write-Host 'Relocating real node_modules -> V: ...'
    robocopy $projNode $vNode /MOVE /E /NFL /NDL /NJH /NJS /NC /NS | Out-Null
    if (Test-Path $projNode) { Remove-Item $projNode -Recurse -Force -ErrorAction SilentlyContinue }
    New-Item -ItemType Junction -Path $projNode -Target $vNode | Out-Null
    Write-Host 'Done.'
}
else {
    New-Item -ItemType Junction -Path $projNode -Target $vNode | Out-Null
    Write-Host 'Created node_modules junction -> V:'
}

# npm cache off the synced tree too.
npm config set cache 'V:\dev\npm-cache' | Out-Null
Write-Host "npm cache: $(npm config get cache)"
Write-Host 'Firewall OK: node_modules on V:, cargo target-dir on V: (.cargo/config.toml).'
