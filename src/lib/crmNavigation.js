export const CRM_HISTORY_LIMIT = 50;

export function pushCrmView(history, currentView, nextView) {
  if (!nextView || nextView === currentView) return [...history];
  return [...history, currentView].filter(Boolean).slice(-CRM_HISTORY_LIMIT);
}

export function popCrmView(history, fallbackView = 'Dashboard') {
  if (!history.length) return { view: fallbackView, history: [] };
  return {
    view: history.at(-1),
    history: history.slice(0, -1),
  };
}
