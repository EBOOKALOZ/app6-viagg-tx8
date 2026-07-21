#!/usr/bin/env bash
# ORION-AI-75.2 — runner READ-ONLY da rotina de reconciliação.
# Uso: bash run-reconciliation.sh
set -euo pipefail
SCRATCH="C:/Users/angel/AppData/Local/Temp/claude/f--APP6-VIAGG-TX8/528313ea-5ce1-43d8-8c20-81b783002680/scratchpad"
SQL="f:/APP6 VIAGG-TX8/-tx8-viagg-analise-programador/zhiq-group-gems-96874795/DOCS/orion-ai-75-reconciliation.sql"
TOKEN=$(cat "$SCRATCH/sbp.txt")
node -e "const fs=require('fs');fs.writeFileSync('$SCRATCH/_recon.json',JSON.stringify({query:fs.readFileSync(process.argv[1],'utf8')}));" "$SQL"
curl -s --max-time 90 -X POST "https://api.supabase.com/v1/projects/broifhfqmnzqoongtokm/database/query" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  --data-binary @"$SCRATCH/_recon.json" | node -e "
let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
  try{
    const r=JSON.parse(d)[0].r;
    console.log('=== ORION-AI-75.2 RECONCILIAÇÃO (read-only) ===');
    console.log('DETECÇÃO:',JSON.stringify(r.etapa1_deteccao));
    if(r.aguardando){console.log('\\nSTATUS: Aguardando primeira movimentação financeira real.');console.log('VEREDITO:',r.veredito);return;}
    console.log('ETAPA2 ledger:',JSON.stringify(r.etapa2_ledger));
    console.log('ETAPA3 cobrança:',JSON.stringify(r.etapa3_cobranca));
    console.log('ETAPA4 idempotência:',JSON.stringify(r.etapa4_idempotencia));
    console.log('ETAPA5 logs:',JSON.stringify(r.etapa5_logs));
    console.log('ETAPA6 consistência:',JSON.stringify(r.etapa6_consistencia));
    console.log('\\nVEREDITO:',r.veredito);
  }catch(e){console.log('ERRO/OUTAGE — resposta bruta:',d.slice(0,300));}
});"
