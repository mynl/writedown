<#
.SYNOPSIS
    Measures what an idle Writedown release build costs while other programs write under its
    roots (issue K.08). Part of the gate for any change that touches background work.

.DESCRIPTION
    Builds a synthetic fixture under $env:TEMP (a git repository of about 200 small .md files
    with uncommitted changes, ignored build churn, and a plain folder), opens it in Writedown as
    an unsaved two-folder project under its own WRITEDOWN_HOME and WebView2 data folder, and
    leaves the window alone while a separate writer process churns:

      settle   15 s   startup listing, the first tree-marks sweep, WebView2 start
      phase A  60 s   writes in folders the tree has not listed (target\build, docs\deep), plus
                      `git status` (which takes index.lock) and `git commit --allow-empty` every
                      2 s, as another program would
      phase B  30 s   the same, plus a write in a listed folder (the repository root) every
                      500 ms, which legitimately reaches the tree

    Measured per phase: CPU of the whole Writedown process tree (writedown.exe and its WebView2
    processes, where the frontend runs) as a percentage of one core, and the git.exe processes
    Writedown starts, sampled about five times a second (sampling can miss one fast call, never a
    loop). Any `tripwire:` line in the run's log fails the run.

    Pass: phase A under 1% of one core and no git starts; phase B under 5% and no git starts.

    WRITEDOWN_HOME keeps the session, registry entry and logs out of ~/.writedown/.
    WEBVIEW2_USER_DATA_FOLDER gives the run its own WebView2 browser process: a host sharing the
    default data folder joins the browser process of any Writedown window already open, so its
    frontend would run outside the tree measured here. The process is killed, not closed, so the
    window-state plugin saves nothing.

.PARAMETER Exe
    The writedown.exe to measure. Defaults to target\release\writedown.exe in this checkout.

.PARAMETER Seconds
    Length of phase A in seconds (phase B is half of it).

.PARAMETER KeepFixture
    Leave the fixture folder in place for inspection.

.EXAMPLE
    npm run tauri build
    pwsh scripts/idle-check.ps1
#>
param(
    [string]$Exe = (Join-Path $PSScriptRoot '..\target\release\writedown.exe'),
    [int]$Seconds = 60,
    [switch]$KeepFixture
)

$ErrorActionPreference = 'Stop'
$Exe = (Resolve-Path $Exe).Path
$settleSeconds = 15
$phaseBSeconds = [math]::Max(10, [int]($Seconds / 2))

# ---- Fixture ---------------------------------------------------------------------------------

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$fixture = Join-Path $env:TEMP "writedown-idle-$stamp"
$appHome = Join-Path $fixture 'home'
$webview = Join-Path $fixture 'webview'
$work = Join-Path $fixture 'work'
$repo = Join-Path $work 'repo'
$other = Join-Path $work 'other'
foreach ($d in @($appHome, $webview, $repo, $other, (Join-Path $repo 'target\build'), (Join-Path $repo 'docs\deep'))) {
    New-Item -ItemType Directory -Force -Path $d | Out-Null
}
$folders = @('docs') + (1..9 | ForEach-Object { 'section{0:d2}' -f $_ })
foreach ($f in $folders) {
    New-Item -ItemType Directory -Force -Path (Join-Path $repo $f) | Out-Null
    foreach ($i in 1..20) {
        Set-Content -LiteralPath (Join-Path $repo "$f\note-$i.md") -Value "# $f note $i`n`nSynthetic text for the idle check.`n"
    }
}
Set-Content -LiteralPath (Join-Path $repo '.gitignore') -Value 'target/'
Set-Content -LiteralPath (Join-Path $other 'plain.md') -Value "# A plain folder`n"

# A fixed test identity, passed per call, so no git configuration is read or written.
$gitId = @('-c', 'user.name=idle-check', '-c', 'user.email=idle-check@example.invalid', '-c', 'core.autocrlf=false')
git -C $repo -c init.defaultBranch=main init -q
git -C $repo @gitId add -A
git -C $repo @gitId commit -q -m 'fixture'
# Uncommitted changes, so tree marks have something to show: 3 modified, 2 untracked.
foreach ($i in 1..3) { Add-Content -LiteralPath (Join-Path $repo "section01\note-$i.md") -Value 'Changed.' }
foreach ($i in 1..2) { Set-Content -LiteralPath (Join-Path $repo "docs\new-$i.md") -Value '# New' }

# The writer runs as its own pwsh, so its processes (git included) are never Writedown's children.
$writer = Join-Path $fixture 'writer.ps1'
Set-Content -LiteralPath $writer -Value @'
param([string]$Repo, [switch]$RootChurn)
$gitId = @('-c', 'user.name=idle-check', '-c', 'user.email=idle-check@example.invalid')
$i = 0
while ($true) {
    if ($RootChurn) {
        Set-Content -LiteralPath (Join-Path $Repo ("churn-{0}.md" -f ($i % 5))) -Value "tick $i"
        Start-Sleep -Milliseconds 500
    } else {
        Set-Content -LiteralPath (Join-Path $Repo ("target\build\out-{0}.o" -f ($i % 20))) -Value "tick $i"
        Set-Content -LiteralPath (Join-Path $Repo ("docs\deep\gen-{0}.md" -f ($i % 20))) -Value "tick $i"
        if ($i % 20 -eq 0) {
            git -C $Repo status --porcelain | Out-Null
            git -C $Repo @gitId commit -q --allow-empty -m tick | Out-Null
        }
        Start-Sleep -Milliseconds 100
    }
    $i++
}
'@

# ---- Measurement helpers ---------------------------------------------------------------------

# Writedown's process tree: the root pid and every descendant.
function Get-Tree([int]$RootPid) {
    $all = Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name
    $tree = @{ $RootPid = 'writedown.exe' }
    $grew = $true
    while ($grew) {
        $grew = $false
        foreach ($p in $all) {
            if ($tree.ContainsKey([int]$p.ParentProcessId) -and -not $tree.ContainsKey([int]$p.ProcessId)) {
                $tree[[int]$p.ProcessId] = $p.Name
                $grew = $true
            }
        }
    }
    $tree
}

# CPU seconds so far for each live pid of the tree.
function Get-Cpu($Tree) {
    $cpu = @{}
    foreach ($id in $Tree.Keys) {
        $p = Get-Process -Id $id -ErrorAction SilentlyContinue
        if ($p) { $cpu[$id] = $p.TotalProcessorTime.TotalSeconds }
    }
    $cpu
}

# Watch one phase: sample git.exe children of Writedown until the deadline, then return the
# tree's CPU over the phase as a percentage of one core, and the distinct git pids seen.
function Measure-Phase([int]$WritedownPid, [int]$PhaseSeconds) {
    $startCpu = Get-Cpu (Get-Tree $WritedownPid)
    $clock = [System.Diagnostics.Stopwatch]::StartNew()
    $gits = @{}
    while ($clock.Elapsed.TotalSeconds -lt $PhaseSeconds) {
        foreach ($g in @(Get-Process -Name git -ErrorAction SilentlyContinue)) {
            if ($g.Parent -and $g.Parent.Id -eq $WritedownPid) { $gits[$g.Id] = $true }
        }
        if (-not (Get-Process -Id $WritedownPid -ErrorAction SilentlyContinue)) { throw 'Writedown exited during the run' }
        Start-Sleep -Milliseconds 100
    }
    $endTree = Get-Tree $WritedownPid
    $endCpu = Get-Cpu $endTree
    $delta = 0.0
    foreach ($id in $endCpu.Keys) {
        $delta += $endCpu[$id] - ($(if ($startCpu.ContainsKey($id)) { $startCpu[$id] } else { 0.0 }))
    }
    [pscustomobject]@{
        Cpu   = 100.0 * $delta / $clock.Elapsed.TotalSeconds
        Gits  = $gits.Count
        Procs = $endTree.Count
        WebView = @($endTree.Values | Where-Object { $_ -eq 'msedgewebview2.exe' }).Count
    }
}

# ---- Run -------------------------------------------------------------------------------------

$saved = @{ WRITEDOWN_HOME = $env:WRITEDOWN_HOME; WEBVIEW2_USER_DATA_FOLDER = $env:WEBVIEW2_USER_DATA_FOLDER }
$env:WRITEDOWN_HOME = $appHome
$env:WEBVIEW2_USER_DATA_FOLDER = $webview
$app = $null
$writers = @()
$failed = $false
$rows = @()
try {
    # Two directory arguments: an unsaved two-folder project (nested roots) in a new window.
    $app = Start-Process -FilePath $Exe -ArgumentList @("`"$work`"", "`"$repo`"") -PassThru
    $env:WRITEDOWN_HOME = $saved.WRITEDOWN_HOME
    $env:WEBVIEW2_USER_DATA_FOLDER = $saved.WEBVIEW2_USER_DATA_FOLDER
    Write-Host "writedown pid $($app.Id); fixture $fixture"
    Write-Host "settle $settleSeconds s ..."
    $settle = Measure-Phase $app.Id $settleSeconds
    $rows += [pscustomobject]@{ Phase = 'settle'; Seconds = $settleSeconds; 'CPU % of one core' = '{0:n2}' -f $settle.Cpu; 'git starts' = $settle.Gits; Limit = '(none)'; Result = '' }
    if ($settle.WebView -eq 0) {
        Write-Host 'FAIL: no WebView2 process in the Writedown tree, so the frontend would go unmeasured'
        $failed = $true
    }

    Write-Host "phase A $Seconds s: churn outside the listed folders, git status and commit every 2 s ..."
    $writers += Start-Process pwsh -ArgumentList @('-NoProfile', '-File', "`"$writer`"", '-Repo', "`"$repo`"") -WindowStyle Hidden -PassThru
    $a = Measure-Phase $app.Id $Seconds
    $okA = $a.Cpu -lt 1.0 -and $a.Gits -eq 0
    $rows += [pscustomobject]@{ Phase = 'A'; Seconds = $Seconds; 'CPU % of one core' = '{0:n2}' -f $a.Cpu; 'git starts' = $a.Gits; Limit = '< 1%, 0 git'; Result = $(if ($okA) { 'pass' } else { 'FAIL' }) }

    Write-Host "phase B $phaseBSeconds s: also a write in the repository root every 500 ms ..."
    $writers += Start-Process pwsh -ArgumentList @('-NoProfile', '-File', "`"$writer`"", '-Repo', "`"$repo`"", '-RootChurn') -WindowStyle Hidden -PassThru
    $b = Measure-Phase $app.Id $phaseBSeconds
    $okB = $b.Cpu -lt 5.0 -and $b.Gits -eq 0
    $rows += [pscustomobject]@{ Phase = 'B'; Seconds = $phaseBSeconds; 'CPU % of one core' = '{0:n2}' -f $b.Cpu; 'git starts' = $b.Gits; Limit = '< 5%, 0 git'; Result = $(if ($okB) { 'pass' } else { 'FAIL' }) }
    if (-not ($okA -and $okB)) { $failed = $true }
    Write-Host "process tree: $($b.Procs) processes, $($b.WebView) of them WebView2"
}
catch {
    Write-Host "FAIL: $_"
    $failed = $true
}
finally {
    $env:WRITEDOWN_HOME = $saved.WRITEDOWN_HOME
    $env:WEBVIEW2_USER_DATA_FOLDER = $saved.WEBVIEW2_USER_DATA_FOLDER
    foreach ($w in $writers) { Stop-Process -Id $w.Id -Force -ErrorAction SilentlyContinue }
    if ($app) { taskkill /T /F /PID $app.Id 2>&1 | Out-Null }
}

$trips = @(Get-ChildItem -Path (Join-Path $appHome 'logs') -File -ErrorAction SilentlyContinue |
    Select-String -Pattern 'tripwire:' -SimpleMatch)
if ($trips.Count -gt 0) {
    Write-Host 'FAIL: the tripwire fired:'
    $trips | ForEach-Object { Write-Host "  $($_.Line)" }
    $failed = $true
}

$rows | Format-Table -AutoSize | Out-String -Width 120 | Write-Host

if ($KeepFixture) {
    Write-Host "fixture kept: $fixture"
}
else {
    # WebView2 can hold its data folder for a moment after the kill.
    foreach ($try in 1..10) {
        try { Remove-Item -LiteralPath $fixture -Recurse -Force; break } catch { Start-Sleep -Milliseconds 500 }
    }
    if (Test-Path -LiteralPath $fixture) { Write-Host "could not delete the fixture: $fixture" }
}

if ($failed) { Write-Host 'idle check: FAIL'; exit 1 }
Write-Host 'idle check: pass'
exit 0
