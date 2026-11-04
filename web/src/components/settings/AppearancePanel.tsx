import { RotateCcw } from 'lucide-react';
import { ACCENTS, PALETTES, RADII, TEXT_SCALES, isDefaultAppearance, useTheme, type Accent, type Palette, type Radius, type TextScale, type ThemePref } from '@/store/theme';
import { useI18nStore, useT } from '@/i18n';
import { formatNumber } from '@/lib/format';
import { Panel } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';
import { Labelled } from '@/components/ui/Field';
import { Segmented } from '@/components/ui/Segmented';
import { Swatches } from '@/components/ui/Swatches';
import '@/components/layout/layout.css';
import '@/components/charts/charts.css';

// Sample values for the preview bars (data, like a chart's rows; the colours come from the tokens).
const PREVIEW_BARS = [42, 68, 55, 80, 61, 73, 49, 88];
const PREVIEW_TOTAL = 1_284_500_000;

/** A sample widget and KPI so a chosen accent and palette can be seen without opening a dashboard. */
function LookPreview() {
  const t = useT();
  const lang = useI18nStore((s) => s.lang);
  return (
    <div className="look__preview" aria-hidden>
      <div className="look__widget">
        <span className="widget__title">{t('appearance.previewWidget')}</span>
        <div className="look__bars">
          {PREVIEW_BARS.map((v, i) => <span key={i} className="look__bar" style={{ height: `${v}%` }} />)}
        </div>
      </div>
      <div className="look__widget">
        <div className="kpi">
          <span className="kpi__label">{t('appearance.previewKpi')}</span>
          <span className="kpi__value">{formatNumber(PREVIEW_TOTAL, 'compact', lang)}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Settings › your look. Every choice applies at once and is saved to the user's account shortly
 * after (store/theme.ts). The language stays a per-browser choice of the i18n store.
 */
export function AppearancePanel() {
  const t = useT();
  const appearance = useTheme((s) => s.appearance);
  const update = useTheme((s) => s.update);
  const reset = useTheme((s) => s.reset);
  const { lang, setLang } = useI18nStore();
  return (
    <Panel title={t('appearance.title')}
      actions={<Button size="sm" icon={<RotateCcw size={14} />} disabled={isDefaultAppearance(appearance)} onClick={reset}>{t('appearance.reset')}</Button>}>
      <div className="look">
        <div className="stack">
          <Labelled label={t('appearance.mode')}>
            <Segmented<ThemePref> ariaLabel={t('appearance.mode')} value={appearance.theme} onChange={(theme) => update({ theme })} options={[
              { value: 'light', label: t('common.themeLight') }, { value: 'dark', label: t('common.themeDark') }, { value: 'system', label: t('common.themeSystem') },
            ]} />
          </Labelled>
          <Labelled label={t('appearance.accent')}>
            <Swatches<Accent> kind="accent" ariaLabel={t('appearance.accent')} value={appearance.accent} onChange={(accent) => update({ accent })}
              options={ACCENTS.map((a) => ({ value: a, label: t(`appearance.accents.${a}`) }))} />
          </Labelled>
          <Labelled label={t('appearance.palette')}>
            <Swatches<Palette> kind="palette" ariaLabel={t('appearance.palette')} value={appearance.palette} onChange={(palette) => update({ palette })}
              options={PALETTES.map((p) => ({ value: p, label: t(`appearance.palettes.${p}`) }))} />
          </Labelled>
          <Labelled label={t('appearance.textSize')}>
            <Segmented<TextScale> ariaLabel={t('appearance.textSize')} value={appearance.text} onChange={(text) => update({ text })}
              options={TEXT_SCALES.map((v) => ({ value: v, label: t(`appearance.textSizes.${v}`) }))} />
          </Labelled>
          <Labelled label={t('appearance.corners')}>
            <Segmented<Radius> ariaLabel={t('appearance.corners')} value={appearance.radius} onChange={(radius) => update({ radius })}
              options={RADII.map((v) => ({ value: v, label: t(`appearance.cornerStyles.${v}`) }))} />
          </Labelled>
          <Labelled label={t('common.language')}>
            <Segmented ariaLabel={t('common.language')} value={lang} onChange={setLang} options={[{ value: 'vi', label: 'Tiếng Việt' }, { value: 'en', label: 'English' }]} />
          </Labelled>
          <p className="text-sm text-muted">{t('appearance.hint')}</p>
        </div>
        <LookPreview />
      </div>
    </Panel>
  );
}
