import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdmin } from '../AdminContext';
import { PageHeader } from '../ui';
import type { ExtraLanguage, Translations } from '../../../domain/types';
import { builtInTerm, LANGUAGE_NAMES, translatableGroups, translationProgress } from '../../../domain/i18n';
import { normalize } from '../../../domain/search';

export function TranslationsPage() {
  const { bundle, repo, orgId, run, canEdit } = useAdmin();
  const languages = bundle.settings.languages;
  const [lang, setLang] = useState<ExtraLanguage | null>(languages[0] ?? null);
  const [draft, setDraft] = useState<Translations>(bundle.settings.translations);
  const [query, setQuery] = useState('');
  const [pendingOnly, setPendingOnly] = useState(false);
  const groups = useMemo(() => translatableGroups(bundle), [bundle]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(bundle.settings.translations);

  const save = () => run(() => repo.saveSettings(orgId, { ...bundle.settings, translations: draft }), 'Traducciones guardadas');
  const setText = (key: string, value: string) => {
    if (!lang) return;
    setDraft((d) => {
      const next = { ...d[lang] };
      if (value.trim()) next[key] = value;
      else delete next[key];
      return { ...d, [lang]: next };
    });
  };

  if (!lang) {
    return (
      <>
        <PageHeader title="Idiomas" description="Traducí la carta para turistas y visitantes." />
        <section className="ad-card">
          <h2>Todavía no hay otros idiomas activos</h2>
          <p>Activá inglés o portugués en <Link to="/admin/local">Datos del local</Link> y volvé acá para cargar las traducciones.</p>
          <p className="ad-muted ad-small">La carta detecta el idioma del teléfono del cliente y permite cambiarlo desde el botón del globo.</p>
        </section>
      </>
    );
  }

  const own = draft[lang] ?? {};
  const q = normalize(query.trim());
  const visible = groups
    .map((g) => ({
      ...g,
      entries: g.entries.filter((e) => {
        const done = own[e.key]?.trim() || (e.key.startsWith('term.') && builtInTerm(lang, e.source));
        if (pendingOnly && done) return false;
        return !q || normalize(`${g.title} ${e.source} ${own[e.key] ?? ''}`).includes(q);
      }),
    }))
    .filter((g) => g.entries.length);

  return (
    <>
      <PageHeader title="Idiomas" description="Lo que no traduzcas se muestra en español. Los alérgenos y dietas comunes ya vienen traducidos."
        actions={canEdit && <button className="ad-btn ad-btn--primary" onClick={save} disabled={!dirty}>Guardar</button>} />
      <div className="ad-tabs" role="tablist" aria-label="Idioma">
        {languages.map((l) => {
          const pct = translationProgress(groups, draft, l);
          return (
            <button key={l} type="button" role="tab" aria-selected={l === lang} className={l === lang ? 'is-active' : ''} onClick={() => setLang(l)}>
              {LANGUAGE_NAMES[l]} · {pct}%
            </button>
          );
        })}
      </div>
      <div className="ad-progress" aria-hidden="true"><span style={{ width: `${translationProgress(groups, draft, lang)}%` }} /></div>
      <div className="ad-row ad-row--wrap ad-tr__tools">
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar texto…" aria-label="Buscar texto" />
        <label className="ad-check"><input type="checkbox" checked={pendingOnly} onChange={(e) => setPendingOnly(e.target.checked)} /> Solo pendientes</label>
      </div>
      <fieldset className="ad-form" disabled={!canEdit}>
        {visible.map((g) => (
          <section key={g.title} className="ad-card ad-tr">
            <h2>{g.title}</h2>
            {g.entries.map((e) => {
              const suggestion = e.key.startsWith('term.') ? builtInTerm(lang, e.source) : null;
              const value = own[e.key] ?? '';
              const id = `tr-${e.key}`;
              return (
                <div key={e.key} className="ad-tr__row">
                  <label htmlFor={id} className="ad-tr__source"><small>{e.label}</small>{e.source}</label>
                  {e.long
                    ? <textarea id={id} rows={2} value={value} onChange={(ev) => setText(e.key, ev.target.value)} placeholder="Sin traducir: se muestra en español" />
                    : <input id={id} value={value} onChange={(ev) => setText(e.key, ev.target.value)} placeholder={suggestion ?? 'Sin traducir: se muestra en español'} />}
                </div>
              );
            })}
          </section>
        ))}
        {visible.length === 0 && <p className="ad-empty">No hay textos que coincidan.</p>}
      </fieldset>
      {canEdit && dirty && (
        <div className="ad-savebar">
          <span>Tenés cambios sin guardar.</span>
          <button className="ad-btn ad-btn--primary" onClick={save}>Guardar traducciones</button>
        </div>
      )}
    </>
  );
}
