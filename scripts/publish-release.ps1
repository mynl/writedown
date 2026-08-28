# Publish a Writedown release to GitHub: annotated tag v<version> plus a Release with
# all three binaries attached under friendly labels (gh's path#label form):
#   bundle\nsis\Writedown_<v>_x64-setup.exe   "installer (Windows x64, recommended)"
#   bundle\msi\Writedown_<v>_x64_en-US.msi    "MSI (Windows x64)"
#   writedown.exe                             "portable exe (no installer)"
#
# Prereqs: a fresh `npm run tauri build` (artifacts in <repo>/target) and gh CLI logged in.
# Usage:
#   pwsh scripts/publish-release.ps1                  # version read from src-tauri/Cargo.toml
#   pwsh scripts/publish-release.ps1 -Draft           # staged; publish later in the UI
#   pwsh scripts/publish-release.ps1 -NotesFile n.md  # hand-written notes (default: GitHub
#                                                     # auto-generates from commit subjects)
# Re-cutting a release: delete the old one first -
#   gh release delete v2.0.0 --yes; git push --delete origin v2.0.0; git tag -d v2.0.0

param(
    [string]$Version,
    [string]$NotesFile,
    [switch]$Draft
)
$ErrorActionPreference = "Stop"
$repoRoot = Split-Path $PSScriptRoot -Parent

if (-not $Version) {
    $cargo = Get-Content (Join-Path $repoRoot "src-tauri\Cargo.toml") -Raw
    if ($cargo -match '(?m)^version\s*=\s*"([^"]+)"') { $Version = $Matches[1] }
    else { throw "could not read version from src-tauri/Cargo.toml" }
}
$tag = "v$Version"
# target/ sits beside src-tauri/ in the checkout (src-tauri/.cargo/config.toml sets
# target-dir = "../target"), so derive it from the repo — never name a drive.
$rel = Join-Path $repoRoot "target\release"
$assets = @(
    @{ Path = "$rel\bundle\nsis\Writedown_${Version}_x64-setup.exe"; Label = "Writedown $Version installer (Windows x64, recommended)" }
    @{ Path = "$rel\bundle\msi\Writedown_${Version}_x64_en-US.msi";  Label = "Writedown $Version MSI (Windows x64)" }
    @{ Path = "$rel\writedown.exe";                                  Label = "Writedown $Version portable exe (no installer)" }
)

foreach ($a in $assets) {
    if (-not (Test-Path $a.Path)) { throw "missing artifact $($a.Path) - run 'npm run tauri build' first" }
}
# The bare exe carries no version in its filename - refuse a stale one.
$exeVer = (Get-Item "$rel\writedown.exe").VersionInfo.ProductVersion
if ($exeVer -and -not $exeVer.StartsWith($Version)) {
    throw "writedown.exe is version $exeVer, not $Version - stale build; run 'npm run tauri build'"
}
gh release view $tag *> $null
if ($LASTEXITCODE -eq 0) { throw "release $tag already exists - delete it first (see header)" }

if (-not (git tag --list $tag)) { git tag -a $tag -m "Writedown $Version" }
git push origin $tag
if ($LASTEXITCODE -ne 0) { throw "pushing tag $tag failed" }

$ghArgs = @("release", "create", $tag, "--title", "Writedown $Version")
if ($Draft) { $ghArgs += "--draft" }
if ($NotesFile) { $ghArgs += @("--notes-file", $NotesFile) } else { $ghArgs += "--generate-notes" }
foreach ($a in $assets) { $ghArgs += "$($a.Path)#$($a.Label)" }
& gh @ghArgs
if ($LASTEXITCODE -ne 0) { throw "gh release create failed" }
Write-Host "published: $(gh release view $tag --json url --jq .url)"
