// Static SVG figures for /methodology. Hairline strokes, zinc ink, one accent; text stays in text tokens.
const INK = "oklch(20% 0.012 70)", MUTED = "oklch(52% 0.011 70)", LINE = "oklch(87% 0.007 80)", FAINT = "oklch(96.6% 0.006 85)", ACCENT = "oklch(52% 0.105 72)";

function Arrow({ id = "arr", color = MUTED }: { id?: string; color?: string }) {
  return (
    <defs>
      <marker id={id} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M0,1 L9,5 L0,9" fill="none" stroke={color} strokeWidth="1.5" />
      </marker>
    </defs>
  );
}

function Box({ x, y, w, h, title, sub, accent, dashed }: { x: number; y: number; w: number; h: number; title: string; sub?: string; accent?: boolean; dashed?: boolean }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={7} fill={accent ? "oklch(96.5% 0.03 88)" : "#fff"} stroke={accent ? ACCENT : LINE} strokeDasharray={dashed ? "4 3" : undefined} />
      <text x={x + w / 2} y={y + (sub ? h / 2 - 3 : h / 2 + 4)} textAnchor="middle" fontSize={12.5} fontWeight={500} fill={INK}>{title}</text>
      {sub && <text x={x + w / 2} y={y + h / 2 + 13} textAnchor="middle" fontSize={10.5} fill={MUTED}>{sub}</text>}
    </g>
  );
}

/** Figure 1: end-to-end pipeline. */
export function PipelineFigure() {
  const W = 940, y = 40, h = 58, w = 132, gap = (W - 6 * w) / 5;
  const xs = Array.from({ length: 6 }, (_, i) => i * (w + gap));
  const boxes = [
    ["Task", "instruction · budget"], ["Agent", "tool calls in the Arena"], ["Trace", "SHA-256 hash chain"],
    ["Grader", "cart vs. ground truth"], ["Attribution", "fault + failure mode"], ["Statistics", "Beta posteriors"],
  ];
  return (
    <>
    {/* Phones: the same pipeline, stacked vertically so the labels stay at reading size */}
    <ol className="space-y-1.5 sm:grid sm:grid-cols-3 sm:gap-3 sm:space-y-0 lg:hidden" aria-label="Pipeline: task, agent, trace, grader, attribution, statistics">
      {boxes.map(([t, s], i) => (
        <li key={t}>
          {i > 0 && <div className="mx-auto mb-1.5 h-3 w-px bg-ink-5 sm:hidden" aria-hidden />}
          <div className={`h-full rounded-[7px] border px-3 py-2 text-center ${i === 2 ? "border-accent bg-accent-soft" : "border-ink-5 bg-white"}`}>
            <div className="text-[13px] font-medium text-ink">{t}</div>
            <div className="text-[12px] text-ink-3">{s}</div>
            {i === 1 && <div className="mt-1.5 rounded-md bg-canvas-sunk px-2 py-1 text-[12px] text-ink-3">store contains traps · guardrail verdict at checkout, appended to the trace</div>}
          </div>
        </li>
      ))}
    </ol>
    <svg viewBox={`0 0 ${W} 150`} className="w-full max-lg:hidden" role="img" aria-label="Pipeline: task, agent, trace, grader, attribution, statistics">
      <Arrow />
      {boxes.map(([t, s], i) => <Box key={t} x={xs[i]} y={y} w={w} h={h} title={t} sub={s} accent={i === 2} />)}
      {xs.slice(0, -1).map((x, i) => <line key={i} x1={x + w + 4} x2={xs[i + 1] - 5} y1={y + h / 2} y2={y + h / 2} stroke={MUTED} markerEnd="url(#arr)" />)}
      {/* adversary + guardrail annotations on the Agent step */}
      <text x={xs[1] + w / 2} y={24} textAnchor="middle" fontSize={11} fill={MUTED}>store contains traps</text>
      <line x1={xs[1] + w / 2} x2={xs[1] + w / 2} y1={28} y2={y - 2} stroke={LINE} strokeDasharray="3 3" />
      <line x1={xs[1] + w / 2} x2={xs[1] + w / 2} y1={y + h + 2} y2={y + h + 22} stroke={LINE} strokeDasharray="3 3" />
      <rect x={xs[1] + w / 2 - 150} y={y + h + 22} width={300} height={28} rx={6} fill={FAINT} stroke={LINE} />
      <text x={xs[1] + w / 2} y={y + h + 40} textAnchor="middle" fontSize={11} fill={MUTED}>guardrail verdict at checkout, appended to the trace</text>
    </svg>
    </>
  );
}

/** Figure 2: hash chain. */
export function ChainFigure() {
  const W = 862, bw = 212, bh = 108, y = 22, gap = 50, x0 = 106;
  const xs = [x0, x0 + bw + gap, x0 + 2 * (bw + gap)];
  const idx = ["k", "k+1", "k+2"];
  const H = ({ i }: { i: string }) => <><tspan fontStyle="italic">h</tspan><tspan fontSize={8} dy={3}>{i}</tspan><tspan dy={-3}>{"\u200a"}</tspan></>;
  return (
    <svg viewBox={`0 0 ${W} 170`} className="w-full max-lg:min-w-[862px]" role="img" aria-label="Hash chain: each entry stores the previous entry's hash">
      <Arrow />
      <Arrow id="arr2" color={ACCENT} />
      <rect x={0} y={y + 30} width={80} height={30} rx={15} fill="#fff" stroke={LINE} strokeDasharray="4 3" />
      <text x={40} y={y + 49} textAnchor="middle" fontSize={11} fill={MUTED} fontFamily="var(--font-geist-mono)">GENESIS</text>
      <line x1={82} x2={xs[0] - 4} y1={y + 45} y2={y + 45} stroke={MUTED} markerEnd="url(#arr)" />
      {xs.map((x, i) => (
        <g key={i}>
          <rect x={x} y={y} width={bw} height={bh} rx={8} fill="#fff" stroke={LINE} />
          <text x={x + 12} y={y + 19} fontSize={11.5} fontWeight={600} fill={INK}>entry #{idx[i]}</text>
          <line x1={x} x2={x + bw} y1={y + 28} y2={y + 28} stroke={FAINT} />
          <text x={x + 12} y={y + 46} fontSize={10.5} fill={MUTED}>prevHash</text>
          <text x={x + bw - 12} y={y + 46} textAnchor="end" fontSize={10.5} fill={ACCENT} fontFamily="var(--font-geist-mono)">
            {i === 0 ? "GENESIS" : <H i={idx[i - 1]} />}
          </text>
          <text x={x + 12} y={y + 62} fontSize={10.5} fill={MUTED}>seq · ts · actor · action</text>
          <text x={x + 12} y={y + 77} fontSize={10.5} fill={MUTED}>payload</text>
          <rect x={x + 8} y={y + bh - 24} width={bw - 16} height={17} rx={4} fill="oklch(96.5% 0.03 88)" />
          <text x={x + bw / 2} y={y + bh - 12} textAnchor="middle" fontSize={10.5} fill={ACCENT} fontFamily="var(--font-geist-mono)">
            <H i={idx[i]} /> = sha256(prev ‖ canonical)
          </text>
        </g>
      ))}
      {xs.slice(0, -1).map((x, i) => (
        <path key={i} d={`M${x + bw - 6},${y + bh - 15} C${x + bw + 26},${y + bh - 15} ${xs[i + 1] - 30},${y + 42} ${xs[i + 1] - 4},${y + 42}`}
          stroke={ACCENT} fill="none" markerEnd="url(#arr2)" />
      ))}
      <text x={W / 2} y={162} textAnchor="middle" fontSize={11} fill={MUTED}>
        Changing any byte of entry k changes its hash, which then no longer matches entry k+1&apos;s prevHash.
      </text>
    </svg>
  );
}

/** Figure 3: red-team loop. */
export function RedTeamFigure() {
  const W = 760;
  return (
    <svg viewBox={`0 0 ${W} 200`} className="w-full max-lg:min-w-[760px]" role="img" aria-label="Red-team loop">
      <Arrow />
      <Box x={0} y={70} w={124} h={54} title="Generate scam" sub="LLM or mutation" />
      <Box x={160} y={70} w={124} h={54} title="Inject listing" sub="source = redteam" />
      <Box x={320} y={70} w={124} h={54} title="Run every model" sub="on the targeted task" />
      <g>
        <path d="M530,62 L604,97 L530,132 L456,97 Z" fill="#fff" stroke={INK} />
        <text x={530} y={94} textAnchor="middle" fontSize={11.5} fontWeight={500} fill={INK}>fooled</text>
        <text x={530} y={108} textAnchor="middle" fontSize={11.5} fontWeight={500} fill={INK}>≥ 1 model?</text>
      </g>
      <Box x={630} y={14} w={130} h={54} title="Keep" sub="registry + task variant" accent />
      <Box x={630} y={128} w={130} h={54} title="Discard" sub="listing removed" dashed />
      {[[124, 160], [284, 320], [444, 456]].map(([a, b], i) => <line key={i} x1={a + 3} x2={b - 4} y1={97} y2={97} stroke={MUTED} markerEnd="url(#arr)" />)}
      <path d="M530,62 L530,41 L626,41" stroke={MUTED} fill="none" markerEnd="url(#arr)" />
      <path d="M530,132 L530,155 L626,155" stroke={MUTED} fill="none" markerEnd="url(#arr)" />
      <text x={538} y={54} fontSize={10.5} fill={MUTED}>yes</text>
      <text x={538} y={148} fontSize={10.5} fill={MUTED}>no</text>
      <path d="M695,14 L695,4 L62,4 L62,66" stroke={LINE} fill="none" strokeDasharray="4 3" markerEnd="url(#arr)" />
      <text x={380} y={18} textAnchor="middle" fontSize={10.5} fill={MUTED}>next round attacks the harder benchmark</text>
    </svg>
  );
}
