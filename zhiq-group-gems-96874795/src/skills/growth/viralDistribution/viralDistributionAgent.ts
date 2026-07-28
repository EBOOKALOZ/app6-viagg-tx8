/**
 * 🚀 ViralDistributionAgent — Orchestrator
 *
 * Amplifies trending products across the network.
 *
 * Pipeline: detect trends → amplify → boost frequency → allocate posters
 */
import type { AgentRunResult } from "../growthAgentTypes";
import { detectViralTrends } from "./detectViralTrends";
import { amplifyGroupDistribution } from "./amplifyGroupDistribution";
import { increasePostingFrequency } from "./increasePostingFrequency";
import { allocatePostersByRegion } from "./allocatePostersByRegion";
import { agentBus } from "../agentBus";

export async function runViralDistributionAgent(city: string): Promise<AgentRunResult> {
  const startTime = Date.now();
  const logs: string[] = [];
  const signalsBefore = agentBus.getSignalsFor("ViralDistributionAgent").length;

  try {
    logs.push(`🚀 ViralDistributionAgent started for ${city}`);

    // 1. Detect viral trends
    const trends = await detectViralTrends(city);
    logs.push(`📡 ${trends.length} active trends`);

    // 2. Plan group amplification
    const plans = amplifyGroupDistribution(trends);
    logs.push(`📢 ${plans.length} amplification plans`);

    // 3. Calculate frequency boosts
    const boosts = increasePostingFrequency(trends);
    logs.push(`⏫ ${boosts.length} frequency boosts`);

    // 4. Allocate posters
    const allocations = await allocatePostersByRegion(city, trends);
    logs.push(`🗺️ ${allocations.length} poster allocations`);

    // Signal completion
    agentBus.emit("ViralDistributionAgent", "DemandIntelligenceAgent", "AMPLIFY_COMPLETE", {
      city,
      trends_processed: trends.length,
      plans_created: plans.length,
    });

    logs.push("✅ ViralDistributionAgent completed");

    return {
      agent: "ViralDistributionAgent",
      success: true,
      signals: agentBus.getSignalsFor("ViralDistributionAgent").slice(signalsBefore),
      metrics: {
        trends_detected: trends.length,
        amplification_plans: plans.length,
        frequency_boosts: boosts.length,
        poster_allocations: allocations.length,
      },
      logs,
      duration_ms: Date.now() - startTime,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logs.push(`❌ Error: ${msg}`);
    return {
      agent: "ViralDistributionAgent",
      success: false,
      signals: [],
      metrics: {},
      logs,
      duration_ms: Date.now() - startTime,
    };
  }
}
