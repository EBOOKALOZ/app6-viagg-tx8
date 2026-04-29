/**
 * 👥 assign_posters_to_zones
 * Distributes available posters across zones based on strength gaps.
 */
import type { ZoneStrength } from "./measureZoneStrength";

export interface PosterAssignment {
  zone_id: string;
  zone_name: string;
  currentPosters: number;
  targetPosters: number;
  postersNeeded: number;
  priority: number;
}

const LEVEL_TARGETS: Record<string, number> = {
  weak: 1,
  emerging: 3,
  growing: 5,
  strong: 8,
  dominant: 10,
};

export function assignPostersToZones(zones: ZoneStrength[]): PosterAssignment[] {
  console.log(`[TerritoryDominance] 👥 Assigning posters to ${zones.length} zones...`);

  const assignments: PosterAssignment[] = zones.map((z) => {
    const target = LEVEL_TARGETS[z.level] || 1;
    const needed = Math.max(target - z.posterCount, 0);
    const priority = needed > 0
      ? (z.level === "weak" ? 1 : z.level === "emerging" ? 2 : 3) // Weaker zones get higher priority
      : 5;

    return {
      zone_id: z.zone_id,
      zone_name: z.zone_name,
      currentPosters: z.posterCount,
      targetPosters: target,
      postersNeeded: needed,
      priority,
    };
  })
  .sort((a, b) => a.priority - b.priority || b.postersNeeded - a.postersNeeded);

  const totalNeeded = assignments.reduce((s, a) => s + a.postersNeeded, 0);
  console.log(`[TerritoryDominance] 👥 Total posters needed: ${totalNeeded}`);
  return assignments;
}
