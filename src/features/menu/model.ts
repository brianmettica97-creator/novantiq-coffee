import { useEffect, useMemo, useState } from 'react';
import type { Badge, MediaAsset, OptionGroup, Product, PublicMenu } from '../../domain/types';
import { formatPrice } from '../../domain/format';
import { activePercentOff, isPromotionActive } from '../../domain/promotions';

/** Índices derivados de la carta, recalculados solo cuando cambia. */
export function useMenuModel(menu: PublicMenu) {
  const now = useNow();
  return useMemo(() => {
    const assets = new Map<string, MediaAsset>(menu.media.map((m) => [m.id, m]));
    const products = new Map<string, Product>(menu.products.map((p) => [p.id, p]));
    const groups: OptionGroup[] = menu.optionGroups;
    const badges = new Map<string, Badge>(menu.badges.map((b) => [b.key, b]));
    const tz = menu.settings.timeZone;
    const price = (cents: number) => formatPrice(cents, menu.settings.currency, menu.settings.locale);
    const activePromotions = menu.promotions.filter((p) => isPromotionActive(p, now, tz));
    const discountFor = (productId: string) => activePercentOff(productId, menu.promotions, now, tz);
    const featured = menu.products.filter((p) => p.badges.some((b) => b === 'casa' || b === 'nuevo' || b === 'limitado'));
    return { menu, assets, products, groups, badges, price, now, activePromotions, discountFor, featured };
  }, [menu, now]);
}

export type MenuModel = ReturnType<typeof useMenuModel>;

/** Reloj que avanza cada minuto: las promociones por horario se actualizan solas. */
function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}
