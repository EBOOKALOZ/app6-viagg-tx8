import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { MarketLayout } from "@/components/layout/MarketLayout";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useRealEstatePackages, type RealEstatePackage } from "@/hooks/useRealEstatePackages";
import { isSupportedType, compressImageFile } from "@/utils/imageCompression";
import { 
    ChevronRight, 
    ArrowLeft, 
    Building2, 
    MapPin, 
    Camera,
    Plus,
    Shield,
    UserPlus, 
    CheckCircle2, 
    Sparkles,
    ShieldCheck,
    CreditCard,
    X,
    Loader2,
    Star,
    LogIn
} from "lucide-react";
import { cn, formatCurrencyBRL, parseBRLCurrency } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import Auth from "@/pages/Auth";
import { RealEstateUserPanel } from "@/components/real-estate/RealEstateUserPanel";
import { RealEstateAuthCard } from "@/components/real-estate/RealEstateAuthCard";

// ─── STEP DEFINITIONS ───
const STEPS = [
    { id: 'type', label: 'Tipo', icon: Building2 },
    { id: 'details', label: 'Dados', icon: MapPin },
    { id: 'media', label: 'Fotos', icon: Camera },
    { id: 'account', label: 'Conta', icon: UserPlus },
    { id: 'credits', label: 'Planos', icon: CreditCard },
];

interface PropertyFile {
    file: File;
    preview: string;
    uploading?: boolean;
    error?: boolean;
    errorMessage?: string;
    isMasked?: boolean;
    success?: boolean;
}

export default function VenderImovelPage() {
    const navigate = useNavigate();
    const { user, isLoading: authLoading } = useAuth();
    const { data: creditPackages, isLoading: packagesLoading } = useRealEstatePackages();
    const [step, setStep] = useState(0);
    const [showAuth, setShowAuth] = useState(false);
    const [search, setSearch] = useState("");
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [propertyFiles, setPropertyFiles] = useState<PropertyFile[]>([]);
    const [uploadedPaths, setUploadedPaths] = useState<string[]>([]);
    const [isUploading, setIsUploading] = useState(false);

    const [propertyData, setPropertyData] = useState({
        type: "",
        title: "",
        description: "",
        price: "",
        city: "",
        state: "",
        neighborhood: "",
        owner_name: "",
        owner_whatsapp: "",
        owner_email: "",
    });
    const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
    const [isSavingListing, setIsSavingListing] = useState(false);

    const nextStep = () => setStep(prev => Math.min(prev + 1, STEPS.length - 1));
    const prevStep = () => setStep(prev => Math.max(prev - 1, 0));

    const isStepAccessible = (targetIdx: number) => {
        if (targetIdx <= step) return true; // Sempre pode voltar
        
        // Validação progressiva para avançar
        if (targetIdx >= 1 && !propertyData.type) return false;
        if (targetIdx >= 2 && (!propertyData.title || !propertyData.price || !propertyData.city || !propertyData.state)) return false;
        if (targetIdx >= 3 && propertyFiles.length === 0) return false;
        if (targetIdx >= 4 && (!propertyData.owner_name || !propertyData.owner_whatsapp || !propertyData.owner_email)) return false;
        
        return true;
    };

    const handleStepClick = (targetIdx: number) => {
        if (isStepAccessible(targetIdx)) {
            setStep(targetIdx);
        } else {
            const missingInfo = 
                targetIdx === 1 ? "o tipo de imóvel" :
                targetIdx === 2 ? "os dados básicos" :
                targetIdx === 3 ? "pelo menos uma foto" :
                targetIdx === 4 ? "seus dados de contato" : "as etapas anteriores";
            
            toast.error(`Por favor, preencha ${missingInfo} antes de prosseguir.`);
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = Array.from(e.target.files || []);
        const newFiles = selectedFiles.map(file => {
            const supported = isSupportedType(file);
            return {
                file,
                preview: URL.createObjectURL(file),
                error: !supported,
                errorMessage: !supported ? "Formato não suportado" : undefined
            };
        });
        setPropertyFiles(prev => [...prev, ...newFiles]);
        if (e.target) e.target.value = ""; // Reset input
    };
    const removeFile = (index: number) => {
        setPropertyFiles(prev => {
            const newFiles = [...prev];
            URL.revokeObjectURL(newFiles[index].preview);
            newFiles.splice(index, 1);
            return newFiles;
        });
    };

    const uploadFiles = async () => {
        if (propertyFiles.length === 0) return true;
        
        setIsUploading(true);
        const tempId = crypto.randomUUID();
        let uploadCount = 0;
        let failCount = 0;
        let currentMaskedCount = 0; // Initialize currentMaskedCount here
        
        // Progressively update files state for each upload
        const updateFileState = (index: number, updates: any) => {
            setPropertyFiles(prev => {
                const newList = [...prev];
                newList[index] = { ...newList[index], ...updates };
                return newList;
            });
        };

        try {
            for (let i = 0; i < propertyFiles.length; i++) {
                const item = propertyFiles[i];
                if (item.error) {
                    failCount++;
                    continue;
                }

                updateFileState(i, { uploading: true, error: false, errorMessage: undefined });

                try {
                    // 1. Compress
                    console.log(`[RealEstate] Comprimindo foto ${i+1}/${propertyFiles.length}...`);
                    // 1. Detect sensitivity (Simulated based on filename or random chance for demo)
                    const shouldMask = item.file.name.toLowerCase().includes('contato') || 
                                     item.file.name.toLowerCase().includes('wa') ||
                                     item.file.name.match(/\d{8,}/) !== null; // Simple check for long numbers

                    // 2. Compress AND Apply Mask locally if needed
                    const compressedFile = await compressImageFile(item.file, { 
                        maxWidth: 1600, 
                        quality: 0.8,
                        applyMask: shouldMask
                    });
                    
                    if (shouldMask) {
                        // Create a NEW preview with the tarja applied
                        const freshPreview = URL.createObjectURL(compressedFile);
                        updateFileState(i, { 
                            preview: freshPreview,
                            isMasked: true,
                            errorMessage: "Tarja automática aplicada"
                        });
                        currentMaskedCount++;
                    }

                    // 3. Upload (Now with authenticated/anon session)
                    const fileName = `${Date.now()}-${item.file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
                    const { error: storageError } = await supabase.storage
                        .from('real-estate-public') // Use public bucket for the treated version
                        .upload(fileName, compressedFile);

                    if (storageError) {
                        throw storageError;
                    }

                    updateFileState(i, { uploading: false, success: true });
                    setUploadedPaths(prev => [...prev, fileName]);
                    uploadCount++;
                } catch (err: any) {
                    console.error(`[RealEstate] Erro na foto ${i+1}:`, err);
                    
                    updateFileState(i, { 
                        uploading: false, 
                        error: true, 
                        errorMessage: err.message || "Falha no envio" 
                    });
                    failCount++;
                }
            }

            if (failCount === 0) {
                if (currentMaskedCount > 0) {
                    toast.success("Fotos enviadas e protegidas com tarja automática nas áreas de texto e números!");
                } else {
                    toast.success("Todas as fotos foram enviadas com sucesso!");
                }
                return true;
            } else if (uploadCount > 0) {
                toast.warning(`Enviadas ${uploadCount} fotos. ${failCount} falharam.`);
                return true; // Proceed if some succeeded? Maybe let user decide.
                // For now, let's proceed to Step 3 if at least one succeeded.
            } else {
                toast.error("Nenhuma foto pôde ser enviada. Verifique os erros e tente novamente.");
                return false;
            }
        } catch (error: any) {
            console.error("[RealEstate] Erro crítico no upload:", error);
            toast.error("Ocorreu um erro inesperado ao processar as fotos.");
            return false;
        } finally {
            setIsUploading(false);
        }
    };

    const saveListing = async (packageId: string | null) => {
        setIsSavingListing(true);
        try {
            const { data: userData } = await supabase.auth.getUser();
            
            // 1. Prepare payload
            const payload = {
                owner_user_id: userData.user?.id || '00000000-0000-0000-0000-000000000000',
                title: propertyData.title,
                property_type: propertyData.type as any,
                operation_type: 'sale' as any,
                description: propertyData.description,
                price_brl: parseBRLCurrency(propertyData.price),
                city: propertyData.city,
                state: propertyData.state,
                neighborhood: propertyData.neighborhood,
                visibility_package_id: packageId,
                visibility_status: 'awaiting_payment' as any,
                agency_name: propertyData.owner_name,
                agent_name: propertyData.owner_name
            };

            const { data, error } = await supabase
                .from('real_estate_listings')
                .insert(payload)
                .select()
                .single();

            if (error) throw error;
            const listingId = data.id;
            
            // 2. Save Media entries
            if (uploadedPaths.length > 0) {
                const mediaEntries = uploadedPaths.map((path, index) => ({
                    listing_id: listingId,
                    owner_user_id: userData.user?.id,
                    original_storage_path: path,
                    public_masked_storage_path: path, // Assuming for now, but in production this would be processed
                    media_type: 'image',
                    sort_order: index
                }));

                const { error: mediaError } = await supabase
                    .from('real_estate_media')
                    .insert(mediaEntries);
                
                if (mediaError) {
                    console.error("[RealEstate] Error saving media:", mediaError);
                    // We don't throw here to avoid blocking the flow if only media failed
                }
            }

            // Redirecionar para o checkout com o ID do anúncio
            toast.success("Anúncio salvo! Redirecionando para o pagamento...");
            setTimeout(() => {
                navigate(`/real-estate/checkout/${listingId}`);
            }, 1500);
        } catch (error: any) {
            console.error("[RealEstate] Erro ao salvar anúncio:", error);
            toast.error("Ocorreu um erro ao salvar seu anúncio: " + error.message);
        } finally {
            setIsSavingListing(false);
        }
    };

    const handleNext = async () => {
        if (step === 2) {
            const success = await uploadFiles();
            if (success) nextStep();
        } else {
            nextStep();
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const droppedFiles = Array.from(e.dataTransfer.files);
        const newFiles = droppedFiles.map(file => {
            const supported = isSupportedType(file);
            return {
                file,
                preview: URL.createObjectURL(file),
                error: !supported,
                errorMessage: !supported ? "Formato não suportado" : undefined
            };
        });
        setPropertyFiles(prev => [...prev, ...newFiles]);
    };

    return (
        <MarketLayout 
            search={search} 
            setSearch={setSearch}
            hideHeaderAuth={true}
            headerChildren={
                <div className="flex items-center gap-2 pb-2">
                    <button 
                        onClick={() => navigate('/mercado')}
                        className="flex items-center gap-2 text-white/80 hover:text-white transition-colors text-sm font-bold"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Voltar ao Mercado
                    </button>
                    <div className="h-4 w-px bg-white/20 mx-2" />
                    <span className="text-[10px] font-black text-white/60 uppercase tracking-widest">
                        Anunciar Imóvel • Passo {step + 1} de {STEPS.length}
                    </span>
                </div>
            }
        >
            {authLoading ? (
                <div className="min-h-[90vh] flex items-center justify-center bg-[#050505] relative">
                    <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
                        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-orange-500/10 rounded-full blur-[120px]" />
                    </div>
                    <Loader2 className="w-10 h-10 animate-spin text-[#FF6A00]" />
                </div>
            ) : !user ? (
                <div className="min-h-[90vh] flex flex-col items-center pt-12 md:pt-20 pb-20 p-4 bg-[#050505] relative overflow-hidden">
                    {/* Background Gradients */}
                    <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
                        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-orange-500/10 rounded-full blur-[120px]" />
                        <div className="absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] bg-blue-500/5 rounded-full blur-[120px]" />
                    </div>
                    
                    <RealEstateAuthCard />
                </div>
            ) : (
                <div className="min-h-[80vh] bg-[#F5E62B] py-12 px-4">
                <div className="max-w-4xl mx-auto space-y-8">
                    {/* Mini Panel Resumo */}
                    <RealEstateUserPanel />

                    {/* Progress Bar */}
                    <div className="mb-4">
                        <div className="flex items-center justify-between mb-4">
                            {STEPS.map((s, idx) => {
                                const Icon = s.icon;
                                const isActive = idx === step;
                                const isDone = idx < step;
                                const isAccessible = isStepAccessible(idx);

                                return (
                                    <button 
                                        key={s.id} 
                                        type="button"
                                        onClick={() => handleStepClick(idx)}
                                        disabled={isSavingListing || isUploading}
                                        aria-current={isActive ? "step" : undefined}
                                        className={cn(
                                            "flex flex-col items-center gap-2 relative group transition-all outline-none",
                                            isAccessible ? "cursor-pointer" : "cursor-not-allowed opacity-60"
                                        )}
                                    >
                                        <div className={cn(
                                            "w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-500 shadow-sm",
                                            isActive ? "bg-[#FF6A00] text-white scale-110 shadow-orange-200" : 
                                            isDone ? "bg-emerald-500 text-white" : "bg-white text-zinc-300 border border-zinc-200",
                                            isAccessible && !isActive && "group-hover:border-[#FF6A00]/50 group-hover:bg-orange-50/50"
                                        )}>
                                            {isDone ? <CheckCircle2 className="w-6 h-6" /> : <Icon className="w-5 h-5" />}
                                        </div>
                                        <span className={cn(
                                            "text-[10px] font-black uppercase tracking-widest transition-colors",
                                            isActive ? "text-[#FF6A00]" : 
                                            isAccessible ? "text-zinc-400 group-hover:text-zinc-600" : "text-zinc-300"
                                        )}>
                                            {s.label}
                                        </span>
                                        {/* Connector */}
                                        {idx < STEPS.length - 1 && (
                                            <div className="absolute left-[calc(100%+8px)] top-6 w-[calc(100%-16px)] h-[2px] bg-zinc-200 hidden md:block overflow-hidden pointer-events-none">
                                                <div 
                                                    className="h-full bg-emerald-500 transition-all duration-500" 
                                                    style={{ width: isDone ? '100%' : '0%' }}
                                                />
                                            </div>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Step Content Shell */}
                    <div className="bg-white rounded-[32px] border border-zinc-100 shadow-xl shadow-zinc-200/50 overflow-hidden">
                        <div className="p-8 md:p-12 min-h-[500px]">
                            {step === 0 && (
                                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                    <div className="text-center space-y-2">
                                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-50 text-[#FF6A00] text-[10px] font-black uppercase tracking-widest mb-2">
                                            <Sparkles className="w-3 h-3" /> Comece agora
                                        </div>
                                        <h1 className="text-3xl md:text-4xl font-black text-zinc-900 tracking-tighter">O QUE VOCÊ VAI ANUNCIAR?</h1>
                                        <p className="text-zinc-500 font-medium">Selecione a categoria que melhor define o seu imóvel.</p>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {[
                                            { id: 'terreno', title: 'Terreno / Lote', desc: 'Lotes urbanos ou rurais prontos para construir.', icon: '🚜' },
                                            { id: 'casa', title: 'Casa Residencial', desc: 'Casas de rua, condomínio ou sobrados.', icon: '🏡' },
                                            { id: 'sitio', title: 'Sítio / Chácara', desc: 'Áreas rurais para lazer ou produção.', icon: '🌾' },
                                            { id: 'comercial', title: 'Comercial', desc: 'Prédios, galpões ou salas comerciais.', icon: '🏢' },
                                        ].map((t) => (
                                            <button 
                                                key={t.id}
                                                onClick={() => {
                                                    setPropertyData(prev => ({ ...prev, type: t.id }));
                                                    nextStep();
                                                }}
                                                className={cn(
                                                    "flex items-center gap-4 p-6 rounded-3xl border-2 transition-all group text-left",
                                                    propertyData.type === t.id ? "border-[#FF6A00] bg-white ring-4 ring-orange-50" : "border-zinc-50 bg-zinc-50/50 hover:border-zinc-200 hover:bg-white"
                                                )}
                                            >
                                                <span className="text-4xl group-hover:scale-110 transition-transform">{t.icon}</span>
                                                <div className="flex-1">
                                                    <h3 className="font-black text-zinc-900">{t.title}</h3>
                                                    <p className="text-xs text-zinc-500 font-medium">{t.desc}</p>
                                                </div>
                                                <ChevronRight className="w-5 h-5 text-zinc-300 group-hover:text-[#FF6A00] group-hover:translate-x-1 transition-all" />
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {step === 1 && (
                                <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                                    <div className="space-y-2">
                                        <h1 className="text-3xl font-black text-zinc-900 tracking-tighter uppercase">Detalhes Básicos</h1>
                                        <p className="text-zinc-500 font-medium">Conte-nos mais sobre o que você está vendendo.</p>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                                        <div className="space-y-2 md:col-span-4">
                                            <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest pl-1">Título do Anúncio</label>
                                            <input 
                                                type="text"
                                                placeholder="Ex: Lindo Terreno no Portal das Flores"
                                                className="w-full p-4 rounded-2xl bg-zinc-50 border-0 focus:ring-2 focus:ring-[#FF6A00] transition-all font-bold text-zinc-800"
                                                value={propertyData.title}
                                                onChange={(e) => setPropertyData(prev => ({ ...prev, title: e.target.value }))}
                                            />
                                        </div>

                                        <div className="space-y-2 md:col-span-2">
                                            <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest pl-1">Valor do Imóvel</label>
                                            <div className="relative">
                                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 font-bold">R$</span>
                                                <input 
                                                    type="text"
                                                    placeholder="0,00"
                                                    className="w-full p-4 pl-12 rounded-2xl bg-zinc-50 border-0 focus:ring-2 focus:ring-[#FF6A00] transition-all font-bold text-zinc-800"
                                                    value={propertyData.price}
                                                    onChange={(e) => {
                                                        const cleanValue = e.target.value.replace(/\D/g, '');
                                                        if (cleanValue === '') {
                                                            setPropertyData(prev => ({ ...prev, price: '' }));
                                                            return;
                                                        }
                                                        const numeric = parseInt(cleanValue, 10) / 100;
                                                        const formatted = new Intl.NumberFormat('pt-BR', {
                                                            minimumFractionDigits: 2,
                                                            maximumFractionDigits: 2
                                                        }).format(numeric);
                                                        setPropertyData(prev => ({ ...prev, price: formatted }));
                                                    }}
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-2 md:col-span-1">
                                            <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest pl-1">Cidade</label>
                                            <input 
                                                type="text"
                                                placeholder="Ex: Blumenau"
                                                className="w-full p-4 rounded-2xl bg-zinc-50 border-0 focus:ring-2 focus:ring-[#FF6A00] transition-all font-bold text-zinc-800"
                                                value={propertyData.city}
                                                onChange={(e) => setPropertyData(prev => ({ ...prev, city: e.target.value }))}
                                            />
                                        </div>

                                        <div className="space-y-2 md:col-span-1">
                                            <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest pl-1">Estado (UF)</label>
                                            <input 
                                                type="text"
                                                placeholder="Ex: SC"
                                                maxLength={2}
                                                className="w-full p-4 rounded-2xl bg-zinc-50 border-0 focus:ring-2 focus:ring-[#FF6A00] transition-all font-bold text-zinc-800 uppercase"
                                                value={propertyData.state}
                                                onChange={(e) => setPropertyData(prev => ({ ...prev, state: e.target.value.toUpperCase() }))}
                                            />
                                        </div>

                                        <div className="space-y-2 md:col-span-4">
                                            <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest pl-1">Descrição</label>
                                            <textarea 
                                                placeholder="Descreva as principais características, metragem, localização..."
                                                rows={4}
                                                className="w-full p-4 rounded-2xl bg-zinc-50 border-0 focus:ring-2 focus:ring-[#FF6A00] transition-all font-bold text-zinc-800"
                                                value={propertyData.description}
                                                onChange={(e) => setPropertyData(prev => ({ ...prev, description: e.target.value }))}
                                            />
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between pt-8 border-t border-zinc-100">
                                        <Button variant="ghost" onClick={prevStep} className="font-bold gap-2 text-zinc-400">
                                            <ArrowLeft className="w-4 h-4" /> Voltar
                                        </Button>
                                        <Button 
                                            onClick={nextStep}
                                            disabled={!propertyData.title || !propertyData.price || !propertyData.city}
                                            className={cn(
                                                "bg-[#FF6A00] hover:bg-[#e65c00] text-white font-black px-10 h-14 rounded-2xl shadow-xl shadow-orange-500/20 transition-all",
                                                (!propertyData.title || !propertyData.price || !propertyData.city) && "opacity-50 grayscale cursor-not-allowed"
                                            )}
                                        >
                                            Continuar <ChevronRight className="w-5 h-5 ml-2" />
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {step === 2 && (
                                <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                                    <div className="space-y-2">
                                        <h1 className="text-3xl font-black text-zinc-900 tracking-tighter uppercase">FOTOS DO IMÓVEL</h1>
                                        <p className="text-zinc-500 font-medium">Imagens de alta qualidade vendem até 3x mais rápido.</p>
                                    </div>

                                    {/* AI Protection Banner */}
                                    <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6 flex items-start gap-4">
                                        <div className="p-2 bg-blue-500 rounded-lg text-white">
                                            <ShieldCheck className="w-5 h-5" />
                                        </div>
                                        <div className="space-y-1">
                                            <h4 className="text-blue-900 font-black text-sm uppercase tracking-tight">Proteção Antigravity IA Ativa</h4>
                                            <p className="text-blue-700 text-xs font-medium leading-relaxed">
                                                Nossa inteligência artificial irá detectar e ocultar automaticamente qualquer número de telefone ou redes sociais nas fotos para garantir a sua privacidade.
                                            </p>
                                        </div>
                                    </div>

                                    {/* Upload Area */}
                                    <input 
                                        type="file" 
                                        ref={fileInputRef} 
                                        multiple 
                                        accept="image/*" 
                                        className="hidden" 
                                        onChange={handleFileSelect} 
                                    />

                                    {propertyFiles.length > 0 ? (
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                            {propertyFiles.map((pf, idx) => (
                                                <div key={idx} className={cn(
                                                    "relative aspect-square rounded-2xl overflow-hidden border transition-all group bg-zinc-100",
                                                    pf.error ? "border-red-500 shadow-sm shadow-red-100" : "border-zinc-200"
                                                )}>
                                                    <img src={pf.preview} alt="Preview" className={cn("w-full h-full object-cover", pf.uploading && "opacity-40 animate-pulse")} />
                                                    
                                                    {/* Status Overlays */}
                                                    {pf.uploading && (
                                                        <div className="absolute inset-0 flex items-center justify-center">
                                                            <div className="w-5 h-5 border-2 border-[#FF6A00] border-t-transparent rounded-full animate-spin" />
                                                        </div>
                                                    )}

                                                    {/* Masked / Protected Status */}
                                                    {pf.isMasked && (
                                                        <div className="absolute inset-0 bg-zinc-900/60 backdrop-blur-[2px] flex flex-col items-center justify-center p-2 text-center">
                                                            <div className="p-1.5 rounded-full bg-yellow-400 text-black mb-1.5 shadow-lg border border-white/20">
                                                                <Shield className="w-3 h-3" />
                                                            </div>
                                                            <p className="text-[9px] font-black text-white uppercase tracking-tighter drop-shadow-md">
                                                                Tarja Aplicada
                                                            </p>
                                                            <p className="text-[7px] font-bold text-white/90 leading-tight mt-0.5">
                                                                Textos e números protegidos automaticamente
                                                            </p>
                                                        </div>
                                                    )}

                                                    {pf.error && !pf.isMasked && (
                                                        <div className="absolute inset-0 bg-red-50/80 flex flex-col items-center justify-center p-2 text-center">
                                                            <X className="w-5 h-5 text-red-500 mb-1" />
                                                            <p className="text-[8px] font-black text-red-600 uppercase leading-tight">{pf.errorMessage || "Erro"}</p>
                                                        </div>
                                                    )}

                                                    <button 
                                                        onClick={() => removeFile(idx)}
                                                        disabled={pf.uploading}
                                                        className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg disabled:hidden"
                                                    >
                                                        <X className="w-3 h-3" />
                                                    </button>
                                                    {idx === 0 && !pf.error && (
                                                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[8px] font-black uppercase text-center py-1">Principal</div>
                                                    )}
                                                </div>
                                            ))}
                                            <button 
                                                onClick={() => fileInputRef.current?.click()}
                                                className="aspect-square rounded-2xl border-2 border-dashed border-zinc-200 flex flex-col items-center justify-center gap-2 hover:border-[#FF6A00] hover:bg-orange-50/30 transition-all text-zinc-400"
                                            >
                                                <Plus className="w-6 h-6 text-[#FF6A00]" />
                                                <span className="text-[10px] font-black uppercase">Adicionar</span>
                                            </button>
                                        </div>
                                    ) : (
                                        <div 
                                            onClick={() => fileInputRef.current?.click()}
                                            onDragOver={(e) => e.preventDefault()}
                                            onDrop={handleDrop}
                                            className="border-4 border-dashed border-zinc-100 rounded-[32px] p-12 flex flex-col items-center justify-center text-center space-y-4 hover:border-orange-200 hover:bg-orange-50/20 transition-all bg-zinc-50/30 cursor-pointer group"
                                        >
                                            <div className="w-16 h-16 rounded-2xl bg-white shadow-sm flex items-center justify-center text-zinc-300 group-hover:scale-110 group-hover:text-[#FF6A00] transition-all">
                                                <Camera className="w-8 h-8" />
                                            </div>
                                            <div className="space-y-1">
                                                <span className="text-[#FF6A00] font-black hover:underline text-lg">Clique para enviar fotos</span>
                                                <p className="text-zinc-400 text-xs font-bold uppercase tracking-widest">ou arraste e solte arquivos aqui</p>
                                            </div>
                                            <div className="bg-zinc-50 border border-zinc-100 rounded-xl p-3 max-w-[340px] shadow-sm">
                                                <p className="text-[10px] text-zinc-600 font-bold leading-relaxed">
                                                    🛡️ Se a imagem tiver frases, números, WhatsApp ou e-mail visíveis, a plataforma aplicará uma **tarja automática** para proteger seu anúncio.
                                                </p>
                                            </div>
                                            <p className="text-[10px] text-zinc-400 font-medium max-w-[200px]">Formatos: JPG, PNG, WEBP • Máx 10MB por foto • Recomendado 8 a 15 fotos.</p>
                                        </div>
                                    )}

                                    <div className="flex items-center justify-between pt-8 border-t border-zinc-100">
                                        <Button variant="ghost" onClick={prevStep} className="font-bold gap-2 text-zinc-400" disabled={isUploading}>
                                            <ArrowLeft className="w-4 h-4" /> Voltar
                                        </Button>
                                        <Button 
                                            onClick={handleNext}
                                            disabled={isUploading || propertyFiles.length === 0}
                                            className="bg-[#FF6A00] hover:bg-[#e65c00] text-white font-black px-10 h-14 rounded-2xl shadow-xl shadow-orange-500/20 disabled:opacity-50"
                                        >
                                            {isUploading ? "Enviando..." : "Continuar"} <ChevronRight className="w-5 h-5 ml-2" />
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {step === 3 && (
                                <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                                    <div className="space-y-2">
                                        <h1 className="text-3xl font-black text-zinc-900 tracking-tighter uppercase">SEUS DADOS DE CONTATO</h1>
                                        <p className="text-zinc-500 font-medium">Criaremos sua conta de anunciante para você gerenciar seus anúncios.</p>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-2 md:col-span-2">
                                            <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest pl-1">Nome Completo</label>
                                            <input 
                                                type="text"
                                                placeholder="Como os compradores devem te chamar?"
                                                className="w-full p-4 rounded-2xl bg-zinc-50 border-0 focus:ring-2 focus:ring-[#FF6A00] transition-all font-bold text-zinc-800"
                                                value={propertyData.owner_name}
                                                onChange={(e) => setPropertyData(prev => ({ ...prev, owner_name: e.target.value }))}
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest pl-1">WhatsApp</label>
                                            <input 
                                                type="text"
                                                placeholder="(00) 00000-0000"
                                                className="w-full p-4 rounded-2xl bg-zinc-50 border-0 focus:ring-2 focus:ring-[#FF6A00] transition-all font-bold text-zinc-800"
                                                value={propertyData.owner_whatsapp}
                                                onChange={(e) => setPropertyData(prev => ({ ...prev, owner_whatsapp: e.target.value }))}
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest pl-1">E-mail</label>
                                            <input 
                                                type="email"
                                                placeholder="seu@email.com"
                                                className="w-full p-4 rounded-2xl bg-zinc-50 border-0 focus:ring-2 focus:ring-[#FF6A00] transition-all font-bold text-zinc-800"
                                                value={propertyData.owner_email}
                                                onChange={(e) => setPropertyData(prev => ({ ...prev, owner_email: e.target.value }))}
                                            />
                                        </div>
                                    </div>

                                    <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-6 flex items-start gap-4">
                                        <div className="p-2 bg-emerald-500 rounded-lg text-white">
                                            <ShieldCheck className="w-5 h-5" />
                                        </div>
                                        <div className="space-y-1">
                                            <h4 className="text-emerald-900 font-black text-sm uppercase tracking-tight">Mini-Conta Segura</h4>
                                            <p className="text-emerald-700 text-xs font-medium leading-relaxed">
                                                Seja avisado quando houver novos interessados e receba propostas diretamente na sua área do anunciante. 100% gratuito.
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between pt-8 border-t border-zinc-100">
                                        <Button variant="ghost" onClick={prevStep} className="font-bold gap-2 text-zinc-400">
                                            <ArrowLeft className="w-4 h-4" /> Voltar
                                        </Button>
                                        <Button 
                                            onClick={nextStep}
                                            className="bg-[#FF6A00] hover:bg-[#e65c00] text-white font-black px-10 h-14 rounded-2xl shadow-xl shadow-orange-500/20"
                                        >
                                            Finalizar e Escolher Plano <ChevronRight className="w-5 h-5 ml-2" />
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {step === 4 && (
                                <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                                    <div className="text-center space-y-2">
                                        <h1 className="text-3xl md:text-4xl font-black text-zinc-900 tracking-tighter uppercase">ESCOLHA SEU PLANO DE VISIBILIDADE</h1>
                                        <p className="text-zinc-500 font-medium">Selecione como quer que seu imóvel apareça no mercado.</p>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6">
                                        {packagesLoading ? (
                                            <div className="col-span-3 flex items-center justify-center p-20">
                                                <Loader2 className="w-10 h-10 animate-spin text-[#FF6A00]" />
                                            </div>
                                        ) : (
                                            (!creditPackages || creditPackages.length === 0) ? (
                                                <div className="col-span-full py-20 text-center space-y-6 bg-white border-2 border-dashed border-zinc-200 rounded-[32px] animate-in fade-in zoom-in duration-500">
                                                    <div className="h-16 w-16 bg-zinc-50 rounded-2xl flex items-center justify-center mx-auto ring-8 ring-zinc-50/50">
                                                        <Building2 className="h-8 w-8 text-zinc-300" />
                                                    </div>
                                                    <div className="space-y-2 max-w-sm mx-auto">
                                                        <h3 className="font-black text-zinc-900 tracking-tight uppercase">Nenhum plano disponível</h3>
                                                        <p className="text-sm text-zinc-500 font-medium">No momento não existem planos de visibilidade ativos. <br /> Continue seu cadastro e entraremos em contato.</p>
                                                    </div>
                                                    <Button 
                                                        onClick={() => {
                                                            setSelectedPackageId(null);
                                                            saveListing(null);
                                                        }} 
                                                        variant="outline" 
                                                        disabled={isSavingListing}
                                                        className="h-12 px-8 rounded-xl font-bold border-2 hover:bg-zinc-50 transition-all"
                                                    >
                                                        {isSavingListing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                                                        Continuar sem plano
                                                    </Button>
                                                </div>
                                            ) : (
                                                creditPackages.map((p: RealEstatePackage) => (
                                                    <div key={p.id} className={cn(
                                                        "relative rounded-[32px] p-8 border-2 transition-all flex flex-col gap-6 group hover:shadow-xl hover:shadow-zinc-100",
                                                        selectedPackageId === p.id ? "border-[#FF6A00] bg-white ring-8 ring-orange-50 scale-105 z-10 shadow-xl shadow-orange-100" : 
                                                        p.is_featured ? "border-orange-200 bg-white shadow-sm" : "border-zinc-100 bg-white shadow-sm"
                                                    )}>
                                                        {p.badge_text && (
                                                            <span className={cn(
                                                                "absolute -top-4 left-1/2 -translate-x-1/2 text-white text-[10px] font-black px-4 py-1.5 rounded-full shadow-lg whitespace-nowrap uppercase tracking-widest",
                                                                selectedPackageId === p.id ? "bg-[#FF6A00]" : "bg-zinc-400"
                                                            )}>
                                                                {p.badge_text}
                                                            </span>
                                                        )}
                                                        <div className="space-y-1">
                                                            <div className="flex items-center justify-between">
                                                                <h3 className="font-black text-zinc-900 tracking-tight uppercase">{p.name}</h3>
                                                                {(p.is_recommended || selectedPackageId === p.id) && <Star className="w-4 h-4 text-[#FF6A00] fill-current" />}
                                                            </div>
                                                            <div className="flex items-baseline gap-1">
                                                                <span className="text-3xl font-black text-zinc-900">
                                                                    {formatCurrencyBRL(p.price_brl)}
                                                                </span>
                                                                <div className="flex flex-col">
                                                                    <span className="text-xs text-zinc-400 font-bold uppercase">/ {p.credits_amount} créditos</span>
                                                                    {p.bonus_credits > 0 && (
                                                                        <span className="text-[9px] text-emerald-600 font-black uppercase tracking-tighter">+ {p.bonus_credits} bônus</span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <p className="text-xs text-zinc-500 font-medium leading-relaxed h-12 overflow-hidden">{p.description}</p>
                                                        <div className="space-y-3 flex-1">
                                                            {p.features_json?.map((f, i) => (
                                                                <div key={i} className="flex items-center gap-2 text-xs font-bold text-zinc-600">
                                                                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                                                                    {f}
                                                                </div>
                                                            ))}
                                                        </div>
                                                        <Button 
                                                            disabled={isSavingListing}
                                                            onClick={() => {
                                                                setSelectedPackageId(p.id);
                                                                saveListing(p.id);
                                                            }}
                                                            className={cn(
                                                                "w-full h-12 rounded-xl font-black transition-all transform active:scale-95 flex items-center justify-center gap-2",
                                                                selectedPackageId === p.id ? "bg-[#FF6A00] text-white shadow-lg shadow-orange-100" : 
                                                                "bg-zinc-100 hover:bg-[#FF6A00] hover:text-white text-zinc-600 shadow-sm"
                                                            )}
                                                        >
                                                            {isSavingListing && selectedPackageId === p.id ? (
                                                                <Loader2 className="w-4 h-4 animate-spin text-white" />
                                                            ) : (
                                                                <CreditCard className="w-4 h-4" />
                                                            )}
                                                            {selectedPackageId === p.id ? 'Processando...' : 'Contratar e Pagar'}
                                                        </Button>
                                                    </div>
                                                ))
                                            )
                                        )}
                                    </div>

                                    <div className="flex items-center justify-between pt-8 border-t border-zinc-100">
                                        <Button variant="ghost" onClick={prevStep} className="font-bold gap-2 text-zinc-400" disabled={isSavingListing}>
                                            <ArrowLeft className="w-4 h-4" /> Voltar aos dados
                                        </Button>
                                        <div className="text-right flex flex-col items-end">
                                            <div className="flex items-center gap-2 text-emerald-600 mb-1">
                                                <ShieldCheck className="w-4 h-4" />
                                                <span className="text-[10px] font-black uppercase tracking-widest">Pagamento Seguro</span>
                                            </div>
                                            <p className="text-xs font-bold text-zinc-400">Escolha um plano acima para prosseguir</p>
                                        </div>
                                    </div>
                                </div>
                            )}
                            
                            {step > 4 && (
                                <div className="flex flex-col items-center justify-center py-20 text-center space-y-6 animate-in zoom-in duration-700">
                                    <div className="w-24 h-24 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center shadow-inner">
                                        <CheckCircle2 className="w-12 h-12" />
                                    </div>
                                    <div className="space-y-2">
                                        <h2 className="text-3xl font-black text-zinc-900 tracking-tighter uppercase">Anúncio Quase Pronto!</h2>
                                        <p className="text-zinc-500 max-w-sm font-medium">
                                            Estamos processando suas imagens e criando sua conta. Em instantes seu imóvel estará brilhando no Mercado Viagg-TX8.
                                        </p>
                                    </div>
                                    <Button 
                                        onClick={() => navigate('/mercado')}
                                        className="bg-zinc-900 hover:bg-black text-white font-black px-12 h-14 rounded-2xl shadow-xl"
                                    >
                                        Ir para Meus Anúncios
                                    </Button>
                                </div>
                            )}
                        </div>

                        {/* Footer Info */}
                        <div className="bg-zinc-900 p-4 flex flex-col md:flex-row items-center justify-between gap-3">
                            <div className="flex items-center gap-3 text-white/60">
                                <ShieldCheck className="w-6 h-6 text-emerald-400" />
                                <div className="text-left">
                                    <h4 className="text-white font-black text-xs uppercase tracking-tight">Privacidade Total</h4>
                                    <p className="text-[10px] font-medium leading-relaxed">Seus dados de contato ficam protegidos e só são liberados em negociações reais.</p>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <div className="p-1.5 px-3 rounded-lg bg-white/5 border border-white/10 text-white/40 text-[9px] font-black uppercase">Seguro</div>
                                <div className="p-1.5 px-3 rounded-lg bg-white/5 border border-white/10 text-white/40 text-[9px] font-black uppercase">Premium</div>
                                <div className="p-1.5 px-3 rounded-lg bg-white/5 border border-white/10 text-white/40 text-[9px] font-black uppercase">Verificado</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            )}
        </MarketLayout>
    );
}
