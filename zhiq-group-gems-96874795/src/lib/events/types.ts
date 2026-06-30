// ── VIAGG-TX8™ — Event Driven Architecture — tipos ──────────────────────────

export type EventSeverity = "info" | "warning" | "error" | "critical";
export type EventStatus   = "success" | "error" | "pending" | "warning";

export type EventModule =
  | "rides"       // corridas
  | "finance"     // pagamentos e carteiras
  | "users"       // usuários e autenticação
  | "drivers"     // motoristas
  | "motoboys"    // motoboys e mototáxis
  | "stores"      // lojas e merchants
  | "ads"         // anúncios e campanhas
  | "ai"          // IA (chat, GLM, auto-poster)
  | "security"    // segurança e fraude
  | "map"         // eventos de mapa
  | "system";     // sistema / infraestrutura

// ── Todos os tipos de evento ─────────────────────────────────────────────────

export type EventType =
  // CORRIDAS
  | "ride.requested"
  | "ride.driver_assigned"
  | "ride.driver_accepted"
  | "ride.driver_rejected"
  | "ride.driver_arrived"
  | "ride.started"
  | "ride.completed"
  | "ride.cancelled_passenger"
  | "ride.cancelled_driver"
  | "ride.cancelled_system"
  | "ride.price_updated"
  | "ride.route_changed"
  | "ride.sos_triggered"
  | "ride.rated"
  // CORRIDAS — ENTREGA
  | "delivery.requested"
  | "delivery.picked_up"
  | "delivery.delivered"
  | "delivery.returned"
  | "delivery.cancelled"
  // FINANÇAS
  | "payment.pix_initiated"
  | "payment.pix_received"
  | "payment.pix_expired"
  | "payment.card_initiated"
  | "payment.card_approved"
  | "payment.card_declined"
  | "payment.refunded"
  | "payment.chargeback"
  | "wallet.credited"
  | "wallet.debited"
  | "wallet.balance_low"
  | "credits.purchased"
  | "credits.consumed"
  | "credits.expired"
  // USUÁRIOS
  | "user.registered"
  | "user.logged_in"
  | "user.logged_out"
  | "user.profile_updated"
  | "user.password_changed"
  | "user.banned"
  | "user.unbanned"
  | "user.onboarding_complete"
  // MOTORISTAS
  | "driver.online"
  | "driver.offline"
  | "driver.location_updated"
  | "driver.rating_updated"
  | "driver.warning_issued"
  | "driver.suspended"
  // MOTOBOYS
  | "motoboy.online"
  | "motoboy.offline"
  | "motoboy.location_updated"
  | "motoboy.rating_updated"
  // LOJAS
  | "store.created"
  | "store.order_received"
  | "store.order_confirmed"
  | "store.order_shipped"
  | "store.order_delivered"
  | "store.order_cancelled"
  // ANÚNCIOS
  | "ad.created"
  | "ad.viewed"
  | "ad.clicked"
  | "ad.contact_intent"
  | "ad.expired"
  // IA
  | "ai.chat_message"
  | "ai.auto_post_created"
  | "ai.recommendation_generated"
  | "ai.prediction_updated"
  | "ai.error"
  // SEGURANÇA
  | "security.suspicious_login"
  | "security.multiple_failed_logins"
  | "security.fraud_detected"
  | "security.ip_blocked"
  // MAPA
  | "map.heatmap_updated"
  | "map.demand_spike"
  | "map.supply_shortage"
  // SISTEMA
  | "system.startup"
  | "system.error"
  | "system.slow_query"
  | "system.edge_function_error";

// ── Payload de evento enviado pelo client ─────────────────────────────────────

export interface PlatformEvent {
  id?:          string;
  event_type:   EventType;
  module:       EventModule;
  action:       string;
  status:       EventStatus;
  severity:     EventSeverity;
  title:        string;
  description?: string;
  user_id?:     string;
  driver_id?:   string;
  ride_id?:     string;
  delivery_id?: string;
  order_id?:    string;
  payment_id?:  string;
  city?:        string;
  state?:       string;
  latitude?:    number;
  longitude?:   number;
  device?:      string;
  browser?:     string;
  ip?:          string;
  metadata?:    Record<string, unknown>;
  created_at?:  string;
}

// ── Métricas do dashboard ─────────────────────────────────────────────────────

export interface EventMetrics {
  total_today:       number;
  total_last_hour:   number;
  errors_today:      number;
  rides_today:       number;
  payments_today:    number;
  users_today:       number;
  ai_calls_today:    number;
  critical_alerts:   number;
  events_by_module:  Record<string, number>;
  events_by_hour:    Array<{ hour: string; count: number }>;
}
