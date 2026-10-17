"use client";
// Observed proportion (dot) with its 90% Beta credible interval (bar) on a fixed 0–100% track.
// Unlike CIBar, the dot is the observed k/n, not the posterior mean, so it matches the printed number.
// `fluid`: draw at `width` but shrink to fit a narrower block container (phones) without scaling the marks.
export default function IntervalRail({ point, lower, upper, width = 160, color = "oklch(52% 0.105 72)", fluid }: { point: number; lower: number; upper: number; width?: number; color?: string; fluid?: boolean }) {
  const h = 14, pad = 5;
  const label = `${Math.round(point * 100)}%, 90% CI ${Math.round(lower * 100)}–${Math.round(upper * 100)}%`;
  if (fluid) {
    const p = (v: number) => `${Math.max(0, Math.min(1, v)) * 100}%`;
    return (
      <span className="block" style={{ maxWidth: width, paddingInline: pad }}>
        <svg width="100%" height={h} overflow="visible" className="block" aria-label={label}>
          <line x1="0%" x2="100%" y1={h / 2} y2={h / 2} stroke="oklch(92% 0.006 80)" />
          {[0, 0.5, 1].map((t) => <line key={t} x1={p(t)} x2={p(t)} y1={h / 2 - 3} y2={h / 2 + 3} stroke="oklch(87% 0.007 80)" />)}
          <rect x={p(lower)} y={h / 2 - 3} width={`${Math.max(0.8, (Math.max(0, Math.min(1, upper)) - Math.max(0, Math.min(1, lower))) * 100)}%`} height={6} rx={3} fill={color} opacity={0.2} />
          <line x1={p(lower)} x2={p(upper)} y1={h / 2} y2={h / 2} stroke={color} strokeWidth={2} strokeLinecap="round" />
          <circle cx={p(point)} cy={h / 2} r={4} fill={color} stroke="#fff" strokeWidth={2} />
        </svg>
      </span>
    );
  }
  const sx = (v: number) => pad + Math.max(0, Math.min(1, v)) * (width - pad * 2);
  return (
    <svg width={width} height={h} className="block shrink-0" aria-label={label}>
      <line x1={pad} x2={width - pad} y1={h / 2} y2={h / 2} stroke="oklch(92% 0.006 80)" />
      {[0, 0.5, 1].map((t) => <line key={t} x1={sx(t)} x2={sx(t)} y1={h / 2 - 3} y2={h / 2 + 3} stroke="oklch(87% 0.007 80)" />)}
      <rect x={sx(lower)} y={h / 2 - 3} width={Math.max(2, sx(upper) - sx(lower))} height={6} rx={3} fill={color} opacity={0.2} />
      <line x1={sx(lower)} x2={sx(upper)} y1={h / 2} y2={h / 2} stroke={color} strokeWidth={2} strokeLinecap="round" />
      <circle cx={sx(point)} cy={h / 2} r={4} fill={color} stroke="#fff" strokeWidth={2} />
    </svg>
  );
}
