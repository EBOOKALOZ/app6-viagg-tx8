# ORION-AI-65 — Painel (Background Intelligence)

**Rota:** `/admin/orion-background` · **badge:** BACKGROUND · **ícone:** `Images` · **componente:** `src/pages/admin/AdminOrionBackground.tsx`.

Fonte única: `background_dashboard()` (RPC, `refetchInterval` 30s). Nada é recalculado no cliente — o painel só apresenta.

## Cabeçalho
- **Background Score médio** (verde ≥75 / âmbar ≥50 / vermelho) + nº na fila.
- Faixa de KPIs: projetos · fundos removidos · fundos criados · cenários · jobs concluídos · tempo médio.

## Abas

### 1. Dashboard
- Cartões: jobs pendentes / concluídos / falhos / score médio.
- **Cenários por categoria** (chips ordenados por volume).
- **Evolução 7 dias** (projetos, concluídos, pendentes, score, tempo) quando há histórico.

### 2. Cenários (biblioteca)
- Filtro por categoria.
- Card por cenário com **swatch de gradiente** (paleta do cenário), nome, selo PREMIUM, categoria, estilo, usos, score médio e amostras de cor.

### 3. Projetos
- Miniatura (resultado ou original), id + ref_tipo + categoria, nº de versões, status colorido e **Background Score**.

### 4. Fila / Jobs
- Distribuição por status e por tipo.
- Lista de jobs recentes com tentativas.
- Nota do contrato Edge: `bg_next_job` (claim) → `bg_complete_job` (url + métricas); jobs presos > 15 min voltam à fila (≤ 3×).

### 5. Config
- Cron, modelo de IA, motor.
- Aviso de segurança (funções de dados bloqueadas p/ anon; `bg_next_job`/`bg_complete_job` exclusivas da Edge; original v0 sempre preservado).
- **Declarado (Edge / futuro)** — lista explícita do que roda fora do banco, sem nada inventado.

## Notas de UX
- Paleta escura teal (identidade do Design Ecosystem, coerente com o painel Brand Identity AI-61).
- Responsivo (grid colapsa em telas pequenas; tabelas com `overflow-x-auto`).
