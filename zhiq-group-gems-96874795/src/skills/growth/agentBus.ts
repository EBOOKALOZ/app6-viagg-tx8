/**
 * 📡 Agent Bus — Viagg-TX8 Growth Engine
 *
 * Lightweight pub/sub bus enabling inter-agent communication.
 * All 4 agents use this bus to emit and react to signals.
 *
 * Architecture:
 * - In-memory for frontend (React context / singleton)
 * - Every signal is logged for admin audit trail
 * - Can be extended to Supabase Realtime channels for server-side coordination
 */

import type { AgentName, AgentSignal, SignalAction } from "./growthAgentTypes";

type SignalHandler = (signal: AgentSignal) => void;

interface Subscription {
  id: string;
  target: AgentName | "ALL";
  handler: SignalHandler;
}

class AgentBus {
  private subscriptions: Subscription[] = [];
  private signalLog: AgentSignal[] = [];
  private maxLogSize = 500;

  /**
   * Emit a signal from one agent to another (or ALL).
   */
  emit(
    source: AgentName,
    target: AgentName | "ALL",
    action: SignalAction,
    payload: Record<string, unknown> = {}
  ): AgentSignal {
    const signal: AgentSignal = {
      id: crypto.randomUUID(),
      source,
      target,
      action,
      payload,
      timestamp: new Date().toISOString(),
    };

    // Log the signal
    this.signalLog.push(signal);
    if (this.signalLog.length > this.maxLogSize) {
      this.signalLog = this.signalLog.slice(-this.maxLogSize);
    }

    console.log(
      `[AgentBus] 📡 ${source} → ${target}: ${action}`,
      payload
    );

    // Dispatch to matching subscribers
    for (const sub of this.subscriptions) {
      if (sub.target === "ALL" || sub.target === target || target === "ALL") {
        try {
          sub.handler(signal);
        } catch (err) {
          console.error(`[AgentBus] Handler error for ${sub.target}:`, err);
        }
      }
    }

    return signal;
  }

  /**
   * Subscribe an agent to receive signals.
   */
  on(target: AgentName | "ALL", handler: SignalHandler): string {
    const id = crypto.randomUUID();
    this.subscriptions.push({ id, target, handler });
    return id;
  }

  /**
   * Unsubscribe by subscription ID.
   */
  off(subscriptionId: string): void {
    this.subscriptions = this.subscriptions.filter((s) => s.id !== subscriptionId);
  }

  /**
   * Get the full signal log (for admin monitoring).
   */
  getSignalLog(): AgentSignal[] {
    return [...this.signalLog];
  }

  /**
   * Get recent signals filtered by agent.
   */
  getSignalsFor(agent: AgentName, limit = 50): AgentSignal[] {
    return this.signalLog
      .filter((s) => s.source === agent || s.target === agent || s.target === "ALL")
      .slice(-limit);
  }

  /**
   * Get recent signals filtered by action.
   */
  getSignalsByAction(action: SignalAction, limit = 50): AgentSignal[] {
    return this.signalLog.filter((s) => s.action === action).slice(-limit);
  }

  /**
   * Clear the log.
   */
  clearLog(): void {
    this.signalLog = [];
  }

  /**
   * Get stats for the admin dashboard.
   */
  getStats(): Record<string, number> {
    const stats: Record<string, number> = {
      total_signals: this.signalLog.length,
      active_subscriptions: this.subscriptions.length,
    };

    // Count by action
    for (const signal of this.signalLog) {
      const key = `action_${signal.action}`;
      stats[key] = (stats[key] || 0) + 1;
    }

    // Count by source
    for (const signal of this.signalLog) {
      const key = `from_${signal.source}`;
      stats[key] = (stats[key] || 0) + 1;
    }

    return stats;
  }
}

// Singleton instance — shared across all agents
export const agentBus = new AgentBus();
