// Motor de precios y validación de opciones.
//
// Este módulo NO importa nada a propósito: se copia tal cual a
// supabase/functions/_shared/pricing.ts para que el backend recalcule los
// precios con exactamente la misma lógica que muestra la carta.
// `npm run sync:shared` hace la copia y una prueba verifica que coincidan.

export interface PricingOption {
  id: string;
  name: string;
  priceDelta: number;
  available: boolean;
  isDefault: boolean;
  position: number;
}

export interface PricingGroup {
  id: string;
  name: string;
  required: boolean;
  minSelect: number;
  maxSelect: number;
  options: PricingOption[];
}

export interface PricingGroupLink {
  groupId: string;
  position: number;
  overrides: Record<string, { priceDelta?: number; available?: boolean }>;
}

/** groupId -> ids de opciones elegidas */
export type Selection = Record<string, string[]>;

export interface SelectionIssue {
  groupId: string;
  message: string;
}

export interface PriceLine {
  label: string;
  amount: number;
}

export interface PriceResult {
  unitBase: number;
  unitOptions: number;
  unitDiscount: number;
  unitTotal: number;
  quantity: number;
  total: number;
  lines: PriceLine[];
}

/** Aplica los ajustes del producto sobre un grupo compartido y ordena. */
export function resolveGroups(groups: PricingGroup[], links: PricingGroupLink[]): PricingGroup[] {
  const byId = new Map(groups.map((g) => [g.id, g]));
  return [...links]
    .sort((a, b) => a.position - b.position)
    .flatMap((link) => {
      const group = byId.get(link.groupId);
      if (!group) return [];
      const options = group.options
        .map((o) => {
          const ov = link.overrides[o.id] ?? {};
          return {
            ...o,
            priceDelta: ov.priceDelta ?? o.priceDelta,
            available: o.available && (ov.available ?? true),
          };
        })
        .sort((a, b) => a.position - b.position);
      return [{ ...group, options }];
    });
}

/** Límites efectivos: un grupo obligatorio exige al menos una opción. */
export function groupLimits(group: PricingGroup): { min: number; max: number } {
  const max = Math.max(1, group.maxSelect);
  const min = Math.min(max, Math.max(group.required ? 1 : 0, group.minSelect));
  return { min, max };
}

export function defaultSelection(groups: PricingGroup[]): Selection {
  const selection: Selection = {};
  for (const g of groups) {
    const { min, max } = groupLimits(g);
    const available = g.options.filter((o) => o.available);
    let chosen = available.filter((o) => o.isDefault).slice(0, max).map((o) => o.id);
    if (chosen.length < min) {
      for (const o of available) {
        if (chosen.length >= min) break;
        if (!chosen.includes(o.id)) chosen.push(o.id);
      }
    }
    selection[g.id] = chosen;
  }
  return selection;
}

/** Alterna una opción respetando el máximo del grupo. */
export function toggleOption(selection: Selection, group: PricingGroup, optionId: string): Selection {
  const { max } = groupLimits(group);
  const current = selection[group.id] ?? [];
  let next: string[];
  if (max === 1) {
    next = current.includes(optionId) && !group.required ? [] : [optionId];
  } else if (current.includes(optionId)) {
    next = current.filter((id) => id !== optionId);
  } else {
    next = current.length >= max ? current : [...current, optionId];
  }
  return { ...selection, [group.id]: next };
}

export function validateSelection(groups: PricingGroup[], selection: Selection): SelectionIssue[] {
  const issues: SelectionIssue[] = [];
  const known = new Set(groups.map((g) => g.id));
  for (const groupId of Object.keys(selection)) {
    if (!known.has(groupId) && (selection[groupId]?.length ?? 0) > 0) {
      issues.push({ groupId, message: 'Este grupo de opciones no corresponde al producto.' });
    }
  }
  for (const g of groups) {
    const chosen = selection[g.id] ?? [];
    const { min, max } = groupLimits(g);
    if (new Set(chosen).size !== chosen.length) {
      issues.push({ groupId: g.id, message: 'Hay opciones repetidas.' });
    }
    for (const id of chosen) {
      const opt = g.options.find((o) => o.id === id);
      if (!opt) issues.push({ groupId: g.id, message: 'Opción inexistente.' });
      else if (!opt.available) issues.push({ groupId: g.id, message: `${opt.name} no está disponible.` });
    }
    if (chosen.length < min) {
      issues.push({
        groupId: g.id,
        message: min === 1 ? `Elegí una opción de ${g.name}.` : `Elegí al menos ${min} opciones de ${g.name}.`,
      });
    }
    if (chosen.length > max) {
      issues.push({ groupId: g.id, message: `Podés elegir hasta ${max} en ${g.name}.` });
    }
  }
  return issues;
}

/**
 * Calcula el precio. El descuento porcentual se aplica sobre el precio
 * unitario completo (base + opciones) y se redondea al centavo.
 */
export function computePrice(input: {
  basePrice: number;
  groups: PricingGroup[];
  selection: Selection;
  quantity?: number;
  percentOff?: number | null;
}): PriceResult {
  const quantity = Math.max(1, Math.floor(input.quantity ?? 1));
  const lines: PriceLine[] = [];
  let unitOptions = 0;
  for (const g of input.groups) {
    for (const id of input.selection[g.id] ?? []) {
      const opt = g.options.find((o) => o.id === id);
      if (!opt) continue;
      unitOptions += opt.priceDelta;
      if (opt.priceDelta !== 0) lines.push({ label: opt.name, amount: opt.priceDelta });
    }
  }
  const pct = Math.min(90, Math.max(0, input.percentOff ?? 0));
  const gross = input.basePrice + unitOptions;
  const unitDiscount = pct > 0 ? Math.round((gross * pct) / 100) : 0;
  if (unitDiscount > 0) lines.push({ label: `Promoción −${pct}%`, amount: -unitDiscount });
  const unitTotal = gross - unitDiscount;
  return {
    unitBase: input.basePrice,
    unitOptions,
    unitDiscount,
    unitTotal,
    quantity,
    total: unitTotal * quantity,
    lines,
  };
}

/** Precio "desde": base + mínimo obligatorio más barato. */
export function startingPrice(basePrice: number, groups: PricingGroup[]): number {
  let extra = 0;
  for (const g of groups) {
    const { min } = groupLimits(g);
    if (min === 0) continue;
    const deltas = g.options.filter((o) => o.available).map((o) => o.priceDelta).sort((a, b) => a - b);
    extra += deltas.slice(0, min).reduce((s, d) => s + d, 0);
  }
  return basePrice + extra;
}
