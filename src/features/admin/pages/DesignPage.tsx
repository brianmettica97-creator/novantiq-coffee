import { useMemo, useState } from 'react';
import { useAdmin } from '../AdminContext';
import { Field, MediaPicker, PageHeader, Toggle } from '../ui';
import type { HomeSection, MenuTheme, OrganizationSettings, ThemeColors } from '../../../domain/types';
import { FONT_BODY, FONT_DISPLAY } from '../../../domain/types';
import { THEME_PRESETS } from '../../../theme/presets';
import { contrastRatio } from '../../../theme/applyTheme';
import { themeSchema } from '../../../domain/validation';
import { buildPublicMenu, homeSections } from '../../../domain/menu';
import { MenuView } from '../../menu/MenuView';

const COLOR_LABEL: Record<keyof ThemeColors, string> = {
  background: 'Fondo', surface: 'Superficies', ink: 'Texto', muted: 'Texto secundario', accent: 'Acento', accentInk: 'Texto sobre acento', line: 'Líneas',
};
const SECTIONS: Record<HomeSection, string> = { promotions: 'Promociones', loyalty: 'Tarjeta de fidelidad', featured: 'Destacados', categories: 'Categorías' };

export function DesignPage() {
  const { bundle, repo, orgId, run, canEdit } = useAdmin();
  const [theme, setTheme] = useState<MenuTheme>(bundle.theme);
  const [settings, setSettings] = useState<OrganizationSettings>(bundle.settings);
  const [previewSlug, setPreviewSlug] = useState<string | null>(null);
  const dirty = JSON.stringify(theme) !== JSON.stringify(bundle.theme) || JSON.stringify(settings) !== JSON.stringify(bundle.settings);
  const c = theme.colors;
  const checks = [
    { label: 'Texto sobre fondo', ratio: contrastRatio(c.ink, c.background) },
    { label: 'Texto secundario', ratio: contrastRatio(c.muted, c.background) },
    { label: 'Texto sobre acento', ratio: contrastRatio(c.accentInk, c.accent) },
  ];
  const lowContrast = checks.some((x) => x.ratio < 4.5);

  const preview = useMemo(() => buildPublicMenu({ ...bundle, theme, settings: { ...settings, menuPublished: true } }), [bundle, theme, settings]);

  const publish = async () => {
    if (!themeSchema.safeParse(theme).success) return;
    await run(async () => {
      await repo.saveTheme(orgId, theme);
      await repo.saveSettings(orgId, settings);
    }, 'Diseño publicado');
  };

  const sections = homeSections(settings.sectionOrder);
  const moveSection = (i: number, dir: -1 | 1) => {
    const order = [...sections];
    [order[i], order[i + dir]] = [order[i + dir], order[i]];
    setSettings({ ...settings, sectionOrder: order });
  };

  return (
    <>
      <PageHeader title="Diseño de la carta" description="Los cambios se ven en la vista previa y llegan a la carta pública recién al publicar."
        actions={canEdit && (
          <>
            <button className="ad-btn" disabled={!dirty} onClick={() => { setTheme(bundle.theme); setSettings(bundle.settings); }}>Descartar</button>
            <button className="ad-btn ad-btn--primary" disabled={!dirty} onClick={publish}>Publicar diseño</button>
          </>
        )} />
      <div className="ad-design">
        <fieldset className="ad-form" disabled={!canEdit}>
          <section className="ad-card">
            <h2>Estilo base</h2>
            <div className="ad-presets">
              {THEME_PRESETS.map((p) => (
                <button type="button" key={p.key} className={theme.preset === p.key ? 'is-active' : ''}
                  onClick={() => setTheme({ ...theme, preset: p.key, colors: p.colors, fontDisplay: p.fontDisplay, fontBody: p.fontBody })}>
                  <span className="ad-swatches">{[p.colors.background, p.colors.ink, p.colors.accent].map((x) => <i key={x} style={{ background: x }} />)}</span>
                  <strong>{p.name}</strong>
                  <small>{p.description}</small>
                </button>
              ))}
            </div>
          </section>
          <section className="ad-card">
            <h2>Colores</h2>
            <div className="ad-colors">
              {(Object.keys(COLOR_LABEL) as (keyof ThemeColors)[]).map((k) => (
                <label key={k} className="ad-color">
                  <input type="color" value={c[k]} onChange={(e) => setTheme({ ...theme, preset: 'custom', colors: { ...c, [k]: e.target.value.toUpperCase() } })} />
                  <span>{COLOR_LABEL[k]}<small>{c[k]}</small></span>
                </label>
              ))}
            </div>
            <ul className="ad-contrast">
              {checks.map((x) => <li key={x.label} className={x.ratio < 4.5 ? 'is-bad' : ''}>{x.label}: {x.ratio.toFixed(1)}:1 {x.ratio < 4.5 ? '— bajo contraste' : '✓'}</li>)}
            </ul>
            {lowContrast && <p className="ad-warn">Algún par de colores no alcanza el contraste recomendado (4.5:1). Puede dificultar la lectura.</p>}
          </section>
          <section className="ad-card">
            <h2>Tipografía y composición</h2>
            <div className="ad-grid2">
              <Field label="Títulos"><select value={theme.fontDisplay} onChange={(e) => setTheme({ ...theme, fontDisplay: e.target.value as MenuTheme['fontDisplay'] })}>{FONT_DISPLAY.map((f) => <option key={f}>{f}</option>)}</select></Field>
              <Field label="Textos"><select value={theme.fontBody} onChange={(e) => setTheme({ ...theme, fontBody: e.target.value as MenuTheme['fontBody'] })}>{FONT_BODY.map((f) => <option key={f}>{f}</option>)}</select></Field>
              <Field label="Portada"><select value={theme.coverLayout} onChange={(e) => setTheme({ ...theme, coverLayout: e.target.value as MenuTheme['coverLayout'] })}><option value="immersive">Inmersiva (foto/video a pantalla completa)</option><option value="split">Dividida (foto arriba, texto abajo)</option></select></Field>
              <Field label="Fichas"><select value={theme.cardStyle} onChange={(e) => setTheme({ ...theme, cardStyle: e.target.value as MenuTheme['cardStyle'] })}><option value="soft">Bordes suaves</option><option value="sharp">Bordes rectos</option></select></Field>
              <Field label="Categorías"><select value={theme.categoryNavStyle} onChange={(e) => setTheme({ ...theme, categoryNavStyle: e.target.value as MenuTheme['categoryNavStyle'] })}><option value="pills">Píldoras</option><option value="underline">Subrayado</option></select></Field>
              <Field label="Promociones"><select value={theme.promoStyle} onChange={(e) => setTheme({ ...theme, promoStyle: e.target.value as MenuTheme['promoStyle'] })}><option value="band">Banda oscura</option><option value="card">Tarjeta clara</option></select></Field>
            </div>
          </section>
          <section className="ad-card">
            <h2>Portada y orden</h2>
            <Toggle checked={settings.showCover} onChange={(v) => setSettings({ ...settings, showCover: v })} label="Mostrar portada" hint="Desactivala para una carta más directa." />
            <div className="ad-media-grid">
              <MediaPicker kind="image" label="Logotipo" value={settings.logoAssetId} onChange={(v) => setSettings({ ...settings, logoAssetId: v })} />
              <MediaPicker kind="image" label="Imagen de portada" value={settings.coverImageAssetId} onChange={(v) => setSettings({ ...settings, coverImageAssetId: v })} />
              <MediaPicker kind="video" label="Video de portada" value={settings.coverVideoAssetId} onChange={(v) => setSettings({ ...settings, coverVideoAssetId: v })} />
            </div>
            <Field label="Frase de presentación"><input value={settings.tagline} onChange={(e) => setSettings({ ...settings, tagline: e.target.value })} maxLength={90} /></Field>
            <h3>Orden de las secciones</h3>
            <ol className="ad-sortable">
              {sections.map((s, i) => (
                <li key={s}>{SECTIONS[s]}
                  <span className="ad-order">
                    <button type="button" className="ad-icon" disabled={i === 0} onClick={() => moveSection(i, -1)} aria-label={`Subir ${SECTIONS[s]}`}>↑</button>
                    <button type="button" className="ad-icon" disabled={i === sections.length - 1} onClick={() => moveSection(i, 1)} aria-label={`Bajar ${SECTIONS[s]}`}>↓</button>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </fieldset>
        <div className="ad-design__preview">
          <p className="ad-muted ad-small">Vista previa {dirty ? '(sin publicar)' : '(igual a la publicada)'}</p>
          <div className="ad-phone"><div className="ad-phone__screen">
            {preview && <MenuView menu={preview} openSlug={previewSlug} onOpenSlug={setPreviewSlug} embedded />}
          </div></div>
        </div>
      </div>
    </>
  );
}
