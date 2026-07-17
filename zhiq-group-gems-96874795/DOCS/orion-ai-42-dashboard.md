# ORION-AI-42 — Identity & Access AI · Dashboard

> **`/admin/orion-identity`** · badge **IDENTITY** (sidebar ORION AI CENTER,
> ícone Fingerprint) · fonte única: RPC `identity_dashboard()` (auto-refresh 60s).
> Página: `src/pages/admin/AdminOrionIdentity.tsx`.

## Estrutura — 7 abas, 33 painéis

### Header (6 painéis)
1. **Identity Integrity Index (III)** — destaque com cor por faixa
2. IS médio (chip)
3. Sessões ativas · 4. Sessões risco alto · 5. Logins hoje · 6. Tentativas negadas + Dispositivos + MFA hoje (cards rápidos)

### Aba Visão Geral (8 painéis)
7. Identity Score (IS) médio — com explicação
8. Access Trust Score (ATS) médio
9. Session Risk (SRS) médio — cor invertida (risco)
10. Device Confidence (DCS) médio
11. MFA Adoption Rate (MAR) — **0% real, declarado**
12. Usuários (confiáveis / observação / bloqueados)
13. Estatísticas 7 dias (tabela: logins, suspeitos, sessões, risco alto, disp. novos, IS/ATS/SRS/DCS/III)
14. **Lacunas declaradas** (âmbar — nunca inventamos sinal)

### Aba Sessões (5 painéis)
15. Ativas · 16. Encerradas 7d · 17. Expiradas
18. Lista de sessões ativas por risco (SRS, navegador/SO, IP, horas ativa, AAL/MFA, dispositivo, evidências expandíveis)
19. Nota declarada: geolocalização por IP sem fonte; encerrar sessão = ação humana

### Aba Dispositivos (7 painéis)
20. Conhecidos · 21. Novos 7d · 22. Bloqueados · 23. DCS médio
24. Por navegador (barras) · 25. Por sistema operacional (barras)
26. Lista de dispositivos (DCS, sessões, visto de/até, evidências, **ações: bloquear/desbloquear** — humanas, auditadas, reversíveis)

### Aba Identidade (5 painéis)
27. Confiáveis · Em observação · Bloqueados (cards)
28. Por nível de confiança (barras)
29. Lista de identidades (menor IS primeiro: IS/ATS, tipo, perfis múltiplos, roles, ADMIN chip, evidências com componentes do score)

### Aba Administração (3 painéis)
30. Administradores / Sessões admin ativas / Alterações de permissão 30d
31. Auditoria administrativa (permissao_alterada, admin_sem_mfa, com evidências antes/depois)
32. Nota: elevação temporária de privilégio (política `privilege_elevation`, concessão humana)

### Aba Eventos (2 painéis)
— Eventos por tipo 30d (barras) · Lista de eventos relevantes (média+ ou
administrativos) com evidências e **ações: Confirmar / Falso positivo / Resolver**

### Aba Políticas (2 painéis)
33. Políticas (`identity_politica_v1`: ação, perfil, score mínimo, MFA, aprovação
automática×humana, ativa) · Trilha de alterações (antes/depois, rollback = reaplicar)

## Cores e semântica

- Scores de confiança (IS/ATS/DCS): verde ≥80 · lima ≥60 · âmbar ≥40 · vermelho <40
- Risco (SRS): invertido (vermelho ≥80 … verde <40)
- Severidade: crítica (vermelho) · alta (âmbar) · média (amarelo) · baixa (cinza)
- Status: registrada/detectada/em_analise/confirmada/falso_positivo/resolvida
- Tema do header: índigo (identidade) — Fraud usa vermelho, Cyber usa vermelho-escuro

## Regras de honestidade do painel

- Todo score exibe as evidências (componentes + pesos + fonte) no expansível.
- MAR aparece como 0% com a explicação "MFA ainda não adotado (DECLARADO)".
- Lacunas declaradas têm painel próprio na Visão Geral.
- Ações de alto impacto no painel são explícitas quanto a serem humanas/reversíveis.
