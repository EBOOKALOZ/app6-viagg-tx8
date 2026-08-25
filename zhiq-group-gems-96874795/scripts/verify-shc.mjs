/**
 * SHC Continuous Gate — bloqueia `vite build` se algum módulo estiver
 * reprovado no Decision Engine (ASHC v2.1).
 *
 * FAIL CLOSED (ASHC FASE 2 · 2026-07-27):
 *   - sem credenciais            → bloqueia
 *   - erro de consulta ao banco  → bloqueia
 *   - zero módulos cadastrados   → bloqueia (antes: aprovava silenciosamente)
 *   - módulo sem run / sem decisão → bloqueia
 * As decisões lidas aqui são graváveis apenas pelo motor oficial server-side
 * (RPC shc_run_module_audit, EXECUTE restrito a service_role).
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Carrega variáveis do .env manualmente se não estiverem no process.env
const loadEnv = () => {
  try {
    const envPaths = ['.env', '.env.local', '.env.staging'];
    for (const envName of envPaths) {
      const envPath = path.resolve(process.cwd(), envName);
      if (fs.existsSync(envPath)) {
        const envFile = fs.readFileSync(envPath, 'utf8');
        envFile.split('\n').forEach(line => {
          const trimmedLine = line.trim();
          const match = trimmedLine.match(/^([^#\s]+)\s*=\s*(.*)$/);
          if (match) {
            const key = match[1].trim();
            let value = match[2].trim();
            if (value.startsWith('"') && value.endsWith('"')) {
              value = value.slice(1, -1);
            }
            if (!process.env[key] && value !== '') {
              process.env[key] = value;
            }
          }
        });
      }
    }
  } catch (error) {
    console.warn("Aviso: Falha ao carregar .env - ", error.message);
  }
};

loadEnv();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("ERRO [SHC GATE]: Credenciais do Supabase não encontradas. Verifique VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function verifySHC() {
  console.log("==================================================");
  console.log("  Iniciando Verificação do SHC (Continuous Gate)  ");
  console.log("==================================================");

  try {
    const { data: modules, error: modError } = await supabase
      .from('shc_modules')
      .select('id, name, status, quality_score');

    if (modError) throw modError;

    if (!modules || modules.length === 0) {
      console.error("\n🚫 DEPLOY CANCELADO [FAIL CLOSED]: nenhum módulo SHC cadastrado — sem base de homologação não há autorização de build.");
      process.exit(1);
    }

    // Última run por módulo em UMA consulta (antes: 1 consulta por módulo)
    const { data: runs, error: runsError } = await supabase
      .from('shc_runs')
      .select('id, module_id, status, result, report_json, created_at')
      .order('created_at', { ascending: false })
      .limit(500);

    if (runsError) {
      console.error("\n🚫 DEPLOY CANCELADO [FAIL CLOSED]: falha ao consultar execuções:", runsError.message);
      process.exit(1);
    }

    const latestByModule = new Map();
    for (const run of runs ?? []) {
      if (run.module_id && !latestByModule.has(run.module_id)) {
        latestByModule.set(run.module_id, run);
      }
    }

    let allClear = true;
    let warningsCount = 0;

    for (const mod of modules) {
      const run = latestByModule.get(mod.id);

      let decision = 'FAILED';
      let reason = 'Nenhuma execução registrada (fail closed).';
      if (run) {
        decision = run.report_json?.decision || (run.status === 'passed' ? 'APPROVED' : 'FAILED');
        reason = run.report_json?.reason || 'Sem histórico detalhado';
      }
      const allowed = decision === 'APPROVED' || decision === 'APPROVED_WITH_WARNINGS';

      if (!allowed) {
        console.error(`\n❌ [BLOQUEIO] Módulo: ${mod.name} | Decisão: ${decision === 'REVIEW_REQUIRED' ? 'REVIEW_REQUIRED' : 'FAILED'}`);
        console.error(`   Motivo: ${reason}`);
        allClear = false;
      } else if (decision === 'APPROVED_WITH_WARNINGS') {
        console.log(`\n🟡 [WARNING] Módulo: ${mod.name} | Decisão: APPROVED_WITH_WARNINGS`);
        warningsCount++;
      } else {
        console.log(`\n✅ [OK] Módulo: ${mod.name} | Decisão: APPROVED`);
      }
    }

    if (!allClear) {
      console.error("\n🚫 DEPLOY CANCELADO: O Decision Engine identificou módulos sem aprovação vigente.");
      process.exit(1);
    }

    console.log(`\n🌟 SUCESSO: O Decision Engine autorizou o deploy de todos os ${modules.length} módulos.`);
    if (warningsCount > 0) {
      console.log(`⚠️ Nota: Foram registrados warnings em ${warningsCount} módulo(s).`);
    }
    console.log("\n🚀 Permissão concedida para Build de Produção.");
    // Wait briefly for Supabase handles to close before exiting to prevent async handle crash
    setTimeout(() => { process.exit(0); }, 200);

  } catch (err) {
    console.error("\n🚫 DEPLOY CANCELADO [FAIL CLOSED]: erro fatal ao verificar SHC no banco:", err?.message ?? err);
    process.exit(1);
  }
}

verifySHC();
