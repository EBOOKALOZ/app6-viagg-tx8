param()

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "🦅 Iniciando OpenClaw Repo Audit..." -ForegroundColor Cyan

Write-Host "======================================"
Write-Host "[1/6] Checando arquivos sensiveis/segredos vazados (Hardcoded secrets)..."
try {
    $secrets = git grep -iE "ghp_|sk-|AKIA|eyJhbGciOi" 2>$null | Select-Object -First 1
    if ($secrets) {
        Write-Host "❌ ALERTA: Possíveis segredos encontrados!" -ForegroundColor Red
    } else {
        Write-Host "✅ Nenhum segredo óbvio detectado." -ForegroundColor Green
    }
} catch {
    Write-Host "⚠️ Erro ao verificar segredos com git grep." -ForegroundColor Yellow
}

Write-Host "======================================"
Write-Host "[2/6] Checando node_modules e artefatos versionados..."
try {
    $gitfiles = git ls-files 2>$null
    $dirty = $gitfiles | Where-Object { $_ -match "^node_modules/" -or $_ -match "^dist/" -or $_ -match "^build/" }
    if ($dirty) {
        Write-Host "❌ ALERTA: Arquivos de build ou node_modules com commit no git!" -ForegroundColor Red
    } else {
        Write-Host "✅ Sem node_modules ou builds sujos no git." -ForegroundColor Green
    }
} catch {
    Write-Host "⚠️ Não foi possível testar arquivos rastreados no git." -ForegroundColor Yellow
}

Write-Host "======================================"
Write-Host "[3/6] Checando arquivos grandes no controle (>1MB)..."
try {
    # Lista arquivos monitorados pelo git ordenados pelo tamanho para achar pesado
    $largeFiles = git ls-tree -r HEAD -l 2>$null | 
        Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | 
        ForEach-Object { 
            # O output é algo como "100644 blob hash size filepath"
            $parts = $_ -split '\s+', 5
            if ($parts.Count -ge 5 -and [long]::TryParse($parts[3], [ref]0)) {
                $sizeMB = [long]$parts[3] / 1MB
                if ($sizeMB -gt 1) {
                    [PSCustomObject]@{ File = $parts[4]; SizeMB = [math]::Round($sizeMB, 2) }
                }
            }
        }
    if ($largeFiles) {
        Write-Host "❌ ALERTA: Arquivos rastreados maiores que 1MB:" -ForegroundColor Red
        $largeFiles | Select-Object -First 10 | ForEach-Object { Write-Host "  $(`$_.File) ($(`$_.SizeMB) MB)" }
    } else {
        Write-Host "✅ Sem arquivos gigantes no repositório." -ForegroundColor Green
    }
} catch {
    Write-Host "⚠️ Não foi possível testar arquivos grandes no git." -ForegroundColor Yellow
}

Write-Host "======================================"
Write-Host "[4/6] Checando cobertura do .gitignore..."
if (!(Test-Path ".gitignore")) {
    Write-Host "❌ ALERTA: .gitignore não encontrado na raiz!" -ForegroundColor Red
} else {
    Write-Host "✅ .gitignore presente." -ForegroundColor Green
}

Write-Host "======================================"
Write-Host "🦅 Auditoria OpenClaw concluída!" -ForegroundColor Cyan
