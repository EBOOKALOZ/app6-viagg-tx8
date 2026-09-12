/**
 * PRODUCT BLUEPRINT ADAPTER
 *
 * Ponte entre os dados brutos de um produto (merchant_marketing_products ou
 * advertiser_listings) e a interface padronizada do BlueprintEngine.
 *
 * Este adapter:
 * 1. Extrai imagens, título, subtítulo do objeto `product`.
 * 2. Converte campos do banco de dados em `BlueprintAttribute[]`.
 * 3. Opcionalmente injeta hotspots se existirem no produto.
 * 4. Renderiza o BlueprintEngine com os dados mapeados.
 *
 * REGRAS:
 * - Não faz query ao banco — recebe os dados prontos como props.
 * - Zero lógica de paywall/auth/carteira — só mapeamento visual.
 * - Extensível: novos adapters (Vehicle, Property) seguem o mesmo padrão.
 */
import { BlueprintEngine, type BlueprintAttribute, type BlueprintHotspot, type SmartBlueprintData } from "@/components/blueprint/BlueprintEngine";
import { displayPriceLabel } from "@/lib/utils";

export interface ProductForBlueprint {
    id: string;
    title: string;
    short_description?: string | null;
    image_url?: string | null;
    video_url?: string | null;
    price_label?: string | null;
    category?: string | null;
    condition?: string | null;
    /** Resolved image URL (already normalized) */
    resolvedImageUrl?: string | null;
    /** Store name for subtitle context */
    storeName?: string | null;
    /** City for location attribute */
    city?: string | null;
    /** Neighborhood */
    bairro?: string | null;
}

interface ProductBlueprintAdapterProps {
    product: ProductForBlueprint;
    isOpen: boolean;
    onClose: () => void;
    /** Optional: extra footer CTA (e.g. "Comprar" button) */
    footerSlot?: React.ReactNode;
}

/**
 * Maps product data to BlueprintEngine-compatible format and renders the engine.
 */
export function ProductBlueprintAdapter({
    product,
    isOpen,
    onClose,
    footerSlot,
}: ProductBlueprintAdapterProps) {
    // ─── Resolve Images ───
    const images: string[] = [];
    const primaryImage = product.resolvedImageUrl || product.image_url;
    if (primaryImage) images.push(primaryImage);
    // Future: if product has a gallery array, spread it here.

    // ─── Build Smart Blueprint ───
    const primaryInformation: BlueprintAttribute[] = [];
    const specifications: BlueprintAttribute[] = [];
    const contextInfo: BlueprintAttribute[] = [];

    if (product.price_label) {
        primaryInformation.push({
            label: "Preço",
            value: displayPriceLabel(product.price_label),
        });
    }

    if (product.condition) {
        primaryInformation.push({
            label: "Condição",
            value: /novo/i.test(product.condition) ? "Novo" : "Usado",
        });
    }

    if (product.category) {
        primaryInformation.push({
            label: "Categoria",
            value: product.category,
        });
    }

    if (product.city || product.bairro) {
        primaryInformation.push({
            label: "Localização",
            value: [product.bairro, product.city].filter(Boolean).join(", "),
        });
    }

    if (product.video_url) {
        specifications.push({
            label: "Vídeo",
            value: "Disponível",
        });
    }

    const blueprint: SmartBlueprintData = {
        title: product.title,
        summary: product.title, // Can be replaced by an AI summary in the future
        primaryInformation,
        specifications,
        description: product.short_description || undefined,
        context: contextInfo,
    };

    // ─── Hotspots (reserved for future — products don't have them yet) ───
    const hotspots: BlueprintHotspot[] = [];

    // ─── Subtitle ───
    const subtitle = product.storeName
        ? `${product.storeName}${product.city ? ` • ${product.city}` : ""}`
        : product.city || undefined;

    return (
        <BlueprintEngine
            isOpen={isOpen}
            onClose={onClose}
            entityType="product"
            entityId={product.id}
            title={product.title}
            subtitle={subtitle}
            images={images}
            blueprint={blueprint}
            hotspots={hotspots}
            footerSlot={footerSlot}
        />
    );
}
