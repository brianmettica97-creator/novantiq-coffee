import type { LoyaltyCard, ServiceKind } from '../../domain/types';

/**
 * Acciones de la carta que hablan con el servidor. La vista previa del panel
 * no las recibe: ahí la tarjeta y el servicio de mesa se muestran inactivos.
 */
export interface MenuActions {
  joinLoyalty(): Promise<LoyaltyCard>;
  getLoyaltyCard(code: string): Promise<LoyaltyCard | null>;
  requestService(kind: ServiceKind): Promise<'sent' | 'already'>;
}

export interface TableInfo {
  label: string;
}
