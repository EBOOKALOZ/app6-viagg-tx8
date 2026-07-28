/**
 * 🧠 DemandIntelligenceAgent — Orchestrator
 *
 * Analyzes product demand by neighborhood, detects viral trends,
 * recommends products to stores, and optimizes campaigns.
 *
 * Pipeline: analyze → detect viral → recommend → optimize
 */
import type { AgentRunResult } from "../growthAgentTypes";
import { analyzeNeighborhoodDemand } from "./analyzeNeighborhoodDemand";
import { detectViralProducts } from "./detectViralProducts";
import { recommendProductsToStores } from "./recommendProductsToStores";
import { optimizePostingCampaigns } from "./optimizePostingCampaigns";
import { agentBus } from "../agentBus";

export async function runDemandIntelligenceAgent(city: string): Promise<AgentRunResult> {
  const startTime = Date.now();
  const logs: string[] = [];
  const signalsBefore = agentBus.getSignalsFor("DemandIntelligenceAgent").length;

  try {
    logs.push(`🧠 DemandIntelligenceAgent started for ${city}`);

    // 1. Analyze neighborhood demand
    const demandMap = await analyzeNeighborhoodDemand(city);
    logs.push(`📊 Demand map: ${demandMap.neighborhoods.length} neighborhoods, total: ${demandMap.totalDemand}`);

    // 2. Detect viral products
    const viralProducts = await detectViralProducts(city);
    logs.push(`🔥 ${viralProducts.length} viral products detected`);

    // 3. Recommend products to stores
    const recommendations = await recommendProductsToStores(city);
    logs.push(`💡 ${recommendations.length} product recommendations`);

    // 4. Optimize posting campaigns
    const optimizations = optimizePostingCampaigns(demandMap.neighborhoods);
    logs.push(`⚡ ${optimizations.length} campaign optimizations`);

    logs.push("✅ DemandIntelligenceAgent completed");

    return {
      agent: "DemandIntelligenceAgent",
      success: true,
      signals: agentBus.getSignalsFor("DemandIntelligenceAgent").slice(signalsBefore),
      metrics: {
        neighborhoods_analyzed: demandMap.neighborhoods.length,
        total_demand: demandMap.totalDemand,
        viral_products: viralProducts.length,
        recommendations: recommendations.length,
        optimizations: optimizations.length,
      },
      logs,
      duration_ms: Date.now() - startTime,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logs.push(`❌ Error: ${msg}`);
    return {
      agent: "DemandIntelligenceAgent",
      success: false,
      signals: [],
      metrics: {},
      logs,
      duration_ms: Date.now() - startTime,
    };
  }
}
