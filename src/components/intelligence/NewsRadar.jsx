import { useMemo, useState } from 'react';
import NewsRow from './NewsRow';

// Category-filtered story list with keyboard-operable tabs.
const FILTERS = [
  ['all', 'All'],
  ['self_storage', 'Storage'],
  ['cre', 'CRE'],
  ['rates', 'Rates'],
  ['private_credit', 'Credit'],
  ['private_equity', 'PE'],
  ['macro', 'Macro'],
  ['saved', 'Saved'],
];

export default function NewsRadar({ stories = [], savedStories = [], onOpen, onToggleSave }) {
  const [filter, setFilter] = useState('all');

  const counts = useMemo(() => {
    const c = { all: stories.length, saved: savedStories.length };
    for (const s of stories) c[s.category] = (c[s.category] ?? 0) + 1;
    return c;
  }, [stories, savedStories]);

  const shown = useMemo(() => {
    if (filter === 'saved') return savedStories;
    if (filter === 'all') return stories;
    return stories.filter(s => s.category === filter);
  }, [filter, stories, savedStories]);

  return (
    <div>
      <div role="tablist" aria-label="Story categories" className="flex flex-wrap gap-1 mb-2">
        {FILTERS.map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={filter === key}
            onClick={() => setFilter(key)}
            className={`text-[11px] font-semibold rounded-md px-2 py-1 transition-colors ${
              filter === key ? 'bg-amber-500 text-slate-900' : 'text-slate-500 hover:text-white hover:bg-slate-800'
            }`}
          >
            {label}{counts[key] ? <span className="ml-1 tabular-nums opacity-70">{counts[key]}</span> : ''}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="text-xs text-slate-600 italic py-6 text-center">
          {filter === 'saved' ? 'No saved stories yet — tap the star on any story.' : 'No stories in this category yet.'}
        </p>
      ) : (
        <div className="max-h-[36rem] overflow-y-auto scrollbar-thin divide-y divide-slate-800/50">
          {shown.map(story => (
            <NewsRow key={story.id ?? story.url} story={story} onOpen={onOpen} onToggleSave={onToggleSave} />
          ))}
        </div>
      )}
    </div>
  );
}
