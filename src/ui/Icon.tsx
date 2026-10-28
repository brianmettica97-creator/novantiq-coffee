const PATHS = {
  search: 'M11 4a7 7 0 1 0 4.2 12.6l4.1 4.1 1.4-1.4-4.1-4.1A7 7 0 0 0 11 4Zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z',
  close: 'M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4Z',
  back: 'M15.4 5.4 14 4l-8 8 8 8 1.4-1.4L8.8 12Z',
  next: 'm8.6 5.4 1.4-1.4 8 8-8 8-1.4-1.4 6.6-6.6Z',
  up: 'M12 6.6 5.4 13.2l1.4 1.4L12 9.4l5.2 5.2 1.4-1.4Z',
  play: 'M8 5.5v13l10.5-6.5Z',
  pause: 'M7 5h3.5v14H7zm6.5 0H17v14h-3.5Z',
  clock: 'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18Zm0 2a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm1 2v4.6l3.2 1.9-1 1.7L11 12.7V7Z',
  pin: 'M12 2a7 7 0 0 1 7 7c0 5-7 13-7 13S5 14 5 9a7 7 0 0 1 7-7Zm0 4.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z',
  instagram: 'M7.5 3h9A4.5 4.5 0 0 1 21 7.5v9a4.5 4.5 0 0 1-4.5 4.5h-9A4.5 4.5 0 0 1 3 16.5v-9A4.5 4.5 0 0 1 7.5 3Zm0 2A2.5 2.5 0 0 0 5 7.5v9A2.5 2.5 0 0 0 7.5 19h9a2.5 2.5 0 0 0 2.5-2.5v-9A2.5 2.5 0 0 0 16.5 5Zm4.5 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8Zm0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm4.6-3.6a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z',
  phone: 'M7 2h3l1.5 5-2 1.5a12 12 0 0 0 6 6L17 12.5l5 1.5v3a3 3 0 0 1-3 3A17 17 0 0 1 4 5a3 3 0 0 1 3-3Z',
  check: 'm9.5 16.2-4.2-4.2-1.4 1.4 5.6 5.6 11-11-1.4-1.4Z',
  plus: 'M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6Z',
  minus: 'M5 11h14v2H5Z',
  reset: 'M12 5a7 7 0 1 1-6.9 8.2l2-.4A5 5 0 1 0 12 7a5 5 0 0 0-3.5 1.5L10.9 11H4V4.1l2.1 2.1A7 7 0 0 1 12 5Z',
  volumeOff: 'M4 9h4l5-4v14l-5-4H4Zm12.3 0 1.7 1.7L19.7 9l1.4 1.4-1.7 1.6 1.7 1.7-1.4 1.4-1.7-1.7-1.7 1.7-1.4-1.4 1.7-1.7-1.7-1.6Z',
  sparkle: 'M12 2l2 6.5L20.5 10 14 12l-2 6.5L10 12 3.5 10 10 8.5Z',
  leaf: 'M20 4S8 3 5 10c-1.8 4.2.6 7.4.6 7.4L4 19l1.4 1.4 1.7-1.7S10 21 14 19c7-3.5 6-15 6-15Zm-3.7 3.6c-4 1.6-6.6 4.6-8 8l-1-.6c1.4-3.6 4.2-6.8 8.6-8.6Z',
  menu: 'M4 6h16v2H4Zm0 5h16v2H4Zm0 5h16v2H4Z',
} as const;

/** Íconos de trazo (se dibujan con stroke en lugar de relleno). */
const STROKES = {
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z',
  sliders: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 4.5v5M9 14.5v5',
  card: 'M3 7.5A2.5 2.5 0 0 1 5.5 5h13A2.5 2.5 0 0 1 21 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5ZM3 10h18M7 15h4',
  bell: 'M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15ZM10 20.5a2 2 0 0 0 4 0',
  receipt: 'M6 3h12v18l-2.4-1.5L13 21l-2.4-1.5L8 21l-2-1.5ZM9 8h6M9 12h6M9 16h3',
  whatsapp: 'M4 20l1.3-4A8.5 8.5 0 1 1 8.3 19ZM9.2 8.6c-.3 2.9 3.2 6.5 6.2 6.2l.9-1.6-1.9-1-1 .8c-1-.4-1.8-1.2-2.2-2.2l.8-1-1-1.9Z',
  star: 'm12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.9Z',
  directions: 'm3.5 11 17-7.5-7.5 17-2-7.5Z',
  gift: 'M4 11h16v9H4ZM3 7.5h18V11H3ZM12 7.5V20M12 7.5S10.5 3.5 8.2 4.3C6.4 5 7.3 7.5 9 7.5M12 7.5s1.5-4 3.8-3.2c1.8.7.9 3.2-.8 3.2',
  cup: 'M5 9h11v4a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5ZM16 10h1.5a2.5 2.5 0 0 1 0 5H16M4 21h14M9 3.5c-.8 1 .8 1.5 0 3M12.5 3.5c-.8 1 .8 1.5 0 3',
  chevronDown: 'm6 9 6 6 6-6',
  arrowRight: 'M5 12h14m-5-5 5 5-5 5',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
  qr: 'M4 4h6v6H4ZM14 4h6v6h-6ZM4 14h6v6H4ZM14 14h2v2h-2ZM18 18h2v2h-2ZM14 18h2M18 14h2',
  camera: 'M4 8a2 2 0 0 1 2-2h2l1.5-2h5L16 6h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2ZM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z',
} as const;

export type IconName = keyof typeof PATHS | keyof typeof STROKES;

export function Icon({ name, size = 20, className, title }: { name: IconName; size?: number; className?: string; title?: string }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" className={className}
      aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}
      {...(name in STROKES
        ? { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
        : { fill: 'currentColor' })}
    >
      {title && <title>{title}</title>}
      <path d={name in STROKES ? STROKES[name as keyof typeof STROKES] : PATHS[name as keyof typeof PATHS]} />
    </svg>
  );
}
