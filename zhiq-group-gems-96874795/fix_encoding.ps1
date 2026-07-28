$base = 'f:\APP6 VIAGG-TX8\-tx8-viagg-analise-programador\zhiq-group-gems-96874795\src'
$fixed = 0
Get-ChildItem -Recurse $base -Include '*.ts','*.tsx' | ForEach-Object {
    try {
        $bytes = [IO.File]::ReadAllBytes($_.FullName)
        if ($bytes.Length -ge 2 -and $bytes[0] -eq 0xFF -and $bytes[1] -eq 0xFE) {
            # Read as UTF-16 LE (remove BOM by using encoding)
            $content = [IO.File]::ReadAllText($_.FullName, [Text.Encoding]::Unicode)
            # Write as UTF-8 without BOM
            [IO.File]::WriteAllText($_.FullName, $content, (New-Object Text.UTF8Encoding $false))
            Write-Host "Converted to UTF-8: $($_.FullName)"
            $fixed++
        }
    } catch {
        Write-Host "ERROR on $($_.FullName): $_"
    }
}
Write-Host ""
Write-Host "Total files converted: $fixed"
