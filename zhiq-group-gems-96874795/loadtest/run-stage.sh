#!/usr/bin/env bash
# ORION-480 — Executa UMA etapa da matriz de progressão.
#
# Regra:
#   Cada etapa roda isoladamente.
#   Nenhuma etapa seguinte é iniciada automaticamente.
#
# Uso:
#   ./loadtest/run-stage.sh D1-1K --dry-run
#   ./loadtest/run-stage.sh D1-1K
#   ./loadtest/run-stage.sh S0 --dry-run
#   ./loadtest/run-stage.sh S0
#
# Pré-requisitos:
#   1. bash
#   2. node
#   3. k6
#   4. loadtest/config/.env.staging preenchido
#   5. seed de staging preparado
#   6. aprovação explícita da etapa anterior, exceto S0 e D1-1K

set -euo pipefail

STAGE="${1:-}"
DRY_RUN="${2:-}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

PROGRESSION_FILE="$SCRIPT_DIR/config/progression.json"
DIAGNOSTIC_FILE="$SCRIPT_DIR/config/diagnostic-1k.json"
ENV_FILE="$SCRIPT_DIR/config/.env.staging"
K6_SCRIPT="$SCRIPT_DIR/k6/main.js"

# ------------------------------------------------------------
# 1. Validar argumento
# ------------------------------------------------------------

if [ -z "$STAGE" ]; then
  echo "Uso: $0 <STAGE_ID> [--dry-run]"
  echo "Etapas válidas: D1-1K S0 S1 S2 S3 S4 S5 S6 S7 S8 S9 S10"
  exit 1
fi

# ------------------------------------------------------------
# 2. Validar arquivos
# ------------------------------------------------------------

if [ ! -f "$PROGRESSION_FILE" ]; then
  echo "ERRO: matriz de progressão não encontrada:"
  echo "  $PROGRESSION_FILE"
  exit 1
fi

if [ "$STAGE" = "D1-1K" ] && [ ! -f "$DIAGNOSTIC_FILE" ]; then
  echo "ERRO: configuração do diagnóstico não encontrada:"
  echo "  $DIAGNOSTIC_FILE"
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "ERRO: arquivo de ambiente não encontrado:"
  echo "  $ENV_FILE"
  exit 1
fi

if [ ! -f "$K6_SCRIPT" ]; then
  echo "ERRO: script k6 não encontrado:"
  echo "  $K6_SCRIPT"
  exit 1
fi

# ------------------------------------------------------------
# 3. Carregar .env.staging
# ------------------------------------------------------------

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

# ------------------------------------------------------------
# 4. Validar variáveis obrigatórias
# ------------------------------------------------------------

REQUIRED_VARS=(
  BASE_URL
  SUPABASE_URL
  SUPABASE_ANON_KEY
  I_UNDERSTAND_THIS_GENERATES_TRAFFIC
  I_CONFIRM_STAGING
)

for VAR_NAME in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!VAR_NAME:-}" ]; then
    echo "ERRO: variável obrigatória ausente ou vazia:"
    echo "  $VAR_NAME"
    echo ""
    echo "Arquivo:"
    echo "  $ENV_FILE"
    exit 1
  fi
done

# ------------------------------------------------------------
# 5. Validar confirmações de segurança
# ------------------------------------------------------------

if [ "$I_UNDERSTAND_THIS_GENERATES_TRAFFIC" != "yes" ]; then
  echo "ERRO: I_UNDERSTAND_THIS_GENERATES_TRAFFIC deve ser 'yes'."
  exit 1
fi

if [ "$I_CONFIRM_STAGING" != "yes" ]; then
  echo "ERRO: I_CONFIRM_STAGING deve ser 'yes'."
  exit 1
fi

# ------------------------------------------------------------
# 6. Ler configuração da etapa
# ------------------------------------------------------------

if [ "$STAGE" = "D1-1K" ]; then
  STAGE_FILE="$DIAGNOSTIC_FILE"

  STAGE_JSON="$(
    node -e '
      const fs = require("fs");

      const file = process.argv[1];
      const data = JSON.parse(fs.readFileSync(file, "utf8"));

      process.stdout.write(JSON.stringify(data));
    ' "$STAGE_FILE"
  )"
else
  STAGE_FILE="$PROGRESSION_FILE"

  STAGE_JSON="$(
    node -e '
      const fs = require("fs");

      const file = process.argv[1];
      const stageId = process.argv[2];

      const data = JSON.parse(fs.readFileSync(file, "utf8"));
      const stage = data.stages.find(s => s.stage === stageId);

      if (!stage) {
        console.error("Etapa " + stageId + " não encontrada.");
        process.exit(1);
      }

      process.stdout.write(JSON.stringify(stage));
    ' "$STAGE_FILE" "$STAGE"
  )"
fi

USERS="$(
  node -e 'console.log(JSON.parse(process.argv[1]).users)' "$STAGE_JSON"
)"

DURATION="$(
  node -e 'console.log(JSON.parse(process.argv[1]).duration)' "$STAGE_JSON"
)"

RAMP_UP="$(
  node -e 'console.log(JSON.parse(process.argv[1]).rampUp)' "$STAGE_JSON"
)"

RAMP_DOWN="$(
  node -e 'console.log(JSON.parse(process.argv[1]).rampDown)' "$STAGE_JSON"
)"

LABEL="$(
  node -e 'console.log(JSON.parse(process.argv[1]).label)' "$STAGE_JSON"
)"

REALTIME_VU_RATIO="$(
  node -e '
    const config = JSON.parse(process.argv[1]);
    console.log(config.realtimeVUs === 0 ? "0" : "0.02");
  ' "$STAGE_JSON"
)"

# ------------------------------------------------------------
# 7. Mostrar configuração
# ------------------------------------------------------------

echo ""
echo "=============================================="
echo " ORION-480 — ETAPA $STAGE"
echo "=============================================="
echo "Label:       $LABEL"
echo "USERS:       $USERS"
echo "DURATION:    $DURATION"
echo "RAMP_UP:     $RAMP_UP"
echo "RAMP_DOWN:   $RAMP_DOWN"
echo "REALTIME:    $REALTIME_VU_RATIO"
echo ""
echo "Configuração:"
echo "  $STAGE_FILE"
echo ""
echo "Ambiente:"
echo "BASE_URL:    $BASE_URL"
echo "SUPABASE_URL:$SUPABASE_URL"
echo "ANON_KEY:    PRESENTE"
echo "STAGING:     CONFIRMADO"
echo "=============================================="
echo ""

# ------------------------------------------------------------
# 8. Verificar k6
# ------------------------------------------------------------

if ! command -v k6 >/dev/null 2>&1; then
  echo "ERRO: k6 não está instalado ou não está no PATH."
  exit 1
fi

echo "k6:"
k6 version
echo ""

# ------------------------------------------------------------
# 9. Dry-run
# ------------------------------------------------------------

if [ "$DRY_RUN" = "--dry-run" ]; then

  echo "=============================================="
  echo " DRY-RUN"
  echo "=============================================="
  echo ""
  echo "Comando que seria executado:"
  echo ""
  echo "k6 run $K6_SCRIPT \\"
  echo "  -e BASE_URL=$BASE_URL \\"
  echo "  -e SUPABASE_URL=$SUPABASE_URL \\"
  echo "  -e SUPABASE_ANON_KEY=<REDACTED> \\"
  echo "  -e I_UNDERSTAND_THIS_GENERATES_TRAFFIC=yes \\"
  echo "  -e I_CONFIRM_STAGING=yes \\"
  echo "  -e USERS=$USERS \\"
  echo "  -e DURATION=$DURATION \\"
  echo "  -e RAMP_UP=$RAMP_UP \\"
  echo "  -e RAMP_DOWN=$RAMP_DOWN \\"
  echo "  -e REALTIME_VU_RATIO=$REALTIME_VU_RATIO \\"
  echo "  -e SCENARIO=all \\"
  echo "  -e STAGE_LABEL=${STAGE}-${LABEL}"
  echo ""
  echo "[--dry-run] Nada foi executado."
  exit 0
fi

# ------------------------------------------------------------
# 10. Confirmação humana final
# ------------------------------------------------------------

echo "ATENÇÃO:"
echo ""
echo "Esta execução vai gerar tráfego REAL contra:"
echo "$BASE_URL"
echo ""
echo "Supabase:"
echo "$SUPABASE_URL"
echo ""
echo "Etapa:"
echo "$STAGE — $LABEL"
echo ""
echo "Usuários:"
echo "$USERS"
echo ""
echo "Duração:"
echo "$DURATION"
echo ""
echo "Ramp-up:"
echo "$RAMP_UP"
echo ""
echo "Ramp-down:"
echo "$RAMP_DOWN"
echo ""
echo "Realtime VU ratio:"
echo "$REALTIME_VU_RATIO"
echo ""

read -r -p "Confirma execução da etapa $STAGE? Digite 'sim' para prosseguir: " CONFIRM

if [ "$CONFIRM" != "sim" ]; then
  echo ""
  echo "Cancelado pelo usuário."
  exit 1
fi

# ------------------------------------------------------------
# 11. Executar k6
# ------------------------------------------------------------

echo ""
echo "=============================================="
echo " INICIANDO ORION-480 / $STAGE"
echo "=============================================="
echo ""

k6 run \
  -e "BASE_URL=$BASE_URL" \
  -e "SUPABASE_URL=$SUPABASE_URL" \
  -e "SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY" \
  -e "I_UNDERSTAND_THIS_GENERATES_TRAFFIC=$I_UNDERSTAND_THIS_GENERATES_TRAFFIC" \
  -e "I_CONFIRM_STAGING=$I_CONFIRM_STAGING" \
  -e "USERS=$USERS" \
  -e "DURATION=$DURATION" \
  -e "RAMP_UP=$RAMP_UP" \
  -e "RAMP_DOWN=$RAMP_DOWN" \
  -e "REALTIME_VU_RATIO=$REALTIME_VU_RATIO" \
  -e "SCENARIO=all" \
  -e "STAGE_LABEL=${STAGE}-${LABEL}" \
  "$K6_SCRIPT"

EXIT_CODE=$?

echo ""
echo "=============================================="
echo " ORION-480 / $STAGE FINALIZADO"
echo " Exit code: $EXIT_CODE"
echo "=============================================="
echo ""

exit "$EXIT_CODE"