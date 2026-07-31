import { useContext, useEffect, useRef } from 'react';
import { CrmNavigationContext } from './CrmNavigationContext';

export function useCrmNavigation() {
  const context = useContext(CrmNavigationContext);
  if (!context) throw new Error('useCrmNavigation must be used inside CrmNavigationProvider');
  return context;
}

export function useCrmBackHandler({ active = true, onBack, label = 'Back', priority = 0 }) {
  const { registerBackHandler } = useCrmNavigation();
  const onBackRef = useRef(onBack);

  useEffect(() => {
    onBackRef.current = onBack;
  }, [onBack]);

  useEffect(() => {
    if (!active) return undefined;
    return registerBackHandler({
      active: true,
      label,
      priority,
      onBack: () => onBackRef.current?.(),
    });
  }, [active, label, priority, registerBackHandler]);
}
