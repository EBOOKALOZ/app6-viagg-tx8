import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Command, Layers, Loader2 } from "lucide-react";

interface ExplodedViewCommandInputProps {
    onExecute: () => void;
    isProcessing: boolean;
}

export function ExplodedViewCommandInput({ onExecute, isProcessing }: ExplodedViewCommandInputProps) {
    const [command, setCommand] = useState("");

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            if (command.trim().toLowerCase() === "/explodedview") {
                onExecute();
                setCommand("");
            }
        }
    };

    return (
        <div className="flex flex-col gap-3 p-4 rounded-xl border border-white/5 bg-white/5 backdrop-blur-sm">
            <div className="flex items-center justify-between">
                <div>
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        <Layers className="w-4 h-4 text-[#FF7A00]" />
                        Vista Explodida
                    </h4>
                    <p className="text-xs text-white/50 mt-1">
                        Gere uma visão estrutural separada dos componentes.
                    </p>
                </div>
                <Button 
                    onClick={onExecute} 
                    disabled={isProcessing}
                    size="sm"
                    className="bg-[#FF7A00] hover:bg-[#FF7A00]/90 text-white border-0"
                >
                    {isProcessing ? (
                        <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Gerando...
                        </>
                    ) : (
                        "Gerar Agora"
                    )}
                </Button>
            </div>

            <div className="relative">
                <Command className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                <Input 
                    value={command}
                    onChange={(e) => setCommand(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ou digite o comando /explodedview"
                    className="pl-9 bg-black/40 border-white/10 text-white placeholder:text-white/30"
                    disabled={isProcessing}
                />
            </div>
        </div>
    );
}
