// The Lab: every power tool that lives behind the scenes. Shared by the nav sheet and the footer so the two never drift.
export interface LabLink { href: string; label: string; blurb: string; match: (path: string) => boolean }

export const LAB_LINKS: LabLink[] = [
  { href: "/runs", label: "Runs", blurb: "Every evaluation run, replayable.", match: (p) => p.startsWith("/runs") && p !== "/runs/new" },
  { href: "/tasks", label: "Tasks", blurb: "The shopping tasks and the traps in each.", match: (p) => p.startsWith("/tasks") },
  { href: "/traces", label: "Traces", blurb: "Step-by-step, hash-chained session logs.", match: (p) => p.startsWith("/traces") },
  { href: "/redteam", label: "Red team", blurb: "New scams that fooled a model.", match: (p) => p.startsWith("/redteam") },
  { href: "/guardrail", label: "Guardrail", blurb: "What a spending guard would have stopped.", match: (p) => p.startsWith("/guardrail") },
  { href: "/compare", label: "Compare", blurb: "Head to head, with posterior odds.", match: (p) => p.startsWith("/compare") },
  { href: "/methodology", label: "Methodology", blurb: "How scores and intervals are computed.", match: (p) => p.startsWith("/methodology") },
  { href: "/arena", label: "Arena", blurb: "The sandbox store agents shop in.", match: (p) => p.startsWith("/arena") },
];

export const NEW_RUN = { href: "/runs/new", label: "New run", blurb: "Grade models against the task suite." } as const;

export const PRIMARY_LINKS = [
  { href: "/#ranking", label: "Ranking", match: (p: string) => p.startsWith("/models") },
  { href: "/live", label: "Watch", match: (p: string) => p.startsWith("/live") },
  { href: "/connect", label: "Connect", match: (p: string) => p.startsWith("/connect") },
] as const;

export const isLabPath = (p: string) => p === NEW_RUN.href || LAB_LINKS.some((l) => l.match(p));
