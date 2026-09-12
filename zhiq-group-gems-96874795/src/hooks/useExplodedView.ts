import { useState, useCallback } from "react";
import { ExplodedViewService, ExplodedViewResult, ProductContext } from "@/services/ai/ExplodedViewService";
import { toast } from "sonner";

export type ExplodedViewState = "IDLE" | "PROCESSING" | "SUCCESS" | "ERROR";

export function useExplodedView() {
    const [state, setState] = useState<ExplodedViewState>("IDLE");
    const [result, setResult] = useState<ExplodedViewResult | null>(null);

    const generateExplodedView = useCallback(async (product: ProductContext) => {
        if (!product.primaryImage) {
            toast.error("Imagem não disponível", { description: "O produto precisa ter uma imagem para gerar a vista explodida." });
            return;
        }

        setState("PROCESSING");
        setResult(null);

        try {
            const res = await ExplodedViewService.generate(product);
            
            if (res.status === "success") {
                setState("SUCCESS");
                setResult(res);
                toast.success("Vista explodida gerada com sucesso!");
            } else {
                setState("ERROR");
                setResult(res);
                toast.error("Erro na geração", { description: res.error || "Não foi possível gerar a vista explodida." });
            }
        } catch (err: any) {
            setState("ERROR");
            setResult({ imageUrl: "", status: "error", error: err.message });
            toast.error("Erro inesperado", { description: err.message });
        }
    }, []);

    const reset = useCallback(() => {
        setState("IDLE");
        setResult(null);
    }, []);

    return {
        state,
        result,
        generateExplodedView,
        reset
    };
}
