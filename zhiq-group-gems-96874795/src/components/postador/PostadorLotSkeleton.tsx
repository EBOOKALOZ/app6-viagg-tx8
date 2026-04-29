import { Card, CardContent } from "@/components/ui/card";

// ═══════════════════════════════════════
// SKELETON LOADING — POSTADOR 3 LOT CARD
// ═══════════════════════════════════════

export default function PostadorLotSkeleton() {
    return (
        <div className="space-y-4">
            {[1, 2, 3].map((i) => (
                <Card
                    key={i}
                    className="border rounded-2xl overflow-hidden"
                    style={{
                        background: "linear-gradient(145deg, #1A1F2B, #1C2132)",
                        borderColor: "rgba(255,228,225,0.06)",
                    }}
                >
                    <CardContent className="p-4">
                        <div className="animate-pulse space-y-3">
                            {/* Store header */}
                            <div className="flex items-center gap-3">
                                <div className="w-11 h-11 rounded-xl bg-white/[0.04]" />
                                <div className="space-y-1.5 flex-1">
                                    <div className="h-3.5 bg-white/[0.05] rounded w-1/3" />
                                    <div className="h-2.5 bg-white/[0.03] rounded w-1/4" />
                                </div>
                                <div className="h-6 bg-white/[0.04] rounded-lg w-20" />
                            </div>
                            {/* Products */}
                            {[1, 2, 3].map((j) => (
                                <div key={j} className="flex items-center gap-3 rounded-xl p-2.5 border border-white/[0.03]">
                                    <div className="w-12 h-12 rounded-lg bg-white/[0.04] shrink-0" />
                                    <div className="space-y-1.5 flex-1">
                                        <div className="h-2.5 bg-white/[0.05] rounded w-2/3" />
                                        <div className="h-3 bg-white/[0.04] rounded w-1/4" />
                                    </div>
                                </div>
                            ))}
                            {/* CTA */}
                            <div className="h-11 bg-white/[0.04] rounded-xl w-full" />
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}
