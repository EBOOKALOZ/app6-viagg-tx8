$base = 'f:\APP6 VIAGG-TX8\-tx8-viagg-analise-programador\zhiq-group-gems-96874795\src'
$results = @()
Get-ChildItem -Recurse $base -Include '*.ts','*.tsx' | ForEach-Object {
    try {
        $bytes = [IO.File]::ReadAllBytes($_.FullName)
        if ($bytes.Length -ge 2 -and $bytes[0] -eq 0xFF -and $bytes[1] -eq 0xFE) {
            $results += [PSCustomObject]@{
                File = $_.FullName
                LastWriteTime = $_.LastWriteTime
            }
        }
    } catch {}
}
if ($results.Count -eq 0) {
    Write-Host "No UTF-16 files found."
} else {
    $results | Format-Table -AutoSize
}
