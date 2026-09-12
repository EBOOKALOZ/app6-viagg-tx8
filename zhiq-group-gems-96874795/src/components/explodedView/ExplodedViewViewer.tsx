import { Maximize2, Share2, Download, RefreshCcw, X, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface ExplodedViewViewerProps {
    imageUrl: string;
    onClose: () => void;
    onRetry?: () => void;
}

export function ExplodedViewViewer({ imageUrl, onClose, onRetry }: ExplodedViewViewerProps) {
    const [isExpanded, setIsExpanded] = useState(false);

    const handleShare = async () => {
        if (navigator.share) {
            try {
                await navigator.share({
                    title: 'Vista Explodida',
                    text: 'Confira a vista explodida deste produto!',
                    url: imageUrl,
                });
            } catch (err) {
                console.error("Share failed", err);
            }
        } else {
            navigator.clipboard.writeText(imageUrl);
        }
    };

    return (
        <div className={cn(
            "relative w-full rounded-2xl overflow-hidden border border-white/10 bg-[#1A1F24] transition-all duration-300",
            isExpanded ? "fixed inset-4 z-[9999] shadow-2xl flex flex-col" : "aspect-square max-h-[500px]"
        )}>
            {/* Header / Badges */}
            <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start z-10 bg-gradient-to-b from-black/60 to-transparent">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/40 backdrop-blur-md border border-white/10">
                    <Layers className="w-3.5 h-3.5 text-[#FF7A00]" />
                    <span className="text-[10px] font-bold text-white uppercase tracking-wider">Vista Explodida IA</span>
                </div>
                
                {isExpanded && (
                    <Button variant="ghost" size="icon" className="text-white hover:bg-white/20 rounded-full w-8 h-8" onClick={() => setIsExpanded(false)}>
                        <X className="w-4 h-4" />
                    </Button>
                )}
            </div>

            {/* Image Area */}
            <div className={cn(
                "flex-1 w-full h-full bg-[#121519] flex items-center justify-center overflow-hidden",
                isExpanded ? "p-4" : "p-0"
            )}>
                <img 
                    src={imageUrl} 
                    alt="Vista Explodida do Produto" 
                    className={cn(
                        "w-full h-full object-contain transition-transform duration-500",
                        isExpanded ? "scale-100" : "hover:scale-105"
                    )}
                />
            </div>

            {/* Actions Footer */}
            <div className="absolute bottom-0 left-0 right-0 p-4 flex justify-end gap-2 bg-gradient-to-t from-black/80 to-transparent z-10">
                {onRetry && (
                    <Button variant="secondary" size="sm" onClick={onRetry} className="bg-white/10 text-white hover:bg-white/20 border-0 backdrop-blur-md">
                        <RefreshCcw className="w-4 h-4 mr-2" />
                        Regerar
                    </Button>
                )}
                
                <Button variant="secondary" size="icon" onClick={handleShare} className="bg-white/10 text-white hover:bg-white/20 border-0 backdrop-blur-md w-9 h-9">
                    <Share2 className="w-4 h-4" />
                </Button>
                
                <Button variant="secondary" size="icon" asChild className="bg-white/10 text-white hover:bg-white/20 border-0 backdrop-blur-md w-9 h-9">
                    <a href={imageUrl} download="vista-explodida.jpg" target="_blank" rel="noreferrer">
                        <Download className="w-4 h-4" />
                    </a>
                </Button>
                
                {!isExpanded && (
                    <Button variant="default" size="icon" onClick={() => setIsExpanded(true)} className="bg-[#FF7A00] text-white hover:bg-[#FF7A00]/90 w-9 h-9">
                        <Maximize2 className="w-4 h-4" />
                    </Button>
                )}
            </div>
        </div>
    );
}
