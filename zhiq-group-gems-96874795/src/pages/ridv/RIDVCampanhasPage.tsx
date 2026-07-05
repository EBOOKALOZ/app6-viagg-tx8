import { useState } from 'react';
import { Megaphone, Radio } from 'lucide-react';
import { RIDVCampaignList, MOCK_RIDV_CAMPAIGNS } from '@/components/ridv/RIDVCampaignList';
import { RIDVShareButtons } from '@/components/ridv/RIDVShareButtons';

export default function RIDVCampanhasPage() {
  const [favoritedIds, setFavoritedIds] = useState(new Set<string>());

  const handleFavorite = (id: string) => {
    setFavoritedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex-1 overflow-auto pb-28 bg-background">
      <div className="max-w-2xl mx-auto px-4 py-5 space-y-6">

        {/* Section header */}
        <div className="flex items-center gap-3">
          <div
            className="p-2 rounded-xl"
            style={{ background: 'rgba(255,106,0,0.12)', border: '1px solid rgba(255,106,0,0.20)' }}
          >
            <Megaphone className="h-5 w-5 text-orange-400" />
          </div>
          <div>
            <h2 className="text-base font-black text-foreground/90 leading-none">Campanhas Disponíveis</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Distribuídas automaticamente pela RIDV para sua região
            </p>
          </div>
        </div>

        {/* Campaign list */}
        <RIDVCampaignList
          campaigns={MOCK_RIDV_CAMPAIGNS}
          onShare={(id) => console.log('[RIDV] share campaign', id)}
          onView={(id) => console.log('[RIDV] view campaign', id)}
          onFavorite={handleFavorite}
          favoritedIds={favoritedIds}
        />

        {/* Share channels */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Radio className="h-3.5 w-3.5 text-[#A7B0BE]/40" />
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#A7B0BE]/40">
              Canais de compartilhamento
            </p>
          </div>
          <div
            className="rounded-2xl p-4"
            style={{
              background: 'linear-gradient(145deg, #1B1F24, #0D0F12)',
              border: '1px solid rgba(42,48,56,0.80)',
            }}
          >
            <p className="text-[11px] text-[#A7B0BE]/50 mb-3 leading-relaxed">
              Escolha uma campanha acima e compartilhe pelo seu canal preferido:
            </p>
            <RIDVShareButtons onShare={(ch) => console.log('[RIDV] share via', ch)} />
          </div>
        </div>

      </div>
    </div>
  );
}
