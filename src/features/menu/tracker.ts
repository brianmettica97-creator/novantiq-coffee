import { getRepository } from '../../data';
import type { PublicEventInput } from '../../data/repository';
import { randomId } from '../../domain/crypto';
import { normalize } from '../../domain/search';

// Analítica anónima: un identificador aleatorio por pestaña (sessionStorage),
// sin cookies, sin datos personales y sin huella del dispositivo.
function sessionId(): string {
  try {
    let id = sessionStorage.getItem('nq-sid');
    if (!id) {
      id = randomId();
      sessionStorage.setItem('nq-sid', id);
    }
    return id;
  } catch {
    return 'anon';
  }
}

const seen = new Set<string>();

export function track(slug: string, event: Omit<PublicEventInput, 'sessionId'>, opts: { oncePerSession?: boolean } = {}) {
  const key = `${event.type}:${event.productId ?? ''}:${event.categoryId ?? ''}`;
  if (opts.oncePerSession) {
    if (seen.has(key)) return;
    seen.add(key);
  }
  const query = event.query ? normalize(event.query).slice(0, 60) : null;
  getRepository()
    .then((r) => r.trackEvent(slug, { ...event, query, sessionId: sessionId() }))
    .catch(() => { /* la analítica nunca debe romper la carta */ });
}
