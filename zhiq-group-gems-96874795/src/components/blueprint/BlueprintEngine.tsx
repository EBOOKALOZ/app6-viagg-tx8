/**
 * BLUEPRINT ENGINE — Motor visual universal de exploração de entidades.
 *
 * Camada agnóstica que recebe dados padronizados (imagem, atributos,
 * hotspots) e renderiza uma experiência imersiva de visualização.
 *
 * Reutiliza o Design System ORION-AI (DARK tokens oficiais) e o Dialog
 * do Radix UI já presente no projeto.
 *
 * REGRAS:
 * - Zero regra de negócio — só apresentação.
 * - Quem decide quais dados exibir é o Adapter (ex: ProductBlueprintAdapter).
 * - Responsivo, mobile-first, com suporte a pinch-zoom futuro.
 */
import { useState, useRef, useCallback, useEffect, type ReactNode } from "react";
import {
    X, ZoomIn, ZoomOut, RotateCcw, Maximize2,
    ChevronLeft, ChevronRight, Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DARK } from "@/components/ui/dark-card";

// ─── PUBLIC TYPES ────────────────────────────────────────
export type BlueprintEntityType =
    | "product"
    | "vehicle"
    | "property"
    | "service"
    | "generic";

export interface BlueprintHotspot {
    /** X position as percentage (0–100) */
    x: number;
    /** Y position as percentage (0–100) */
    y: number;
    /** Short label shown on hover/tap */
    label: string;
    /** Optional longer description */
    description?: string;
    /** Optional icon name (lucide) — reserved for future */
    icon?: string;
}

export interface BlueprintAttribute {
    label: string;
    value: string | number | ReactNode;
    /** Optional group for sectioning (e.g. "Dimensões", "Composição") */
    group?: string;
    /** Optional priority for sorting */
    priority?: number;
    /** Optional source of the data */
    source?: string;
}

export interface SmartBlueprintData {
    title: string;
    summary?: string;
    primaryInformation?: BlueprintAttribute[];
    specifications?: BlueprintAttribute[];
    description?: string;
    context?: BlueprintAttribute[];
}

export interface BlueprintEngineProps {
    isOpen: boolean;
    onClose: () => void;
    entityType: BlueprintEntityType;
    entityId: string;
    title: string;
    subtitle?: string;
    /** Array of image URLs */
    images: string[];
    /** Structured attributes / specifications */
    attributes?: BlueprintAttribute[];
    /** Smart Blueprint Data */
    blueprint?: SmartBlueprintData;
    /** Interactable points on the image */
    hotspots?: BlueprintHotspot[];
    /** Extra CTA slot (adapter can inject buttons) */
    footerSlot?: ReactNode;
}

// ─── CONSTANTS ───────────────────────────────────────────
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.5;

// ─── COMPONENT ───────────────────────────────────────────
export function BlueprintEngine({
    isOpen,
    onClose,
    entityType,
    entityId,
    title,
    subtitle,
    images,
    attributes = [],
    blueprint,
    hotspots = [],
    footerSlot,
}: BlueprintEngineProps) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [zoom, setZoom] = useState(1);
    const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
    const [activeHotspot, setActiveHotspot] = useState<number | null>(null);
    const [showSpecs, setShowSpecs] = useState(false);
    const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);

    const imageContainerRef = useRef<HTMLDivElement>(null);
    const isDragging = useRef(false);
    const dragStart = useRef({ x: 0, y: 0 });
    const lastOffset = useRef({ x: 0, y: 0 });

    // Reset state when modal opens/closes or image changes
    useEffect(() => {
        if (isOpen) {
            setCurrentIndex(0);
            setZoom(1);
            setPanOffset({ x: 0, y: 0 });
            setActiveHotspot(null);
            setShowSpecs(false);
            setIsDescriptionExpanded(false);
        }
    }, [isOpen]);

    // Reset zoom/pan when switching images
    useEffect(() => {
        setZoom(1);
        setPanOffset({ x: 0, y: 0 });
        setActiveHotspot(null);
    }, [currentIndex]);

    // Keyboard navigation
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: KeyboardEvent) => {
            switch (e.key) {
                case "Escape":
                    onClose();
                    break;
                case "ArrowLeft":
                    prevImage();
                    break;
                case "ArrowRight":
                    nextImage();
                    break;
                case "+":
                case "=":
                    zoomIn();
                    break;
                case "-":
                    zoomOut();
                    break;
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [isOpen, currentIndex, zoom]);

    const prevImage = useCallback(() => {
        setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
    }, [images.length]);

    const nextImage = useCallback(() => {
        setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
    }, [images.length]);

    const zoomIn = useCallback(() => {
        setZoom((z) => Math.min(z + ZOOM_STEP, MAX_ZOOM));
    }, []);

    const zoomOut = useCallback(() => {
        setZoom((z) => {
            const next = Math.max(z - ZOOM_STEP, MIN_ZOOM);
            if (next === MIN_ZOOM) setPanOffset({ x: 0, y: 0 });
            return next;
        });
    }, []);

    const resetZoom = useCallback(() => {
        setZoom(1);
        setPanOffset({ x: 0, y: 0 });
    }, []);

    // ─── Drag to Pan (when zoomed) ───
    const onPointerDown = useCallback(
        (e: React.PointerEvent) => {
            if (zoom <= 1) return;
            isDragging.current = true;
            dragStart.current = { x: e.clientX, y: e.clientY };
            lastOffset.current = { ...panOffset };
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
        },
        [zoom, panOffset]
    );

    const onPointerMove = useCallback(
        (e: React.PointerEvent) => {
            if (!isDragging.current) return;
            const dx = e.clientX - dragStart.current.x;
            const dy = e.clientY - dragStart.current.y;
            setPanOffset({
                x: lastOffset.current.x + dx,
                y: lastOffset.current.y + dy,
            });
        },
        []
    );

    const onPointerUp = useCallback(() => {
        isDragging.current = false;
    }, []);

    // ─── Group attributes by group ───
    const groupedAttributes = attributes.reduce<Record<string, BlueprintAttribute[]>>(
        (acc, attr) => {
            const group = attr.group || "Especificações";
            if (!acc[group]) acc[group] = [];
            acc[group].push(attr);
            return acc;
        },
        {}
    );

    if (!isOpen) return null;

    const currentImage = images[currentIndex] || null;
    const hasMultipleImages = images.length > 1;

    return (
        <div
            className="fixed inset-0 z-[9999] flex items-center justify-center"
            role="dialog"
            aria-modal="true"
            aria-label={`Blueprint: ${title}`}
        >
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/90 backdrop-blur-md animate-in fade-in duration-200"
                onClick={onClose}
            />

            {/* Main Container */}
            <div className="relative z-10 flex flex-col lg:flex-row w-full h-full max-h-[100dvh] overflow-hidden animate-in zoom-in-95 fade-in duration-300">

                {/* ─── LEFT: Image Viewer ─── */}
                <div className="flex-1 relative flex flex-col min-h-0">

                    {/* Top Bar */}
                    <div className="flex items-center justify-between px-4 py-3 bg-black/60 backdrop-blur-sm z-20">
                        <div className="flex items-center gap-3 min-w-0">
                            <div
                                className="flex items-center justify-center w-8 h-8 rounded-lg text-[10px] font-black uppercase tracking-widest"
                                style={{ backgroundColor: DARK.orange, color: "#fff" }}
                            >
                                {entityType[0]?.toUpperCase()}
                            </div>
                            <div className="min-w-0">
                                <h2 className="text-white font-black text-sm lg:text-base leading-tight truncate">
                                    {title}
                                </h2>
                                {subtitle && (
                                    <p className="text-white/50 text-[11px] font-medium truncate">
                                        {subtitle}
                                    </p>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                            {/* Toggle Specs Panel (mobile) */}
                            {(attributes.length > 0 || blueprint) && (
                                <button
                                    onClick={() => setShowSpecs(!showSpecs)}
                                    className={cn(
                                        "lg:hidden flex items-center justify-center w-9 h-9 rounded-xl transition-all",
                                        showSpecs
                                            ? "bg-[#FF7A00] text-white"
                                            : "bg-white/10 text-white/70 hover:bg-white/20"
                                    )}
                                    aria-label="Ver especificações"
                                >
                                    <Info className="h-4 w-4" />
                                </button>
                            )}
                            <button
                                onClick={onClose}
                                className="flex items-center justify-center w-9 h-9 rounded-xl bg-white/10 text-white/70 hover:bg-white/20 hover:text-white transition-all"
                                aria-label="Fechar Blueprint"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                    </div>

                    {/* Image Area */}
                    <div
                        ref={imageContainerRef}
                        className="flex-1 relative overflow-hidden select-none"
                        style={{ cursor: zoom > 1 ? "grab" : "default" }}
                        onPointerDown={onPointerDown}
                        onPointerMove={onPointerMove}
                        onPointerUp={onPointerUp}
                        onPointerCancel={onPointerUp}
                    >
                        {currentImage ? (
                            <div
                                className="w-full h-full flex items-center justify-center transition-transform duration-200 ease-out"
                                style={{
                                    transform: `scale(${zoom}) translate(${panOffset.x / zoom}px, ${panOffset.y / zoom}px)`,
                                }}
                            >
                                <img
                                    src={currentImage}
                                    alt={`${title} — Imagem ${currentIndex + 1}`}
                                    className="max-w-full max-h-full object-contain"
                                    draggable={false}
                                />

                                {/* Hotspots (only at zoom=1 to avoid misposition) */}
                                {zoom === 1 &&
                                    hotspots.map((hs, i) => (
                                        <button
                                            key={i}
                                            className={cn(
                                                "absolute w-7 h-7 -ml-3.5 -mt-3.5 rounded-full border-2 flex items-center justify-center transition-all",
                                                activeHotspot === i
                                                    ? "bg-[#FF7A00] border-white scale-125 shadow-[0_0_16px_rgba(255,122,0,0.6)]"
                                                    : "bg-white/20 border-white/60 hover:bg-[#FF7A00]/80 hover:border-white hover:scale-110 backdrop-blur-sm"
                                            )}
                                            style={{
                                                left: `${hs.x}%`,
                                                top: `${hs.y}%`,
                                            }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setActiveHotspot(activeHotspot === i ? null : i);
                                            }}
                                            aria-label={hs.label}
                                        >
                                            <span className="text-[10px] font-black text-white">
                                                {i + 1}
                                            </span>
                                        </button>
                                    ))}
                            </div>
                        ) : (
                            <div className="w-full h-full flex items-center justify-center">
                                <div className="text-center">
                                    <Maximize2 className="h-12 w-12 text-white/20 mx-auto mb-2" />
                                    <p className="text-white/30 text-sm font-bold">
                                        Sem imagem disponível
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Active Hotspot Tooltip */}
                        {activeHotspot !== null && hotspots[activeHotspot] && (
                            <div
                                className="absolute z-30 max-w-[260px] rounded-xl bg-[#1A1F24] border border-[#323A45] shadow-2xl p-3 animate-in fade-in zoom-in-95 duration-200"
                                style={{
                                    left: `${Math.min(hotspots[activeHotspot].x, 70)}%`,
                                    top: `${Math.min(hotspots[activeHotspot].y + 5, 80)}%`,
                                }}
                            >
                                <p className="text-white font-bold text-sm leading-tight">
                                    {hotspots[activeHotspot].label}
                                </p>
                                {hotspots[activeHotspot].description && (
                                    <p className="text-white/60 text-xs mt-1 leading-relaxed">
                                        {hotspots[activeHotspot].description}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Bottom Controls */}
                    <div className="flex items-center justify-between px-4 py-2.5 bg-black/60 backdrop-blur-sm z-20">
                        {/* Navigation */}
                        <div className="flex items-center gap-2">
                            {hasMultipleImages && (
                                <>
                                    <button
                                        onClick={prevImage}
                                        className="w-8 h-8 rounded-lg bg-white/10 text-white/70 hover:bg-white/20 flex items-center justify-center transition-all"
                                        aria-label="Imagem anterior"
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                    </button>
                                    <span className="text-white/50 text-xs font-bold tabular-nums">
                                        {currentIndex + 1}/{images.length}
                                    </span>
                                    <button
                                        onClick={nextImage}
                                        className="w-8 h-8 rounded-lg bg-white/10 text-white/70 hover:bg-white/20 flex items-center justify-center transition-all"
                                        aria-label="Próxima imagem"
                                    >
                                        <ChevronRight className="h-4 w-4" />
                                    </button>
                                </>
                            )}
                        </div>

                        {/* Zoom Controls */}
                        <div className="flex items-center gap-1.5">
                            <button
                                onClick={zoomOut}
                                disabled={zoom <= MIN_ZOOM}
                                className="w-8 h-8 rounded-lg bg-white/10 text-white/70 hover:bg-white/20 flex items-center justify-center transition-all disabled:opacity-30"
                                aria-label="Diminuir zoom"
                            >
                                <ZoomOut className="h-4 w-4" />
                            </button>
                            <span className="text-white/50 text-[11px] font-bold tabular-nums min-w-[40px] text-center">
                                {Math.round(zoom * 100)}%
                            </span>
                            <button
                                onClick={zoomIn}
                                disabled={zoom >= MAX_ZOOM}
                                className="w-8 h-8 rounded-lg bg-white/10 text-white/70 hover:bg-white/20 flex items-center justify-center transition-all disabled:opacity-30"
                                aria-label="Aumentar zoom"
                            >
                                <ZoomIn className="h-4 w-4" />
                            </button>
                            <button
                                onClick={resetZoom}
                                className="w-8 h-8 rounded-lg bg-white/10 text-white/70 hover:bg-white/20 flex items-center justify-center transition-all"
                                aria-label="Resetar zoom"
                            >
                                <RotateCcw className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    </div>

                    {/* Thumbnail Strip (only if multiple images) */}
                    {hasMultipleImages && (
                        <div className="flex items-center gap-2 px-4 py-2 bg-black/40 overflow-x-auto scrollbar-hide">
                            {images.map((img, i) => (
                                <button
                                    key={i}
                                    onClick={() => setCurrentIndex(i)}
                                    className={cn(
                                        "w-12 h-12 rounded-lg overflow-hidden border-2 shrink-0 transition-all",
                                        i === currentIndex
                                            ? "border-[#FF7A00] scale-110 shadow-[0_0_10px_rgba(255,122,0,0.4)]"
                                            : "border-white/20 opacity-60 hover:opacity-100"
                                    )}
                                >
                                    <img
                                        src={img}
                                        alt={`Miniatura ${i + 1}`}
                                        className="w-full h-full object-cover"
                                    />
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* ─── RIGHT: Specs Panel (desktop always / mobile toggle) ─── */}
                {(attributes.length > 0 || blueprint) && (
                    <div
                        className={cn(
                            "lg:w-[380px] xl:w-[420px] bg-[#1A1F24] border-l border-[#323A45] overflow-y-auto transition-all duration-300",
                            // Mobile: slide up as overlay
                            showSpecs
                                ? "absolute inset-x-0 bottom-0 top-[50%] z-30 lg:relative lg:inset-auto rounded-t-3xl lg:rounded-none animate-in slide-in-from-bottom duration-300"
                                : "hidden lg:flex lg:flex-col"
                        )}
                    >
                        {/* Mobile handle */}
                        <div className="lg:hidden flex justify-center pt-3 pb-1">
                            <div className="w-10 h-1 rounded-full bg-white/20" />
                        </div>

                        <div className="p-5 lg:p-6 space-y-5">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3
                                        className="text-xs font-black uppercase tracking-widest"
                                        style={{ color: DARK.muted }}
                                    >
                                        BLUEPRINT
                                    </h3>
                                    <p className="text-[10px] font-bold text-white/50">
                                        Especificações inteligentes
                                    </p>
                                </div>
                                <button
                                    onClick={() => setShowSpecs(false)}
                                    className="lg:hidden w-7 h-7 rounded-lg bg-white/10 text-white/60 flex items-center justify-center"
                                >
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            </div>

                            {/* Render Blueprint Smart Layout */}
                            {blueprint && (
                                <div className="space-y-6">
                                    {/* RESUMO */}
                                    <div className="space-y-2">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-[#FF7A00]">
                                            Resumo
                                        </p>
                                        <h4 className="text-sm font-bold text-white">{blueprint.title}</h4>
                                        {blueprint.summary && (
                                            <p className="text-xs text-white/70 leading-relaxed mt-1">{blueprint.summary}</p>
                                        )}
                                    </div>

                                    {/* INFORMAÇÕES PRINCIPAIS */}
                                    {blueprint.primaryInformation && blueprint.primaryInformation.length > 0 && (
                                        <div className="space-y-2">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-[#FF7A00]">
                                                Informações Principais
                                            </p>
                                            <div className="rounded-xl bg-[#252B33] border border-[#323A45] divide-y divide-[#323A45]">
                                                {blueprint.primaryInformation.map((attr, j) => (
                                                    <div key={j} className="flex items-center justify-between px-4 py-3">
                                                        <span className="text-xs font-bold text-[#A0AAB5]">{attr.label}</span>
                                                        <span className="text-sm font-black text-white text-right max-w-[55%] truncate">{attr.value}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* ESPECIFICAÇÕES */}
                                    {blueprint.specifications && blueprint.specifications.length > 0 && (
                                        <div className="space-y-2">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-[#FF7A00]">
                                                Especificações
                                            </p>
                                            <div className="rounded-xl bg-[#252B33] border border-[#323A45] divide-y divide-[#323A45]">
                                                {blueprint.specifications.map((attr, j) => (
                                                    <div key={j} className="flex items-center justify-between px-4 py-3">
                                                        <span className="text-xs font-bold text-[#A0AAB5]">{attr.label}</span>
                                                        <span className="text-sm font-black text-white text-right max-w-[55%] truncate">{attr.value}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* DESCRIÇÃO */}
                                    {blueprint.description && (
                                        <div className="space-y-2">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-[#FF7A00]">
                                                Descrição
                                            </p>
                                            <div className="rounded-xl bg-[#252B33] border border-[#323A45] p-4">
                                                <p className={cn(
                                                    "text-xs text-white/80 leading-relaxed whitespace-pre-wrap transition-all",
                                                    !isDescriptionExpanded && "line-clamp-4"
                                                )}>
                                                    {blueprint.description}
                                                </p>
                                                {!isDescriptionExpanded && blueprint.description.length > 150 && (
                                                    <button 
                                                        onClick={() => setIsDescriptionExpanded(true)}
                                                        className="mt-2 text-xs font-bold text-[#FF7A00] hover:text-[#FF7A00]/80 transition-colors"
                                                    >
                                                        [Ver descrição completa]
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* CONTEXTO */}
                                    {blueprint.context && blueprint.context.length > 0 && (
                                        <div className="space-y-2">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-[#FF7A00]">
                                                Contexto
                                            </p>
                                            <div className="rounded-xl bg-[#252B33] border border-[#323A45] divide-y divide-[#323A45]">
                                                {blueprint.context.map((attr, j) => (
                                                    <div key={j} className="flex items-center justify-between px-4 py-3">
                                                        <span className="text-xs font-bold text-[#A0AAB5]">{attr.label}</span>
                                                        <span className="text-sm font-black text-white text-right max-w-[55%] truncate">{attr.value}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Legacy grouped attributes (fallback) */}
                            {!blueprint && Object.entries(groupedAttributes).map(
                                ([group, attrs]) => (
                                    <div key={group} className="space-y-2">
                                        <p
                                            className="text-[10px] font-black uppercase tracking-widest text-[#FF7A00]"
                                        >
                                            {group}
                                        </p>
                                        <div className="rounded-xl bg-[#252B33] border border-[#323A45] divide-y divide-[#323A45]">
                                            {attrs.map((attr, j) => (
                                                <div
                                                    key={j}
                                                    className="flex items-center justify-between px-4 py-3"
                                                >
                                                    <span
                                                        className="text-xs font-bold text-[#A0AAB5]"
                                                    >
                                                        {attr.label}
                                                    </span>
                                                    <span className="text-sm font-black text-white text-right max-w-[55%] truncate">
                                                        {attr.value}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )
                            )}

                            {/* Hotspot Legend */}
                            {hotspots.length > 0 && (
                                <div className="space-y-2">
                                    <p
                                        className="text-[10px] font-black uppercase tracking-widest"
                                        style={{ color: DARK.orange }}
                                    >
                                        Pontos de Interesse
                                    </p>
                                    <div className="rounded-xl bg-[#252B33] border border-[#323A45] divide-y divide-[#323A45]">
                                        {hotspots.map((hs, i) => (
                                            <button
                                                key={i}
                                                onClick={() =>
                                                    setActiveHotspot(
                                                        activeHotspot === i ? null : i
                                                    )
                                                }
                                                className={cn(
                                                    "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors",
                                                    activeHotspot === i
                                                        ? "bg-[#FF7A00]/10"
                                                        : "hover:bg-white/5"
                                                )}
                                            >
                                                <span
                                                    className={cn(
                                                        "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black shrink-0",
                                                        activeHotspot === i
                                                            ? "bg-[#FF7A00] text-white"
                                                            : "bg-[#323A45] text-white/70"
                                                    )}
                                                >
                                                    {i + 1}
                                                </span>
                                                <div className="min-w-0">
                                                    <p className="text-xs font-bold text-white truncate">
                                                        {hs.label}
                                                    </p>
                                                    {hs.description && (
                                                        <p className="text-[11px] text-white/40 truncate">
                                                            {hs.description}
                                                        </p>
                                                    )}
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Footer Slot (adapter-injected CTA) */}
                            {footerSlot && (
                                <div className="pt-2">{footerSlot}</div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
