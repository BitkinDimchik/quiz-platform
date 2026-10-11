import { NumericSpinnerInput } from '../../components/NumericSpinnerInput';
import { StageFontSelect } from '../../components/StageFontSelect';
import {
  STAGE_TYPE_FONT_SIZE_MAX,
  STAGE_TYPE_FONT_SIZE_MIN,
  STAGE_TYPE_ROLES,
  STAGE_TYPE_ROLE_LABELS,
  patchStageTypeStyles,
  roleFontSize,
  stageTypeFontFamilyVar,
  stageTypeFontSizeVar,
  type StageTypeRole,
  type StageTypeStyles,
} from '../host/stage-type-styles';
import { parseStageFontFamily, formatFontFamilyCss } from '../host/stage-fonts';
import type { CSSProperties } from 'react';

type Props = {
  fontFamily: string | null | undefined;
  stageTypeStyles: StageTypeStyles | null | undefined;
  onFontFamily: (fontFamily: string | null) => void;
  onStageTypeStyles: (next: StageTypeStyles) => void;
};

const SAMPLE_CLASS: Record<StageTypeRole, string> = {
  heading: 'stage-q',
  answers: 'stage-answer',
  labels: 'stage-meta',
};

export function StageTypeStylesEditor({
  fontFamily,
  stageTypeStyles,
  onFontFamily,
  onStageTypeStyles,
}: Props) {
  const baseFamily = parseStageFontFamily(fontFamily) || undefined;

  return (
    <div className="stage-type-styles">
      <div className="field stage-type-styles__base">
        <label>Базовый шрифт всех сцен</label>
        <StageFontSelect
          id="quizFontFamily"
          value={fontFamily}
          onChange={(next) => onFontFamily(next ?? null)}
        />
        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
          Заставки, лобби и блоки без своего семейства. Ниже можно задать шрифт и кегль отдельно для
          заголовков, ответов и подписей — сразу на все сцены.
        </div>
      </div>

      <div className="stage-type-styles__grid">
        {STAGE_TYPE_ROLES.map((role) => {
          const meta = STAGE_TYPE_ROLE_LABELS[role];
          const size = roleFontSize(stageTypeStyles, role);
          const family = stageTypeStyles?.[role]?.fontFamily || baseFamily;
          const sampleStyle: CSSProperties = {
            [stageTypeFontSizeVar(role)]: `${size}px`,
            ...(family
              ? { [stageTypeFontFamilyVar(role)]: formatFontFamilyCss(family) }
              : {}),
            ...(baseFamily ? { ['--stage-font-family']: formatFontFamilyCss(baseFamily) } : {}),
          } as CSSProperties;
          return (
            <section className="stage-type-styles__card" key={role}>
              <div className="stage-type-styles__card-title">{meta.title}</div>
              <div className="muted stage-type-styles__card-hint">{meta.hint}</div>
              <div className="stage-type-styles__sample-frame" aria-hidden="true">
                <div className={`stage-type-styles__sample ${SAMPLE_CLASS[role]}`} style={sampleStyle}>
                  {meta.sample}
                </div>
              </div>
              <div className="field">
                <label>Шрифт</label>
                <StageFontSelect
                  id={`stageTypeFont-${role}`}
                  value={stageTypeStyles?.[role]?.fontFamily || ''}
                  onChange={(next) =>
                    onStageTypeStyles(
                      patchStageTypeStyles(stageTypeStyles, role, {
                        fontFamily: next ?? null,
                        fontSize: size,
                      }),
                    )
                  }
                />
              </div>
              <div className="field">
                <label>Размер, px</label>
                <NumericSpinnerInput
                  id={`stageTypeSize-${role}`}
                  value={size}
                  min={STAGE_TYPE_FONT_SIZE_MIN}
                  max={STAGE_TYPE_FONT_SIZE_MAX}
                  onChange={(fontSize) =>
                    onStageTypeStyles(patchStageTypeStyles(stageTypeStyles, role, { fontSize }))
                  }
                />
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
