/**
 * FloatingCartButton — Global floating cart button
 *
 * Shows a fixed-position cart button on public pages when items exist.
 * Renders the GlobalCartDrawer when clicked.
 * Only shows on public pages (not admin/merchant/motoboy panels).
 */
import { useState } from "react";
import { useLocation } from "react-router-dom";
import { ShoppingBag } from "lucide-react";
import { useGlobalCart } from "@/hooks/useGlobalCart";
import { GlobalCartDrawer } from "@/components/public/GlobalCartDrawer";

// Pages where the floating cart should NOT appear
const EXCLUDED_PREFIXES = ["/admin", "/administrador", "/merchant", "/anunciante", "/motoboy", "/mototaxi", "/driver", "/freteiro", "/passenger", "/auth", "/select-profile", "/loading"];

export function FloatingCartButton() {
  const location = useLocation();
  const [cartOpen, setCartOpen] = useState(false);
  const globalCart = useGlobalCart();

  // Don't show on admin/panel pages
  const isExcluded = EXCLUDED_PREFIXES.some(p => location.pathname.startsWith(p));
  if (isExcluded) return null;

  // Don't show on /mercado (it has its own cart badge in the top bar)
  if (location.pathname === "/mercado") return null;

  // Don't render if no items
  if (globalCart.totalItems === 0) return null;

  return (
    <>
      {/* Floating button — bottom-right */}
      <button
        onClick={() => setCartOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-gradient-to-r from-[#FF6A00] to-[#FF8C00] text-white px-5 py-3.5 rounded-2xl shadow-2xl hover:shadow-3xl hover:scale-105 transition-all duration-200"
        style={{ boxShadow: '0 8px 30px rgba(255,106,0,0.4)' }}
      >
        <ShoppingBag className="h-5 w-5" />
        <span className="text-sm font-bold">
          {globalCart.totalItems} {globalCart.totalItems === 1 ? "item" : "itens"}
        </span>
        <span className="text-xs text-white/70">
          • {globalCart.totalStores} {globalCart.totalStores === 1 ? "loja" : "lojas"}
        </span>
        {/* Badge */}
        <span className="absolute -top-2 -right-2 bg-white text-[#FF6A00] text-[10px] font-black rounded-full min-w-[22px] h-[22px] flex items-center justify-center px-1 shadow-md border-2 border-[#FF6A00]">
          {globalCart.totalItems}
        </span>
      </button>

      {/* Drawer */}
      <GlobalCartDrawer
        open={cartOpen}
        onOpenChange={setCartOpen}
        globalCart={globalCart}
      />
    </>
  );
}
