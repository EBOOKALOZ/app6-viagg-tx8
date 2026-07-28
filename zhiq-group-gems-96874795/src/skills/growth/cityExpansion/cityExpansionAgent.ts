/**
 * 🏙️ CityExpansionAgent — Orchestrator
 *
 * Responsible for detecting when cities begin to heat up
 * and triggering expansion across the network.
 *
 * Pipeline: monitor → detect → trigger → prioritize
 */
import type { AgentRunResult } from "../growthAgentTypes";
import { monitorCityMetrics } from "./monitorCityMetrics";
import { detectGrowthStage } from "./detectGrowthStage";
import { triggerCityExpansion } from "./triggerCityExpansion";
import { prioritizeCityCampaigns } from "./prioritizeCityCampaigns";
import { agentBus } from "../agentBus";

export async function runCityExpansionAgent(): Promise<AgentRunResult> {
  const startTime = Date.now();
  const logs: string[] = [];
  const signals = agentBus.getSignalsFor("CityExpansionAgent");

  try {
    logs.push("🏙️ CityExpansionAgent started");

    // 1. Monitor city metrics
    const cities = await monitorCityMetrics();
    logs.push(`📊 Monitoring ${cities.length} cities`);

    // 2. Detect growth stage transitions
    const transitions = await detectGrowthStage(cities);
    logs.push(`🔄 ${transitions.length} stage transitions detected`);

    // 3. Trigger expansion for transitioning cities
    triggerCityExpansion(transitions);
    logs.push(`🚀 Expansion triggers processed`);

    // 4. Prioritize campaigns by city heat
    const priorities = prioritizeCityCampaigns(cities);
    logs.push(`🎯 Campaigns prioritized for ${priorities.length} cities`);

    logs.push("✅ CityExpansionAgent completed successfully");

    return {
      agent: "CityExpansionAgent",
      success: true,
      signals: agentBus.getSignalsFor("CityExpansionAgent").slice(signals.length),
      metrics: {
        cities_monitored: cities.length,
        transitions_detected: transitions.length,
        campaigns_prioritized: priorities.length,
      },
      logs,
      duration_ms: Date.now() - startTime,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err) || "Unknown error";
    logs.push(`❌ Error: ${msg}`);
    return {
      agent: "CityExpansionAgent",
      success: false,
      signals: [],
      metrics: {},
      logs,
      duration_ms: Date.now() - startTime,
    };
  }
}
