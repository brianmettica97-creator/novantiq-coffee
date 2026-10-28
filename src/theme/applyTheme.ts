import type { CSSProperties } from 'react';
import type { MenuTheme } from '../domain/types';
import { FONT_SPECS } from './presets';

const SERIF_FALLBACK = "Georgia, 'Times New Roman', serif";
const SANS_FALLBACK = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

/** Variables CSS del tema, para aplicar a la raíz de la carta o a una vista previa. */
export function themeStyle(theme: MenuTheme): CSSProperties {
  const c = theme.colors;
  return {
    '--bg': c.background,
    '--surface': c.surface,
    '--ink': c.ink,
    '--muted': c.muted,
    '--accent': c.accent,
    '--accent-ink': c.accentInk,
    '--line': c.line,
    '--font-display': `'${theme.fontDisplay}', ${SERIF_FALLBACK}`,
    '--font-body': `'${theme.fontBody}', ${SANS_FALLBACK}`,
    '--radius-card': theme.cardStyle === 'soft' ? '20px' : '4px',
    '--radius-media': theme.cardStyle === 'soft' ? '16px' : '2px',
  } as CSSProperties;
}

/** Carga solo las familias tipográficas que el tema usa (display=swap). */
export function ensureFonts(families: string[]) {
  const specs = families.map((f) => FONT_SPECS[f]).filter(Boolean);
  if (!specs.length) return;
  const href = `https://fonts.googleapis.com/css2?${specs.map((s) => `family=${s}`).join('&')}&display=swap`;
  const id = 'nq-fonts-' + specs.join('|').replace(/[^a-z0-9]/gi, '').slice(0, 80);
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

/** Relación de contraste WCAG entre dos colores #RRGGBB. */
export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const v = parseInt(hex.slice(i, i + 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}
