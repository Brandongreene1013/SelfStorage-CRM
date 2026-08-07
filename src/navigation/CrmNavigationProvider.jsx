import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CrmNavigationContext } from './CrmNavigationContext';

export default function CrmNavigationProvider({ children }) {
  const [handlers, setHandlers] = useState([]);
  const nextIdRef = useRef(1);

  const registerBackHandler = useCallback((handler) => {
    const entry = { ...handler, id: nextIdRef.current++ };
    setHandlers(current => [...current, entry]);
    return () => setHandlers(current => current.filter(item => item.id !== entry.id));
  }, []);

  const activeHandler = useMemo(() => [...handlers]
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || b.id - a.id)
    .find(handler => handler.active !== false), [handlers]);

  const goBack = useCallback(() => {
    if (!activeHandler) return false;
    activeHandler.onBack();
    return true;
  }, [activeHandler]);

  useEffect(() => {
    const handleKeyboardBack = (event) => {
      if (event.defaultPrevented) return;
      if (event.altKey && event.key === 'ArrowLeft') {
        if (goBack()) event.preventDefault();
      }
    };
    window.addEventListener('keydown', handleKeyboardBack);
    return () => window.removeEventListener('keydown', handleKeyboardBack);
  }, [goBack]);

  const value = useMemo(() => ({
    registerBackHandler,
    goBack,
    canGoBack: Boolean(activeHandler),
    backLabel: activeHandler?.label || 'Back',
  }), [activeHandler, goBack, registerBackHandler]);

  return <CrmNavigationContext.Provider value={value}>{children}</CrmNavigationContext.Provider>;
}
