export type IconName = 'profile' | 'daily' | 'settings' | 'menu' | 'hint' | 'undo' | 'shuffle' | 'back' | 'close';

export function Icon({ name, size = 26 }: { name: IconName; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  if (name === 'profile') return <svg {...common}><circle cx="12" cy="8" r="3.5" /><path d="M5.5 20c.7-4 2.8-6 6.5-6s5.8 2 6.5 6" /></svg>;
  if (name === 'daily') return <svg {...common}><circle cx="12" cy="12" r="3.5" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" /></svg>;
  if (name === 'settings') return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M12 2.8v2M12 19.2v2M4.5 4.5l1.4 1.4M18.1 18.1l1.4 1.4M2.8 12h2M19.2 12h2M4.5 19.5l1.4-1.4M18.1 5.9l1.4-1.4" /><circle cx="12" cy="12" r="7.2" /></svg>;
  if (name === 'menu') return <svg {...common}><path d="M5 7h14M5 12h14M5 17h14" /></svg>;
  if (name === 'hint') return <svg {...common}><path d="M8.2 15.4c-1.4-1.1-2.2-2.8-2.2-4.6a6 6 0 0 1 12 0c0 1.8-.8 3.5-2.2 4.6-.8.7-1.2 1.3-1.2 2.1H9.4c0-.8-.4-1.4-1.2-2.1Z" /><path d="M9.5 20.5h5M10 17.5h4" /></svg>;
  if (name === 'undo') return <svg {...common}><path d="M8 7H3v-5" /><path d="M3.7 6.3A8.5 8.5 0 1 1 4 18" /></svg>;
  if (name === 'shuffle') return <svg {...common}><path d="M3 7h3.5c5 0 5 10 10 10H21M18 14l3 3-3 3M3 17h3.5c1.7 0 2.8-1.2 3.8-2.8M14 8.5c.7-.9 1.5-1.5 2.7-1.5H21M18 4l3 3-3 3" /></svg>;
  if (name === 'back') return <svg {...common}><path d="M15.5 4 7.5 12l8 8" /></svg>;
  return <svg {...common}><path d="M5 5l14 14M19 5 5 19" /></svg>;
}
