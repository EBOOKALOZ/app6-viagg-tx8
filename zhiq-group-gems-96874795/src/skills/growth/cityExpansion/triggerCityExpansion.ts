/**
 * 🚀 trigger_city_expansion
 * For cities transitioning stages, emits signals to other agents.
 */
import { agentBus } from "../agentBus";
import type { StageTransition } from "./detectGrowthStage";

export function triggerCityExpansion(transitions: StageTransition[]): void {
  console.log("[CityExpansion] 🚀 Processing expansion triggers...");

  for (const t of transitions) {
    if (t.from === "cold" && t.to === "warming") {
      agentBus.emit("CityExpansionAgent", "DemandIntelligenceAgent", "CITY_HEATING", {
        city: t.city,
        from: t.from,
        to: t.to,
      });
    }

    if ((t.from === "warming" && t.to === "growing") || (t.from === "cold" && t.to === "growing")) {
      agentBus.emit("CityExpansionAgent", "TerritoryDominanceAgent", "EXPANSION_TRIGGERED", {
        city: t.city,
        from: t.from,
        to: t.to,
      });
      agentBus.emit("CityExpansionAgent", "DemandIntelligenceAgent", "EXPANSION_TRIGGERED", {
        city: t.city,
        from: t.from,
        to: t.to,
      });
    }

    // Any upward transition
    if (t.to === "hot" || t.to === "dominant") {
      agentBus.emit("CityExpansionAgent", "ALL", "EXPANSION_TRIGGERED", {
        city: t.city,
        from: t.from,
        to: t.to,
        priority: "high",
      });
    }
  }
}
