/**
 * M58.0 · Plataforma de Dashboards Executivos Viagg — barrel oficial.
 * Módulos visuais (M58.1+) importam SOMENTE daqui.
 */

export { tokens, stateColors, typography, spacing, grid, borders, motion } from './core/tokens';
export { ROLES, can, hasRole, parseAuthzProfile, EMPTY_AUTHZ } from './core/roles';
export type { Role, Resource, AuthzProfile } from './core/roles';
export { DATASET_REGISTRY, getDataset, validateRegistry, generateRegistryDocs } from './core/registry';
export type { DatasetDef, DatasetKey } from './core/registry';
export { callDataset, isEmptyDataset, DashboardApiError } from './core/api';
export { cache, CACHE_ENABLED } from './core/cache';
export { telemetry } from './core/telemetry';
export { notifications } from './core/notifications';
export type { DashboardEvent } from './core/notifications';
export { EXPORTERS, getExporter } from './core/exporters';
export type { Exporter, ExportFormat, ExportRequest } from './core/exporters';

export { DashboardProvider, useDashboard, usePermissions } from './state/DashboardProvider';
export type { DashboardState, DateWindow } from './state/DashboardProvider';
export { useDataset } from './hooks/useDataset';
export type { UseDatasetResult } from './hooks/useDataset';

export { NAV_TREE, breadcrumbsFor, SHORTCUTS } from './layout/navigation';
export type { NavSection, Breadcrumb } from './layout/navigation';
export {
  DashboardLayout,
  DashboardHeader,
  DashboardSidebar,
  WidgetGrid,
  WidgetShell,
} from './layout/DashboardLayout';
export type { WidgetPlacement } from './layout/DashboardLayout';

export { KpiCard, MetricCard, HealthCard, AlertCard, IncidentCard, TrendCard } from './components/cards';
export { StatusBadge, ProgressIndicator, Gauge, Timeline, stateKeyFrom } from './components/indicators';
export type { TimelineEntry } from './components/indicators';
export {
  LoadingState,
  SkeletonBlock,
  EmptyState,
  ErrorState,
  DatasetBoundary,
} from './components/feedback';
export { FiltersBar, SearchInput, ExportButton, RefreshButton } from './components/controls';
export type { FilterOption } from './components/controls';

// Páginas (M58.1+)
export { default as ExecutiveDashboard } from './pages/executive/ExecutiveDashboard';
export { ExecutiveTopBar } from './pages/executive/ExecutiveTopBar';
export { default as OperationsDashboard } from './pages/operational/OperationsDashboard';
export {
  OperationalTopBar, HealthOverview, ComponentGrid, ComponentTable,
  QueuePanel, IncidentPanel,
} from './pages/operational/components';
export { default as GovernanceDashboard } from './pages/governance/GovernanceDashboard';
export {
  AnswerBoard, CatalogTable, QualityPanel, LineagePanel, CertificationPanel,
} from './pages/governance/components';

// Shell definitiva (M58.5) — rota canônica /dashboards/*
export { default as DashboardShell } from './shell/DashboardShell';
export { DashboardHome } from './shell/DashboardHome';
export { NarrativePanel, buildNarrativeInput } from './shell/NarrativePanel';
export type { NarrativeInput } from './shell/NarrativePanel';

// M59.1 — Enterprise Narrative Engine (contrato DEFINITIVO do Programa M59)
export { NarrativeProvider, useNarrative } from './narrative/NarrativeProvider';
export { buildNarrativeContext } from './narrative/builder';
export {
  runNarrativeEngine, validateNarrativeInput, getNarrativeTemplate,
  NARRATIVE_TEMPLATE_REGISTRY, narrativeEngineInvariants,
} from './narrative/engine';
export type { NarrativeEngineOutput, NarrativeTemplate } from './narrative/engine';
export type {
  NarrativeInput as NarrativeInputV2, NarrativeEvidence, NarrativeAvailability,
  NarrativeValidation, NarrativeProblem, NarrativeRawSources, NarrativeSectionKey,
} from './narrative/types';
export { NARRATIVE_SECTION_ORDER, NARRATIVE_REQUIRED_DATASETS } from './narrative/types';

// M59.2 — Executive Narrative AI (narrador oficial + adaptador generativo)
export {
  narrateExecutiveDeterministic, pickSituationTemplate, diffNarrativeInputs,
  reportInvariants, SITUATION_TEMPLATES,
} from './narrative/narrators/executiveDeterministic';
export type {
  NarrativeReport, NarrativeReportSection, NarrativeSentence, SituationTemplateKey,
} from './narrative/narrators/executiveDeterministic';
export {
  narrateExecutive, narrateHybrid, numberGuard, edgeGatewayTransport,
} from './narrative/narrators/executiveGenerative';
// M59.3 — Operations Narrative AI
export {
  narrateOperations, narrateOperationsDeterministic, pickOperationsTemplate,
  computePriorities, computeRecommendations, diffOperationalSnapshots,
  buildOperationsSections, OPERATIONS_TEMPLATES, OPERATIONS_SECTION_COUNT,
} from './narrative/narrators/operationsNarrator';
export type {
  OperationsTemplateKey, OperationalPriority, OperationalRecommendation,
  OperationsNarrativeResult,
} from './narrative/narrators/operationsNarrator';
// M59.4 — Predictive Narrative AI
export {
  narratePredictive, narratePredictiveDeterministic, classifySeries,
  componentTrends, alertsTrend, detectRisks, detectOpportunities,
  pickPredictiveTemplate, buildPredictiveSections,
  PREDICTIVE_TEMPLATES, PREDICTIVE_SECTION_COUNT, TREND_METHOD, PROJECTION_MIN_POINTS,
} from './narrative/narrators/predictiveNarrator';
export type {
  TrendLabel, TrendConfidence, TrendReading, ComponentTrend,
  PredictiveFinding, PredictiveTemplateKey, PredictiveNarrativeResult,
} from './narrative/narrators/predictiveNarrator';
// M59.5 — Strategic Narrative AI (Composer)
export {
  composeStrategic, narrateStrategic, collectSignals, findConsensusAndDivergence,
  consolidatePriorities, deriveDecisions, pickStrategicTemplate, topicOf,
  compositionInvariants, STRATEGIC_TEMPLATES, STRATEGIC_SECTION_COUNT,
} from './narrative/narrators/strategicComposer';
export type {
  StrategicResult, StrategicPriority, StrategicDecision, StrategicSignal,
  ConsensusFinding, Divergence, StrategicTemplateKey, NarratorOrigin,
} from './narrative/narrators/strategicComposer';
// M59.6 — Decision Intelligence
export {
  ingestStrategicDecisions, transitionDecision, canTransition, allowedTransitions,
  dependencyView, registerObservedImpact, takeDecisionSnapshot, compareDecisionSnapshots,
  decisionInvariants, decisionId, DECISION_STATUSES,
} from './narrative/decisions/decisionEngine';
export type {
  Decision, DecisionStatus, DecisionEvent, DecisionSnapshot, ImpactSituation, DependencyView,
} from './narrative/decisions/decisionEngine';
export { DecisionPanel } from './narrative/decisions/DecisionPanel';
// M59.7 — Action Intelligence
export {
  createActionPlans, transitionAction, canTransitionAction, allowedActionTransitions,
  completeStep, assignResponsible, removeResponsible, actionDependencyView,
  takeActionSnapshot, compareActionSnapshots, actionInvariants, deriveSteps, ACTION_STATUSES,
} from './narrative/actions/actionEngine';
export type {
  ActionPlan, ActionStatus, ActionStep, ActionEvent, ActionSnapshot, Responsible,
} from './narrative/actions/actionEngine';
export { ActionPanel } from './narrative/actions/ActionPanel';
// M59.8 — Execution Intelligence (Composer final)
export {
  composeExecution, buildComparisons, detectExecutionDivergences, buildIndicators,
  executionInvariants, EXECUTION_SECTION_COUNT,
} from './narrative/execution/executionComposer';
export type {
  ExecutionResult, ExecutionComparison, ExecutionDivergence, ExecutionIndicators,
} from './narrative/execution/executionComposer';
export { ExecutionPanel } from './narrative/execution/ExecutionPanel';
export type { GenerativeTransport, GenerativePayload, GenerativeResult } from './narrative/narrators/executiveGenerative';
export { NARRATIVE_GENERATIVE_ENABLED } from './narrative/config';
export { GlobalSearch, SessionBadge } from './shell/GlobalSearch';
export { searchSections, sectionForPath } from './layout/navigation';
