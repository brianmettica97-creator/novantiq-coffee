// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen, within, fireEvent, act, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { MenuView } from './MenuView';
import type { MenuActions } from './actions';
import { buildMokaStudioBundle } from '../../demo/mokaStudio';
import { buildPublicMenu } from '../../domain/menu';
import { localizeMenu } from '../../domain/i18n';
import type { MenuLanguage } from '../../domain/types';

beforeAll(() => {
  // APIs del navegador que jsdom no implementa.
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as never;
  globalThis.IntersectionObserver ??= class { observe() {} disconnect() {} unobserve() {} } as never;
  Element.prototype.scrollTo ??= () => {};
  window.scrollTo = () => {};
});

function Harness({ initial = null as string | null, lang = 'es' as MenuLanguage, actions, table = null as { label: string } | null }: {
  initial?: string | null; lang?: MenuLanguage; actions?: MenuActions; table?: { label: string } | null;
}) {
  const menu = localizeMenu(buildPublicMenu(buildMokaStudioBundle())!, lang);
  const [slug, setSlug] = useState<string | null>(initial);
  return <MenuView menu={menu} openSlug={slug} onOpenSlug={setSlug} lang={lang} actions={actions} table={table} />;
}

function fakeActions(): MenuActions & { calls: string[] } {
  const calls: string[] = [];
  let stamps = 0;
  return {
    calls,
    joinLoyalty: async () => { calls.push('join'); return { code: 'abcd2345efgh6789', stamps, goal: 8, redeemed: 0, createdAt: '2026-10-28T12:00:00Z' }; },
    getLoyaltyCard: async (code) => ({ code, stamps: (stamps += 0), goal: 8, redeemed: 0, createdAt: '2026-10-28T12:00:00Z' }),
    requestService: async (kind) => { calls.push(kind); return 'sent'; },
  };
}

describe('carta pública (componentes)', () => {
  it('muestra portada, categorías y productos con precio', () => {
    render(<Harness />);
    expect(screen.getByRole('heading', { level: 1, name: 'Moka Studio' })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Categorías de la carta' });
    expect(within(nav).getByRole('button', { name: 'Cafés de especialidad' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Ver Cappuccino' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Chai latte' })).toBeInTheDocument(); // producto sin foto también se muestra
  });

  it('al abrir un producto, la variante elegida actualiza el precio final', () => {
    render(<Harness initial="cappuccino" />);
    const dialog = screen.getByRole('dialog', { name: 'Cappuccino' });
    const total = () => within(dialog).getByText('Precio con tu selección').nextElementSibling!.textContent;
    expect(total()).toMatch(/4\.600/);
    fireEvent.click(within(dialog).getByLabelText(/Grande · 480 ml/));
    expect(total()).toMatch(/6\.200/);
    fireEvent.click(within(dialog).getByLabelText(/Avena/));
    fireEvent.click(within(dialog).getByLabelText(/Shot extra de espresso/));
    expect(total()).toMatch(/8\.000/);
  });

  it('ofrece fotos y video como modos de visualización', () => {
    render(<Harness initial="cappuccino" />);
    const tabs = screen.getByRole('tablist', { name: 'Modo de visualización' });
    expect(within(tabs).getAllByRole('tab').map((t) => t.textContent)).toEqual(['Fotos', 'Video']);
  });

  it('un producto agotado lo indica y no ofrece pedirlo', () => {
    render(<Harness initial="fraisier" />);
    const dialog = screen.getByRole('dialog', { name: 'Fraisier' });
    expect(within(dialog).getByText('Agotado por hoy')).toBeInTheDocument();
    expect(within(dialog).getByText('No disponible por hoy')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /Agregar al pedido/ })).toBeNull();
  });

  it('la búsqueda tolera acentos y ofrece alternativas si no hay resultados', async () => {
    vi.useFakeTimers();
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Buscar en la carta' }));
    const input = screen.getByRole('searchbox', { name: 'Buscar productos' });
    fireEvent.change(input, { target: { value: 'tiramisu' } });
    const results = screen.getByRole('dialog', { name: 'Buscar en la carta' });
    expect(within(results).getByText('Tiramisú de la casa')).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'pizza' } });
    expect(within(results).getByText(/No encontramos/)).toBeInTheDocument();
    expect(within(results).getAllByRole('button').length).toBeGreaterThan(2);
    act(() => { vi.runOnlyPendingTimers(); });
    vi.useRealTimers();
  });

  it('filtra la carta por preferencias alimentarias', () => {
    render(<Harness />);
    expect(screen.getAllByRole('button', { name: 'Ver Cappuccino' }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Preferencias alimentarias' }));
    const sheet = screen.getByRole('dialog', { name: 'Preferencias alimentarias' });
    fireEvent.click(within(sheet).getByRole('button', { name: /Vegano/ }));
    fireEvent.click(within(sheet).getByRole('button', { name: /^Ver \d+ productos?$/ }));
    expect(screen.queryAllByRole('button', { name: 'Ver Cappuccino' })).toHaveLength(0);
    expect(screen.getByText(/productos con tus preferencias/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar' }));
    expect(screen.getAllByRole('button', { name: 'Ver Cappuccino' }).length).toBeGreaterThan(0);
  });

  it('muestra la tarjeta de fidelidad y crea la tarjeta del cliente', async () => {
    const actions = fakeActions();
    render(<Harness actions={actions} />);
    const section = screen.getByRole('region', { name: /Juntá 8 sellos/ });
    fireEvent.click(within(section).getByRole('button', { name: /Obtener mi tarjeta/ }));
    const card = await screen.findByRole('dialog', { name: 'Mi tarjeta' });
    expect(within(card).getAllByText('0 de 8 sellos').length).toBeGreaterThan(0);
    expect(within(card).getByText('ABCD 2345 EFGH 6789')).toBeInTheDocument();
    expect(actions.calls).toEqual(['join']);
  });

  it('en la vista previa la tarjeta no se puede crear', () => {
    render(<Harness />);
    const section = screen.getByRole('region', { name: /Juntá 8 sellos/ });
    expect(within(section).getByRole('button', { name: /Obtener mi tarjeta/ })).toBeDisabled();
  });

  it('desde un QR de mesa permite llamar al mozo', async () => {
    const actions = fakeActions();
    render(<Harness actions={actions} table={{ label: 'Mesa 4' }} />);
    fireEvent.click(screen.getByRole('button', { name: /Mesa 4/ }));
    const sheet = screen.getByRole('dialog', { name: '¿Qué necesitás?' });
    fireEvent.click(within(sheet).getByRole('button', { name: /Llamar al mozo/ }));
    await waitFor(() => expect(within(sheet).getByText(/avisamos que necesitás atención/)).toBeInTheDocument());
    expect(actions.calls).toEqual(['assistance']);
  });

  it('muestra la carta en inglés', () => {
    render(<Harness lang="en" />);
    expect(screen.getByRole('button', { name: 'See the menu' })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Menu categories' });
    expect(within(nav).getByRole('button', { name: 'Specialty coffee' })).toBeInTheDocument();
  });

  it('cerrar la ficha vuelve a la carta', () => {
    render(<Harness initial="latte" />);
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
