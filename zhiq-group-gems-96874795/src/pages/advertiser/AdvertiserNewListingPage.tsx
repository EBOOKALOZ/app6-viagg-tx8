import React, { useState, useRef } from "react";
import { PlusCircle, ArrowLeft, Building2, Package, Sparkles, Car, Camera, X, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

export default function AdvertiserNewListingPage() {
  const navigate = useNavigate();
  const [selectedFiles, setSelectedFiles] = useState<Record<string, { file: File, preview: string }[]>>({
    imovel: [],
    veiculo: [],
    produto: []
  });

  const fileInputRefs = {
    imovel: useRef<HTMLInputElement>(null),
    veiculo: useRef<HTMLInputElement>(null),
    produto: useRef<HTMLInputElement>(null)
  };

  const handleFileChange = (category: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newFiles = Array.from(files).map(file => ({
      file,
      preview: URL.createObjectURL(file)
    }));

    setSelectedFiles(prev => ({
      ...prev,
      [category]: [...prev[category], ...newFiles]
    }));
  };

  const removeFile = (category: string, index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const newFiles = [...selectedFiles[category]];
    URL.revokeObjectURL(newFiles[index].preview);
    newFiles.splice(index, 1);
    setSelectedFiles(prev => ({
      ...prev,
      [category]: newFiles
    }));
  };

  const handleStartListing = (category: string, path: string) => {
    // Passa os arquivos selecionados via state do roteador
    const filesToPass = selectedFiles[category].map(f => f.file);
    navigate(path, { state: { initialFiles: filesToPass } });
  };

  return (
    <div className="space-y-12 animate-in fade-in slide-in-from-bottom-6 duration-700">
      <div className="flex flex-col gap-4">
        <Button 
          variant="ghost" 
          onClick={() => navigate(-1)} 
          className="w-fit gap-2 h-10 px-4 rounded-xl text-zinc-500 hover:text-emerald-600 hover:bg-emerald-50 font-bold transition-all"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Button>
        <div className="space-y-1">
          <h1 className="text-4xl font-black text-zinc-900 tracking-tight flex items-center gap-4">
             <PlusCircle className="w-10 h-10 text-emerald-500" />
             NOVA PUBLICAÇÃO
          </h1>
          <p className="text-zinc-500 font-medium tracking-tight uppercase text-xs tracking-[0.2em]">Escolha a categoria e adicione a primeira foto</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
         
         {/* Cards IMÓVEL e VEÍCULO ocultados */}

          {/* -- PRODUTO -- */}
          <CategoryCard 
            title="PRODUTOS"
            desc="Eletrônicos, móveis e variados."
            icon={<Package className="w-10 h-10 text-yellow-500" />}
            accentColor="yellow"
            files={selectedFiles.produto}
            onFileAdd={() => fileInputRefs.produto.current?.click()}
            onFileRemove={(idx, e) => removeFile('produto', idx, e)}
            onAction={() => handleStartListing('produto', '/anunciante/anuncios/novo/produto')}
            buttonText="Anunciar Produto"
          >
             <input 
              type="file" 
              ref={fileInputRefs.produto} 
              multiple 
              className="hidden" 
              onChange={(e) => handleFileChange('produto', e)} 
              accept="image/*"
            />
          </CategoryCard>

      </div>

      <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-[40px] p-10 border border-emerald-100 flex flex-col md:flex-row items-center gap-8 justify-between shadow-sm">
         <div className="flex items-center gap-6">
            <div className="w-16 h-16 rounded-2xl bg-white flex items-center justify-center text-emerald-500 shadow-xl shadow-emerald-200/50">
              <Sparkles className="w-8 h-8" />
            </div>
            <div className="space-y-0.5">
              <h4 className="text-lg font-black text-zinc-900 uppercase tracking-tight leading-none">Venda Inteligente</h4>
              <p className="text-zinc-500 text-sm font-medium">Nossa IA ajuda a analisar as fotos e sugerir preços.</p>
            </div>
         </div>
         <Button variant="outline" className="h-14 px-8 rounded-2xl border-emerald-200 bg-white text-emerald-600 font-black uppercase text-xs tracking-widest hover:bg-emerald-600 hover:text-white transition-all">
           ABRIR ASSISTENTE
         </Button>
      </div>
    </div>
  );
}

// Subcomponente de Card para evitar re-escrita
function CategoryCard({ 
  title, desc, icon, accentColor, files, onFileAdd, onFileRemove, onAction, buttonText, children 
}: any) {
  const colors: any = {
    orange: "bg-orange-600 hover:bg-orange-700 shadow-orange-600/20 text-orange-500 hover:shadow-orange-200/40",
    blue: "bg-blue-600 hover:bg-blue-700 shadow-blue-600/20 text-blue-500 hover:shadow-blue-200/40",
    emerald: "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20 text-emerald-500 hover:shadow-emerald-200/40",
    yellow: "bg-yellow-400 hover:bg-yellow-300 shadow-yellow-400/30 text-yellow-500 hover:shadow-yellow-200/40"
  };

  const colorKey = colors[accentColor].split(" ");

  return (
    <Card 
      onClick={onAction}
      className={cn("border-none shadow-2xl shadow-zinc-200/50 rounded-[40px] overflow-hidden bg-white group transition-all duration-500 cursor-pointer", colorKey[3])}
    >
      <CardContent className="p-10 flex flex-col items-center text-center space-y-8 h-full">
        {children}
        
        {/* Ícone e Título */}
        <div className="w-24 h-24 rounded-[32px] bg-zinc-900 text-white flex items-center justify-center p-0.5 shadow-xl transition-all group-hover:scale-105">
           <div className="w-full h-full bg-zinc-800 rounded-[30px] flex items-center justify-center border border-white/10">
              {icon}
           </div>
        </div>

        <div className="space-y-2 flex-grow">
           <h2 className="text-2xl font-black text-zinc-900 uppercase tracking-tight">{title}</h2>
           <p className="text-zinc-400 text-xs font-bold uppercase tracking-widest">{desc}</p>
        </div>

        {/* ÁREA DE PREVIEW / UPLOAD */}
        <div className="w-full space-y-4">
           {files.length === 0 ? (
             <div 
               onClick={(e) => { e.stopPropagation(); onFileAdd(); }}
               className="group/upload py-4 border-2 border-dashed border-zinc-100 rounded-2xl hover:border-zinc-300 transition-all flex items-center justify-center gap-3 text-zinc-400 hover:text-zinc-900 bg-zinc-50/50"
             >
                <Camera className="w-5 h-5" />
                <span className="text-[10px] font-black uppercase tracking-widest">Adicionar Fotos</span>
             </div>
           ) : (
             <div className="grid grid-cols-3 gap-2 py-2">
               {files.map((file: any, i: number) => (
                 <div key={i} className="relative aspect-square rounded-xl overflow-hidden border border-zinc-100 shadow-sm animate-in zoom-in-50">
                    <img src={file.preview} className="w-full h-full object-cover" alt="prev" />
                    <button 
                      onClick={(e) => onFileRemove(i, e)}
                      className="absolute top-1 right-1 p-1 bg-white/90 rounded-lg text-red-500 shadow-sm"
                    >
                      <X className="w-3 h-3" />
                    </button>
                 </div>
               ))}
               {files.length < 3 && (
                 <button 
                    onClick={(e) => { e.stopPropagation(); onFileAdd(); }}
                    className="aspect-square rounded-xl border-2 border-dashed border-zinc-100 flex items-center justify-center text-zinc-300 hover:text-zinc-600 hover:bg-zinc-50"
                 >
                    <ImageIcon className="w-4 h-4" />
                 </button>
               )}
             </div>
           )}
        </div>

        <Button
          className={cn(
            "w-full font-black uppercase text-[10px] tracking-widest h-14 rounded-2xl transition-all shadow-xl",
            colorKey[0], colorKey[1], colorKey[2],
            accentColor === 'yellow' && '!text-zinc-900'
          )}
        >
           {buttonText}
        </Button>
      </CardContent>
    </Card>
  );
}
