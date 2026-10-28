import type { LocalSeed } from '../data/local/localRepository';
import { buildMokaStudioBundle } from './mokaStudio';
import { demoId } from './ids';

/** Credenciales del modo local de demostración (no existen en producción). */
export const LOCAL_DEMO_LOGIN = { email: 'demo@novantiq.coffee', password: 'moka2026' };

export function localDemoSeed(): LocalSeed {
  const moka = buildMokaStudioBundle();
  return {
    bundles: [moka],
    demoTemplates: { [moka.organization.id]: buildMokaStudioBundle },
    users: [{
      id: demoId('user:demo-owner'),
      ...LOCAL_DEMO_LOGIN,
      memberships: [{ organizationId: moka.organization.id, role: 'owner' }],
    }],
  };
}
