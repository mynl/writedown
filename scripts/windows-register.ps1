# Register writedown as available to open various file types.
#
# Point -Exe at the writedown.exe you actually want the shell to launch — an installed
# copy, or <repo>\target\release\writedown.exe after `npm run tauri build`. The default
# is the release build in this checkout. A path that does not exist is refused: the
# registry accepts it happily and you get silently broken "Open with" entries.
param(
    [string]$Exe
)
$ErrorActionPreference = 'Stop'

if (-not $Exe) {
    $repoRoot = Split-Path $PSScriptRoot -Parent
    $Exe = Join-Path $repoRoot 'target\release\writedown.exe'
}
$Exe = [IO.Path]::GetFullPath($Exe)
if (-not (Test-Path $Exe)) {
    throw "no writedown.exe at $Exe - run 'npm run tauri build', or pass -Exe <path>"
}

$DisplayName = 'Writedown'
$Extensions = '.md', '.qmd', '.txt', '.yaml', '.csv', '.json', '.py'

$ExeName = Split-Path $Exe -Leaf
$AppKey = "HKCU:\Software\Classes\Applications\$ExeName"

# Register the application and its open command.
New-Item "$AppKey\shell\open\command" -Force | Out-Null
Set-Item "$AppKey\shell\open\command" -Value "`"$Exe`" `"%1`""

New-ItemProperty `
    -Path $AppKey `
    -Name 'FriendlyAppName' `
    -Value $DisplayName `
    -PropertyType String `
    -Force | Out-Null

# Advertise it for the selected extensions.
New-Item "$AppKey\SupportedTypes" -Force | Out-Null

foreach ($Extension in $Extensions) {
    New-ItemProperty `
        -Path "$AppKey\SupportedTypes" `
        -Name $Extension `
        -Value '' `
        -PropertyType String `
        -Force | Out-Null

    New-Item `
        "HKCU:\Software\Classes\$Extension\OpenWithList\$ExeName" `
        -Force | Out-Null
}
