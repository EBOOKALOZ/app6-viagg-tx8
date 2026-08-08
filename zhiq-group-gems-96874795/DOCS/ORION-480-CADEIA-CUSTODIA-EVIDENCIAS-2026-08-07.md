<div align="center">

# CADEIA DE CUSTÓDIA DAS EVIDÊNCIAS

**Documento complementar:** `DOCS/ORION-480-ANEXOS-TECNICOS-A-F-AUDITORIA-REGRESSAO-2026-08-07.md`

</div>

---

# OBJETIVO

Registrar a origem, obtenção, preservação e utilização das evidências técnicas empregadas nos Anexos A-F da Auditoria de Regressão do ORION-480.

---

# ORIGEM DAS EVIDÊNCIAS

As evidências apresentadas nos Anexos A-F foram produzidas por **nova coleta técnica realizada em 07/08/2026**.

Não correspondem à captura original da auditoria executada em 06/08/2026.

Os registros da auditoria anterior não continham captura literal dos comandos executados, impossibilitando sua reprodução documental fiel.

---

# METODOLOGIA

Para obtenção das evidências foi adotado o seguinte procedimento:

* reprodução controlada dos cenários;
* utilização do ambiente atualmente implantado;
* execução de comandos SQL e REST reais;
* utilização de transações com `ROLLBACK` para operações de escrita sempre que possível;
* limpeza imediata dos artefatos temporários criados durante os testes;
* preservação dos resultados obtidos sem alteração posterior.

---

# EVIDÊNCIAS PRODUZIDAS

Foram obtidas:

* comandos executados;
* respostas HTTP;
* mensagens do PostgreSQL;
* evidências de bloqueio das vulnerabilidades corrigidas;
* evidência da vulnerabilidade P1 ainda existente;
* confirmação dos privilégios residuais identificados.

---

# INTEGRIDADE

Durante a coleta:

* nenhuma credencial foi registrada em texto claro;
* nenhum dado sensível foi incorporado aos documentos;
* os artefatos temporários produzidos pelos testes foram removidos ao término da validação.

---

# ARMAZENAMENTO

Os artefatos técnicos permanecem armazenados em:

```text
DOCS/evidencias/2026-08-07-anexos-regressao/
```

Esses arquivos constituem a evidência primária da presente coleta.

---

# VALIDADE

Os Anexos A-F devem ser interpretados como documentação da **coleta técnica realizada em 07/08/2026**, não como transcrição da auditoria executada em 06/08/2026.

Essa distinção preserva a fidelidade histórica da documentação e evita atribuir ao registro atual evidências que não foram capturadas na ocasião da auditoria original.

---

# CONCLUSÃO

A cadeia de custódia das evidências encontra-se preservada.

Os documentos produzidos refletem fielmente os resultados da nova coleta técnica, mantendo separação explícita entre:

* auditoria original;
* nova coleta de evidências;
* validação de regressão;
* documentação consolidada.

Essa abordagem assegura transparência metodológica, rastreabilidade e confiabilidade para futuras revisões técnicas e auditorias independentes.
