import { useTranslation } from '@/i18n';

// Floating draw-toolbar that lives over the map canvas where the
// priority filter used to. Owns no state — drives the parent
// (MapScreen) which feeds tool + colour into MapCanvas's drawing layer.

export type DrawTool = 'idle' | 'polygon' | 'rectangle' | 'circle' | 'sketch';

// Forest-Green / Earthy-Brown / Safety-Orange and a few accents from the
// design system. Same palette as the existing PlotEditor color picker
// so freshly-drawn plots match the rest of the visual system.
export const DRAW_COLORS = ['#173124', '#765840', '#4f1c00', '#2d4739', '#ba1a1a', '#FF6B00'];

type Props = {
  tool: DrawTool;
  color: string;
  onToolChange: (t: DrawTool) => void;
  onColorChange: (c: string) => void;
  // True when there's at least one vertex drawn — the parent will
  // surface Save / Cancel actions in this state.
  hasInProgress: boolean;
  onCancel: () => void;
  onFinish: () => void;
  // For tap-to-add-vertex polygon mode, the running vertex count drives
  // the "Tap Finish" hint and the disabled state of the Finish button
  // (need at least 3 vertices to close a polygon).
  vertexCount: number;
};

const TOOL_ICON: Record<Exclude<DrawTool, 'idle'>, string> = {
  polygon: 'polyline', // tap-to-add corners
  rectangle: 'rectangle', // drag to draw
  circle: 'circle', // drag from centre to edge
  sketch: 'gesture', // freehand drag
};

export default function MapDrawTools({
  tool,
  color,
  onToolChange,
  onColorChange,
  hasInProgress,
  onCancel,
  onFinish,
  vertexCount,
}: Props) {
  const t = useTranslation();
  const tools: Exclude<DrawTool, 'idle'>[] = ['sketch', 'polygon', 'rectangle', 'circle'];

  // Hint shown beneath the toolbar once a tool is selected — different
  // copy per tool so users learn the gesture without trial and error.
  const hintKey =
    tool === 'sketch'
      ? 'draw.hint.sketch'
      : tool === 'polygon'
        ? vertexCount === 0
          ? 'draw.hint.polygonStart'
          : 'draw.hint.polygonContinue'
        : tool === 'rectangle'
          ? 'draw.hint.rectangle'
          : tool === 'circle'
            ? 'draw.hint.circle'
            : null;

  // Polygon mode is the only one that *needs* an explicit Finish (the
  // user keeps tapping until they say they're done). Drag-based shapes
  // commit on touchend, so they only need Cancel.
  const finishEnabled = tool === 'polygon' && vertexCount >= 3;

  return (
    <div className="pointer-events-auto flex flex-col items-start gap-2">
      {/* Vertical tool palette pinned to the left edge of the map.
          Tools stack on top, then a horizontal hairline divider, then
          colour swatches. Narrow footprint (~44px wide) so it doesn't
          eat into the map's left third even on phone widths. */}
      <div className="flex flex-col items-center gap-1 rounded-2xl bg-surface-container-lowest/95 px-1 py-1.5 shadow-lg backdrop-blur-md">
        <div className="flex flex-col items-center gap-1">
          {tools.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => onToolChange(tool === id ? 'idle' : id)}
              aria-pressed={tool === id}
              aria-label={t(`draw.tool.${id}`)}
              className={`flex h-9 w-9 items-center justify-center rounded-full transition active:scale-95 md:h-10 md:w-10 ${
                tool === id
                  ? 'bg-primary text-on-primary'
                  : 'text-on-surface-variant hover:bg-surface-container'
              }`}
            >
              <span className="material-symbols-outlined text-[20px] md:text-[22px]">
                {TOOL_ICON[id]}
              </span>
            </button>
          ))}
        </div>

        <span className="my-0.5 h-px w-6 bg-outline-variant" aria-hidden />

        <div className="flex flex-col items-center gap-1">
          {DRAW_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onColorChange(c)}
              aria-label={c}
              aria-pressed={color === c}
              className={`flex h-7 w-7 items-center justify-center rounded-full transition active:scale-95 md:h-8 md:w-8 ${
                color === c ? 'ring-2 ring-offset-2 ring-primary' : ''
              }`}
              style={{ backgroundColor: c }}
            >
              {/* Empty — colour swatch speaks for itself. */}
            </button>
          ))}
        </div>
      </div>

      {/* Hint + Finish/Cancel cluster — only when a tool is active */}
      {tool !== 'idle' && (
        <div className="flex items-center gap-2 rounded-full bg-inverse-surface/90 px-3 py-1.5 text-label-sm text-inverse-on-surface shadow backdrop-blur-md">
          {hintKey && <span className="font-semibold">{t(hintKey, { n: vertexCount })}</span>}
          {hasInProgress && (
            <>
              <span className="text-inverse-on-surface/60">·</span>
              <button
                type="button"
                onClick={onCancel}
                className="rounded-full px-2 py-0.5 font-bold uppercase tracking-widest hover:bg-white/10"
              >
                {t('draw.cancel')}
              </button>
            </>
          )}
          {tool === 'polygon' && hasInProgress && (
            <button
              type="button"
              onClick={onFinish}
              disabled={!finishEnabled}
              className="rounded-full bg-safety px-3 py-0.5 font-bold uppercase tracking-widest text-white disabled:opacity-50"
            >
              {t('draw.finish')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
