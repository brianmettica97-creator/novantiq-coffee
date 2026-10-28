import type { MenuTheme, ThemeColors } from '../domain/types';

export interface ThemePreset {
  key: string;
  name: string;
  description: string;
  colors: ThemeColors;
  fontDisplay: MenuTheme['fontDisplay'];
  fontBody: MenuTheme['fontBody'];
}

// Paletas probadas: los pares tinta/fondo y acento/tinta-de-acento cumplen
// contraste AA para texto normal (ver src/theme/contrast.test.ts).
export const THEME_PRESETS: ThemePreset[] = [
  {
    key: 'moka',
    name: 'Moka',
    description: 'Crema cálido, marrón café y caramelo.',
    colors: {
      background: '#F3ECE2', surface: '#FBF8F3', ink: '#1E1611', muted: '#6A5A4F',
      accent: '#8E5426', accentInk: '#FFF8EF', line: '#E2D6C6',
    },
    fontDisplay: 'Fraunces',
    fontBody: 'Manrope',
  },
  {
    key: 'noir',
    name: 'Noir',
    description: 'Negro espresso con tipografía crema. Ideal para bares de café nocturnos.',
    colors: {
      background: '#15100D', surface: '#211A15', ink: '#F4EADC', muted: '#B9A895',
      accent: '#D9A066', accentInk: '#1A120C', line: '#3A2F27',
    },
    fontDisplay: 'Cormorant Garamond',
    fontBody: 'DM Sans',
  },
  {
    key: 'pistacho',
    name: 'Pistacho',
    description: 'Verde suave y blanco cálido, para brunch y pastelería.',
    colors: {
      background: '#EEF0E6', surface: '#FAFBF6', ink: '#1C2119', muted: '#5B6352',
      accent: '#4D6A3A', accentInk: '#F7FAF1', line: '#D9DECD',
    },
    fontDisplay: 'Playfair Display',
    fontBody: 'Outfit',
  },
  {
    key: 'rose',
    name: 'Rosé',
    description: 'Rosa empolvado y bordó, estilo pâtisserie.',
    colors: {
      background: '#F6ECE8', surface: '#FDF8F6', ink: '#2A1517', muted: '#74575A',
      accent: '#8C2F3C', accentInk: '#FFF5F5', line: '#EBD7D2',
    },
    fontDisplay: 'DM Serif Display',
    fontBody: 'Manrope',
  },
];

export const FONT_SPECS: Record<string, string> = {
  Fraunces: 'Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600',
  'Cormorant Garamond': 'Cormorant+Garamond:wght@500;600;700',
  'Playfair Display': 'Playfair+Display:wght@400;500;600',
  'DM Serif Display': 'DM+Serif+Display',
  Manrope: 'Manrope:wght@400;500;600;700',
  'DM Sans': 'DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600',
  Outfit: 'Outfit:wght@400;500;600',
  Inter: 'Inter:wght@400;500;600',
};
