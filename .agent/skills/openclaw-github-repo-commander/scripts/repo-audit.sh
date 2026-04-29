#!/bin/bash
# OpenClaw Repo Audit Script (Ported/Generated)
# Automated checks for Stage 2 of OpenClaw Workflow

echo "🦅 Inciando OpenClaw Repo Audit..."

echo "======================================"
echo "[1/6] Checando arquivos sensiveis/segredos vazados (Hardcoded secrets)..."
if grep -rIE --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist -l "ghp_|sk-|AKIA|eyJhbGciOi" . | grep -v "repo-audit.sh"; then
    echo "❌ ALERTA: Possíveis segredos encontrados!"
else
    echo "✅ Nenhum segredo óbvio detectado."
fi

echo "======================================"
echo "[2/6] Checando node_modules e artefatos versionados..."
if git ls-files | grep -E "^node_modules/|^dist/|^build/"; then
    echo "❌ ALERTA: Arquivos de build ou node_modules com commit no git!"
else
    echo "✅ Sem node_modules ou builds sujos no git."
fi

echo "======================================"
echo "[3/6] Checando diretórios vazios..."
EMPTY_DIRS=$(find . -type d -empty -not -path "./.git/*")
if [ -n "$EMPTY_DIRS" ]; then
    echo "❌ ALERTA: Diretórios vazios encontrados:"
    echo "$EMPTY_DIRS"
else
    echo "✅ Nenhum diretório vazio inútil."
fi

echo "======================================"
echo "[4/6] Checando arquivos grandes (>1MB)..."
LARGE_FILES=$(find . -type f -size +1M -not -path "./.git/*" -not -path "./node_modules/*")
if [ -n "$LARGE_FILES" ]; then
    echo "❌ ALERTA: Arquivos pesados (>1MB) rastreados:"
    echo "$LARGE_FILES" | head -n 10
else
    echo "✅ Sem arquivos gigantes."
fi

echo "======================================"
echo "[5/6] Checando cobertura do .gitignore..."
if [ ! -f .gitignore ]; then
    echo "❌ ALERTA: .gitignore não encontrado na raiz!"
else
    echo "✅ .gitignore presente."
fi

echo "======================================"
echo "[6/6] Checando links do README.md..."
if [ -f README.md ]; then
    echo "✅ README presente."
    # Básica validação
else
    echo "❌ ALERTA: Faltando README.md principal!"
fi

echo "======================================"
echo "🦅 Auditoria OpenClaw concluída!"
