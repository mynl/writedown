# Generate THIRD-PARTY-NOTICES.md from the dependency sets actually in the tree.
# Reads Cargo.lock (via `cargo metadata`, which builds nothing; it may fetch crate
# manifests into the cargo cache on the very first run) and the installed
# node_modules (via `npm ls`, which installs nothing). Run from anywhere:
#   pwsh scripts/generate-notices.ps1
# IMPORTANT: never run `npm install` as part of this — it destroys the node_modules
# junction to V: (see CLAUDE.md). This script only READS what is already installed.

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot

# The handful of components whose manifest declares no license — verified manually at
# the project repository. Keep this list tiny and re-verify on version bumps.
$licenseOverrides = @{
    'unicode_names2' = 'MIT OR Apache-2.0 (per repository; undeclared in manifest)'
    'khroma'         = 'MIT (per repository; undeclared in manifest)'
}
$placeholder = '(none declared - check repository)'

# ---- Rust crates -------------------------------------------------------------------
# cargo must run with its working directory inside src-tauri/ so .cargo/config.toml
# (the V: target-dir firewall) is honored — metadata builds nothing, but stay in the
# habit (see CLAUDE.md). Filter to the Windows target: Writedown ships Windows-only,
# and an unfiltered resolve pulls in gtk/objc2/jni crates that are never compiled.
Push-Location (Join-Path $repo 'src-tauri')
try {
    $meta = cargo metadata --format-version 1 --locked --filter-platform x86_64-pc-windows-msvc | ConvertFrom-Json
} finally {
    Pop-Location
}
$crates = @(
    $meta.packages |
        Where-Object { $_.name -ne 'writedown' } |
        Sort-Object name, version |
        ForEach-Object {
            $lic = if ($_.license) { $_.license }
                   elseif ($licenseOverrides.ContainsKey($_.name)) { $licenseOverrides[$_.name] }
                   else { $placeholder }
            [pscustomobject]@{ Name = $_.name; Version = $_.version; License = $lic }
        }
)

# ---- npm packages (production dependency tree) -------------------------------------
$raw = npm ls --omit=dev --all --json --silent 2>$null | Out-String
$tree = $raw | ConvertFrom-Json

function Read-NpmLicense([string]$name) {
    if ($licenseOverrides.ContainsKey($name)) { return $licenseOverrides[$name] }
    $pj = Join-Path (Join-Path $repo 'node_modules') ($name.Replace('/', [string][IO.Path]::DirectorySeparatorChar)) 'package.json'
    if (-not (Test-Path $pj)) { return $placeholder }
    $j = Get-Content $pj -Raw | ConvertFrom-Json
    if ($j.license -is [string]) { return $j.license }
    if ($j.license -and $j.license.type) { return $j.license.type }
    if ($j.licenses) { return (($j.licenses | ForEach-Object { $_.type }) -join ' OR ') }
    return $placeholder
}

$npmSeen = @{}
function Walk-Deps($deps) {
    if (-not $deps) { return }
    foreach ($p in $deps.PSObject.Properties) {
        $v = $p.Value.version
        if (-not $v) { continue } # unmet/link placeholder
        $key = "$($p.Name)@$v"
        if (-not $npmSeen.ContainsKey($key)) {
            $npmSeen[$key] = [pscustomobject]@{
                Name    = $p.Name
                Version = $v
                License = Read-NpmLicense $p.Name
            }
            Walk-Deps $p.Value.dependencies
        }
    }
}
Walk-Deps $tree.dependencies
$npm = @($npmSeen.Values | Sort-Object Name, Version)

# ---- Summary by license ------------------------------------------------------------
$all = @($crates) + @($npm)
$byLicense = $all | Group-Object License | Sort-Object Count -Descending

# ---- Emit --------------------------------------------------------------------------
$today = Get-Date -Format 'yyyy-MM-dd'
$out = New-Object System.Collections.Generic.List[string]
$out.Add('# Third-Party Notices')
$out.Add('')
$out.Add('Writedown is MIT-licensed (see `LICENSE`). It is built on the open-source')
$out.Add('components below, listed with the license each declares. Generated offline from')
$out.Add("Cargo.lock and the installed node_modules by ``scripts/generate-notices.ps1`` on $today;")
$out.Add('regenerate with `pwsh scripts/generate-notices.ps1` after a dependency change.')
$out.Add('')
$out.Add('## Summary by license')
$out.Add('')
$out.Add('| License | Components |')
$out.Add('|---|--:|')
foreach ($g in $byLicense) { $out.Add("| $($g.Name) | $($g.Count) |") }
$out.Add('')
$out.Add("## Rust crates ($($crates.Count))")
$out.Add('')
$out.Add('| Crate | Version | License |')
$out.Add('|---|---|---|')
foreach ($c in $crates) { $out.Add("| $($c.Name) | $($c.Version) | $($c.License) |") }
$out.Add('')
$out.Add("## npm packages ($($npm.Count), production tree)")
$out.Add('')
$out.Add('| Package | Version | License |')
$out.Add('|---|---|---|')
foreach ($p in $npm) { $out.Add("| $($p.Name) | $($p.Version) | $($p.License) |") }
$out.Add('')
$out.Add('## Bundled data and system components')
$out.Add('')
$out.Add('- **English (US) spell dictionary** — derived from [SCOWL](http://wordlist.sourceforge.net)')
$out.Add('  (Kevin Atkinson) with affix rules by Geoff Kuenning, via')
$out.Add('  [wooorm/dictionaries](https://github.com/wooorm/dictionaries) (UTF-8 normalized).')
$out.Add('  Distributed under the permissive SCOWL and BSD licenses; full text ships with the')
$out.Add('  data at `src-tauri/assets/dict/LICENSE-en_US.txt`.')
$out.Add('- **KaTeX fonts** — included within the `katex` npm package; the fonts derive from')
$out.Add('  Computer Modern and are distributed under the SIL Open Font License 1.1 alongside')
$out.Add("  KaTeX's MIT license (see the package's LICENSE).")
$out.Add('- **Microsoft Edge WebView2** — the rendering engine already present on Windows; a')
$out.Add('  system component, not distributed with Writedown.')
$out.Add('- **Python** — the Rendered view executes `{python}` cells through an interpreter')
$out.Add('  YOU configure; no Python is bundled or distributed.')
$out.Add('')
$out.Add('## License-compatibility note')
$out.Add('')
$out.Add('Everything above is permissive (MIT/Apache/BSD/ISC family, MPL-2.0 file-level')
$out.Add('copyleft) with one exception: the `malachite` arbitrary-precision arithmetic')
$out.Add('crates (LGPL-3.0-only), statically linked via `rustpython-parser`, which powers')
$out.Add("the in-editor ``{python}`` syntax check. Writedown's full source is public under")
$out.Add("MIT, which satisfies the LGPL's source-availability and relink requirements for")
$out.Add('a statically linked combination.')
$out.Add('')

$dest = Join-Path $repo 'THIRD-PARTY-NOTICES.md'
[IO.File]::WriteAllLines($dest, $out)
Write-Host "Wrote $dest — $($crates.Count) crates, $($npm.Count) npm packages."
$unknown = $all | Where-Object { $_.License -eq $placeholder }
if ($unknown) {
    Write-Host 'Components without a declared license (verify and add to $licenseOverrides):'
    $unknown | ForEach-Object { Write-Host "  $($_.Name)@$($_.Version)" }
}
