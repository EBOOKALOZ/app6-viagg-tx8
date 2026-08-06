import React, { useState } from 'react';
import { useDynamicCategoryImages } from '@/hooks/useDynamicCategoryImages';

const CATEGORY_ICONS: Record<string, string> = {
    "lanches": "🍔", "pizzas": "🍕", "pizza": "🍕", "japonesa": "🍣",
    "marmitas": "🥗", "marmita": "🥗", "bebidas": "🧃", "mercado": "🛒",
    "doces": "🍰", "açaí": "🫐", "sorvetes": "🍦", "pastel": "🩹",
    "churrasco": "🍖", "saudável": "🥦", "vegano": "🥑", "café": "☕",
    "padaria": "🥐", "farmácia": "💊", "pet": "🐾", "flores": "🌻",
    "eletrônicos": "📱", "moda": "👗", "beleza": "💄", "esportes": "⚽",
    "casa": "🏠", "automotivo": "🚗", "brinquedos": "🧸", "livros": "📚",
    "serviços": "🛠️", "artesanato": "🎨", "games": "🎮", "ferramentas": "🔧",
    "informática": "💻", "celulares": "📲", "outros": "📦",
    "alimentos": "🍽️", "alimentos & bebidas": "🍽️",
    "casa & decoração": "🏠", "beleza & saúde": "💄",
    "imóveis": "🏠", "imoveis": "🏠", "terrenos": "🚜",
};

const CATEGORY_KEYWORDS: Array<[string, string]> = [
    ["hortifruti", "🥬"], ["horti", "🥬"], ["verdura", "🥬"], ["legume", "🥕"], ["fruta", "🍎"],
    ["videoaula", "🎬"], ["curso", "🎓"], ["aula", "🎓"], ["ebook", "📘"], ["educac", "🎓"], ["treinamento", "🎓"],
    ["tipografi", "🔤"], ["fonte", "🔤"],
    ["abajur", "💡"], ["luminaria", "💡"], ["lampada", "💡"], ["ilumin", "💡"],
    ["construc", "🧱"], ["ferramenta", "🔧"], ["eletrica", "🔌"], ["hidraulic", "🚿"],
    ["smartphone", "📱"], ["celular", "📱"], ["telefone", "📞"],
    ["acessorios de computador", "🖱️"], ["acessorio de computador", "🖱️"], ["mouse", "🖱️"], ["teclado", "⌨️"], ["monitor", "🖥️"],
    ["software", "💿"], ["licenca", "🔑"], ["aplicativo", "📲"], ["app", "📲"],
    ["informatica", "🖥️"], ["notebook", "💻"], ["computador", "💻"], ["hardware", "🖥️"],
    ["arte", "🎨"], ["design", "🎨"], ["grafic", "🎨"], ["artesanato", "🧶"],
    ["alimento", "🥗"], ["comida", "🍽️"], ["lanche", "🍔"], ["bebida", "🧃"], ["doce", "🍰"], ["cafe", "☕"], ["padaria", "🥐"],
    ["fone", "🎧"], ["camera", "📷"], ["televis", "📺"], ["console", "🕹️"], ["game", "🎮"], ["eletronic", "🔌"],
    ["moda", "👗"], ["roupa", "👕"], ["calcado", "👟"], ["sapato", "👟"], ["bolsa", "👜"], ["joia", "💍"], ["relogio", "⌚"], ["oculos", "🕶️"],
    ["beleza", "💄"], ["cosmetic", "💄"], ["perfume", "🧴"], ["saude", "💊"], ["farmac", "💊"],
    ["esporte", "⚽"], ["fitness", "🏋️"], ["bicicleta", "🚲"],
    ["decorac", "🛋️"], ["movel", "🛋️"], ["movei", "🛋️"], ["cozinha", "🍳"], ["casa", "🏠"],
    ["automov", "🚗"], ["veiculo", "🚗"], ["carro", "🚗"], ["moto", "🏍️"], ["pneu", "🛞"], ["pecas", "⚙️"],
    ["pet", "🐾"], ["animal", "🐾"], ["flor", "🌻"], ["planta", "🪴"], ["jardim", "🌱"],
    ["brinquedo", "🧸"], ["bebe", "🍼"], ["infantil", "🧸"],
    ["livro", "📚"], ["papelaria", "✏️"], ["escritorio", "🗂️"],
    ["musica", "🎵"], ["instrumento", "🎸"],
    ["imovel", "🏠"], ["imovei", "🏠"], ["terreno", "🌳"], ["aluguel", "🔑"],
    ["servico", "🛠️"],
];

function normalizeCategoryKey(value: string): string {
    return (value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
}

function getCategoryIcon(nome: string, icone: string | null): string {
    if (icone && icone.trim() && icone.trim() !== "🏷️") return icone.trim();
    const key = normalizeCategoryKey(nome);
    const exact = CATEGORY_ICONS[key] ?? CATEGORY_ICONS[nome.toLowerCase().trim()];
    if (exact) return exact;
    for (const [kw, emoji] of CATEGORY_KEYWORDS) {
        if (key.includes(kw)) return emoji;
    }
    return icone?.trim() || "🏷️";
}

function twemojiUrl(emoji: string): string {
    const cps: string[] = [];
    for (const ch of emoji) {
        const cp = ch.codePointAt(0);
        if (cp === undefined || cp === 0xfe0f || cp === 0x200d) continue;
        cps.push(cp.toString(16));
    }
    return `https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg/${cps.join("-")}.svg`;
}

interface DynamicCategoryIconProps {
  nome: string;
  icone?: string | null;
  className?: string;
}

export function DynamicCategoryIcon({ nome, icone = null, className = "w-8 h-8" }: DynamicCategoryIconProps) {
  const { data: configs } = useDynamicCategoryImages();
  const [failed, setFailed] = useState(false);

  // Procure uma imagem dinâmica ativa
  const config = configs?.find(c => normalizeCategoryKey(c.category_name) === normalizeCategoryKey(nome));
  const activeImageUrl = config?.is_active ? (config.fixed_image_url || config.current_dynamic_url) : null;

  if (activeImageUrl && !failed) {
    return (
      <img
        src={activeImageUrl}
        alt={nome}
        loading="lazy"
        className={`${className} object-cover rounded-full select-none pointer-events-none ring-2 ring-primary/10`}
        onError={() => setFailed(true)}
      />
    );
  }

  // Fallback para Twemoji estático
  const emoji = getCategoryIcon(nome, icone);
  if (failed) return <span className={`text-3xl leading-none ${className} flex items-center justify-center`}>{emoji}</span>;
  
  return (
    <img
      src={twemojiUrl(emoji)}
      alt={nome}
      loading="lazy"
      className={`${className} object-contain select-none pointer-events-none`}
      onError={() => setFailed(true)}
    />
  );
}
