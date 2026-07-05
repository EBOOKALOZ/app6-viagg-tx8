import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Inbox, Play, CheckCircle2, Clock4, XCircle } from 'lucide-react';
import { RIDVCampaignCard, type RIDVCampaign } from './RIDVCampaignCard';
import { MOCK_RIDV_CAMPAIGNS } from './RIDVCampaignList';

type TabKey = 'received' | 'active' | 'finished' | 'expired';

interface TabConfig {
  key: TabKey;
  label: string;
  icon: typeof Inbox;
  color: string;
}

const TABS: TabConfig[] = [
  { key: 'received', label: 'Recebidas', icon: Inbox,       color: 'text-sky-400' },
  { key: 'active',   label: 'Ativas',    icon: Play,        color: 'text-emerald-400' },
  { key: 'finished', label: 'Concluídas',icon: CheckCircle2,color: 'text-violet-400' },
  { key: 'expired',  label: 'Expiradas', icon: XCircle,     color: 'text-rose-400' },
];

// Simulated data distribution (all from mock in this phase)
const MOCK_DATA: Record<TabKey, RIDVCampaign[]> = {
  received: MOCK_RIDV_CAMPAIGNS,
  active:   MOCK_RIDV_CAMPAIGNS.slice(0, 3),
  finished: [],
  expired:  [],
};

interface RIDVActiveCampaignsProps {
  onShare?: (id: string) => void;
  onView?: (id: string) => void;
  onFavorite?: (id: string) => void;
  favoritedIds?: Set<string>;
}

export function RIDVActiveCampaigns({
  onShare,
  onView,
  onFavorite,
  favoritedIds = new Set(),
}: RIDVActiveCampaignsProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('received');

  const items = MOCK_DATA[activeTab] ?? [];

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex gap-1 overflow-x-auto scrollbar-hide">
        {TABS.map((tab) => {
          const isActive = tab.key === activeTab;
          const count = MOCK_DATA[tab.key].length;
          const TabIcon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider whitespace-nowrap transition-all active:scale-95',
                isActive
                  ? 'text-white shadow-lg'
                  : 'text-[#A7B0BE]/50 hover:text-[#A7B0BE]/80'
              )}
              style={isActive ? {
                background: 'linear-gradient(135deg, #1B1F24, #0D0F12)',
                border: '1px solid rgba(255,255,255,0.10)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.30)',
              } : {
                background: 'transparent',
                border: '1px solid transparent',
              }}
            >
              <TabIcon className={cn('h-3 w-3 shrink-0', isActive ? tab.color : '')} />
              {tab.label}
              {count > 0 && (
                <span
                  className={cn(
                    'text-[9px] font-black min-w-[16px] h-4 inline-flex items-center justify-center rounded-full px-1',
                    isActive ? `${tab.color} bg-white/10` : 'text-[#A7B0BE]/30 bg-white/5'
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {items.length === 0 ? (
        <div
          className="rounded-2xl p-10 text-center"
          style={{
            background: 'linear-gradient(145deg, #1B1F24, #0D0F12)',
            border: '2px dashed rgba(42,48,56,0.80)',
          }}
        >
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3 text-2xl"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
            {activeTab === 'finished' ? '✅' : activeTab === 'expired' ? '⏰' : '📭'}
          </div>
          <p className="font-black text-[#A7B0BE]/50 text-sm">
            {activeTab === 'received' && 'Nenhuma campanha recebida'}
            {activeTab === 'active' && 'Nenhuma campanha ativa'}
            {activeTab === 'finished' && 'Nenhuma campanha concluída'}
            {activeTab === 'expired' && 'Nenhuma campanha expirada'}
          </p>
          <p className="text-[11px] text-[#A7B0BE]/30 mt-1.5 max-w-[200px] mx-auto leading-relaxed">
            {activeTab === 'received' || activeTab === 'active'
              ? 'Novas campanhas chegarão automaticamente pela RIDV.'
              : 'O histórico aparecerá aqui quando você compartilhar campanhas.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((c) => (
            <RIDVCampaignCard
              key={c.id}
              campaign={c}
              compact
              onShare={onShare}
              onView={onView}
              onFavorite={onFavorite}
              isFavorited={favoritedIds.has(c.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
