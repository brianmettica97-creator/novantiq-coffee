import { describe, expect, it } from 'vitest';
import {
  computePrice, defaultSelection, resolveGroups, startingPrice, toggleOption, validateSelection, type PricingGroup,
} from './pricing';

const size: PricingGroup = {
  id: 'size', name: 'Tamaño', required: true, minSelect: 1, maxSelect: 1,
  options: [
    { id: 's', name: 'Chico', priceDelta: 0, available: true, isDefault: true, position: 0 },
    { id: 'm', name: 'Mediano', priceDelta: 90000, available: true, isDefault: false, position: 1 },
    { id: 'l', name: 'Grande', priceDelta: 160000, available: true, isDefault: false, position: 2 },
  ],
};
const extras: PricingGroup = {
  id: 'extras', name: 'Extras', required: false, minSelect: 0, maxSelect: 2,
  options: [
    { id: 'shot', name: 'Shot', priceDelta: 110000, available: true, isDefault: false, position: 0 },
    { id: 'vai', name: 'Vainilla', priceDelta: 60000, available: true, isDefault: false, position: 1 },
    { id: 'off', name: 'Agotado', priceDelta: 50000, available: false, isDefault: false, position: 2 },
  ],
};

describe('precios con variantes y adicionales', () => {
  it('la selección predeterminada respeta los obligatorios', () => {
    expect(defaultSelection([size, extras])).toEqual({ size: ['s'], extras: [] });
  });

  it('la variante cambia el precio', () => {
    const r = computePrice({ basePrice: 460000, groups: [size, extras], selection: { size: ['l'], extras: ['shot'] } });
    expect(r.unitTotal).toBe(460000 + 160000 + 110000);
    expect(r.lines.map((l) => l.label)).toEqual(['Grande', 'Shot']);
  });

  it('multiplica por cantidad y aplica descuento porcentual sobre el total unitario', () => {
    const r = computePrice({ basePrice: 540000, groups: [size], selection: { size: ['m'] }, quantity: 2, percentOff: 20 });
    expect(r.unitDiscount).toBe(126000);
    expect(r.unitTotal).toBe(504000);
    expect(r.total).toBe(1008000);
  });

  it('ignora descuentos fuera de rango', () => {
    expect(computePrice({ basePrice: 1000, groups: [], selection: {}, percentOff: 500 }).unitTotal).toBe(100);
  });

  it('"desde" suma la opción obligatoria más barata disponible', () => {
    const noSmall = { ...size, options: size.options.map((o) => (o.id === 's' ? { ...o, available: false } : o)) };
    expect(startingPrice(460000, [noSmall, extras])).toBe(550000);
  });
});

describe('validación de combinaciones', () => {
  it('detecta obligatorio faltante, opción agotada, inexistente y exceso', () => {
    const issues = validateSelection([size, extras], { size: [], extras: ['off', 'nope', 'shot'] });
    const messages = issues.map((i) => i.message).join(' | ');
    expect(messages).toMatch(/Elegí una opción de Tamaño/);
    expect(messages).toMatch(/Agotado no está disponible/);
    expect(messages).toMatch(/Opción inexistente/);
    expect(messages).toMatch(/hasta 2/);
  });

  it('rechaza grupos que no corresponden al producto', () => {
    expect(validateSelection([size], { size: ['s'], intruso: ['x'] })).toHaveLength(1);
  });

  it('una selección correcta no tiene problemas', () => {
    expect(validateSelection([size, extras], { size: ['m'], extras: ['vai'] })).toEqual([]);
  });

  it('toggle respeta el máximo y la selección única', () => {
    let s = toggleOption({}, size, 'm');
    s = toggleOption(s, size, 'l');
    expect(s.size).toEqual(['l']);
    s = toggleOption(s, extras, 'shot');
    s = toggleOption(s, extras, 'vai');
    s = toggleOption(s, extras, 'off');
    expect(s.extras).toEqual(['shot', 'vai']);
  });
});

describe('grupos reutilizables con ajustes por producto', () => {
  it('aplica overrides de precio y disponibilidad sin modificar el grupo', () => {
    const [g] = resolveGroups([size], [{ groupId: 'size', position: 0, overrides: { l: { priceDelta: 200000 }, m: { available: false } } }]);
    expect(g.options.find((o) => o.id === 'l')!.priceDelta).toBe(200000);
    expect(g.options.find((o) => o.id === 'm')!.available).toBe(false);
    expect(size.options.find((o) => o.id === 'l')!.priceDelta).toBe(160000);
  });

  it('descarta vínculos a grupos inexistentes', () => {
    expect(resolveGroups([size], [{ groupId: 'otro', position: 0, overrides: {} }])).toEqual([]);
  });
});
