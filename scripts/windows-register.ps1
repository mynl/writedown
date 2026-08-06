# register writedown as available to open various file types 
$Exe = 'C:\S\bin\writedown.exe'
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
