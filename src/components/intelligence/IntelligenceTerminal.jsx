import { useState } from 'react';
import { useMarketIntelligence } from '../../hooks/useMarketIntelligence';
import MarketTape from './MarketTape';
import DailyBrief from './DailyBrief';
import DealEnvironment from './DealEnvironment';
import NewsRadar from './NewsRadar';
import StoryDrawer from './StoryDrawer';
import ProviderStatus from './ProviderStatus';

// The market-intelligence terminal section. Reads cached data only. Renders a
// useful state for every condition: loading, not-configured, migration-needed,
// empty (pre-first-pull), failure, and the full terminal. Never blocks the CRM.
export default function IntelligenceTerminal() {
  const { data, loading, error, reload, setFlag, configured, migrationNeeded } = useMarketIntelligence();
  const [openStory, setOpenStory] = useState(null);

  const toggleSave = (story) => setFlag(story.id, { is_saved: !story.isSaved });
  const openAndRead = (story) => { setOpenStory(story); if (!story.isRead) setFlag(story.id, { is_read: true }); };

  const hasContent = data && (data.snapshot || (data.topStories?.length) || (data.marketTape?.length));

  return (
    <section aria-label="Market intelligence" className="bg-slate-900 border border-slate-800/90 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.35)] ring-1 ring-inset ring-white/[0.03] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-1.5 h-4 rounded-sm bg-amber-500 flex-shrink-0" />
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-200">Storage Hunters Intelligence</h2>
        </div>
        <button
          onClick={reload}
          disabled={loading}
          className="text-[11px] font-semibold text-slate-500 hover:text-amber-400 disabled:opacity-40 transition-colors"
          title="Reload cached data"
        >
          {loading ? 'Loading…' : '↻ Refresh'}
        </button>
      </div>

      <div className="p-4">
        {loading && !data && <Skeleton />}

        {!loading && !configured && (
          <Notice tone="slate" title="Market intelligence isn't configured yet">
            Add <code className="text-amber-300">FRED_API_KEY</code> and <code className="text-amber-300">MARKET_INTELLIGENCE_SECRET</code> in Vercel, then run the first refresh. The rest of your dashboard is unaffected.
          </Notice>
        )}

        {!loading && configured && migrationNeeded && (
          <Notice tone="amber" title="One-time database migration needed">
            Run <code className="text-amber-300">sql/market_intelligence_migration.sql</code> in Supabase, then refresh.
          </Notice>
        )}

        {!loading && error && (
          <Notice tone="red" title="Couldn't load market intelligence">
            {error}. Your CRM is unaffected — this panel will recover on the next refresh.
          </Notice>
        )}

        {!loading && configured && !migrationNeeded && !error && !hasContent && (
          <Notice tone="slate" title="Awaiting the first data pull">
            The pipeline is connected but hasn't ingested yet. Trigger a refresh (or wait for the morning schedule) to populate rates, news, and the daily brief.
          </Notice>
        )}

        {data && hasContent && (
          <div className="space-y-4">
            <MarketTape tape={data.marketTape} />

            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-4">
              <div className="space-y-4">
                <DailyBrief snapshot={data.snapshot} />
                {data.snapshot?.dealEnvironment && (
                  <div className="rounded-lg border border-slate-800/80 bg-slate-950/40 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Deal Environment</p>
                    <DealEnvironment dealEnvironment={data.snapshot.dealEnvironment} />
                  </div>
                )}
              </div>

              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">News Radar</p>
                <NewsRadar
                  stories={data.topStories ?? []}
                  savedStories={data.savedStories ?? []}
                  onOpen={openAndRead}
                  onToggleSave={toggleSave}
                />
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800/60">
              <ProviderStatus statuses={data.providerStatus} generatedAt={data.generatedAt} stale={data.stale} />
            </div>
          </div>
        )}
      </div>

      {openStory && <StoryDrawer story={openStory} onClose={() => setOpenStory(null)} onToggleSave={toggleSave} />}
    </section>
  );
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-12 bg-slate-800/60 rounded-lg" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="h-40 bg-slate-800/50 rounded-lg" />
        <div className="h-40 bg-slate-800/50 rounded-lg" />
      </div>
    </div>
  );
}

function Notice({ tone = 'slate', title, children }) {
  const tones = {
    slate: 'border-slate-800 bg-slate-950/40 text-slate-400',
    amber: 'border-amber-700/40 bg-amber-950/20 text-amber-200',
    red: 'border-red-900/50 bg-red-950/20 text-red-200',
  };
  return (
    <div className={`rounded-lg border px-3 py-3 text-xs ${tones[tone]}`}>
      <p className="font-semibold mb-0.5">{title}</p>
      <p className="leading-snug opacity-90">{children}</p>
    </div>
  );
}
