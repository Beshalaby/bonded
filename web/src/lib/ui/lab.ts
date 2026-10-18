// Site sections shared by the nav, the footer and /research so they never drift.
// Research: the evaluation itself (runs, tasks, traces, analysis, methodology). Lab: the infrastructure it runs on.
export interface LabLink { href: string; label: string; blurb: string; match: (path: string) => boolean }

export const RESEARCH_LINKS: LabLink[] = [
  { href: "/runs", label: "Runs", blurb: "Every evaluation run, replayable.", match: (p) => p.startsWith("/runs") && p !== "/runs/new" },
  { href: "/tasks", label: "Tasks", blurb: "The shopping tasks and the traps in each.", match: (p) => p.startsWith("/tasks") },
  { href: "/traces", label: "Traces", blurb: "Step-by-step, hash-chained session logs.", match: (p) => p.startsWith("/traces") },
  { href: "/compare", label: "Compare", blurb: "Head to head, with posterior odds.", match: (p) => p.startsWith("/compare") },
  { href: "/redteam", label: "Red team", blurb: "New scams that fooled a model.", match: (p) => p.startsWith("/redteam") },
  { href: "/guardrail", label: "Guardrail", blurb: "What a spending guard would have stopped.", match: (p) => p.startsWith("/guardrail") },
  { href: "/methodology", label: "Methodology", blurb: "How scores and intervals are computed.", match: (p) => p.startsWith("/methodology") },
];

export const LAB_LINKS: LabLink[] = [
  { href: "/bank", label: "Wallets", blurb: "Each agent's Capital One card and what it bought.", match: (p) => p.startsWith("/bank") },
  { href: "/arena", label: "Arena", blurb: "The sandbox store agents shop in.", match: (p) => p.startsWith("/arena") },
];

export const NEW_RUN = { href: "/runs/new", label: "New run", blurb: "Grade models against the task suite." } as const;

export const isResearchPath = (p: string) => p.startsWith("/research") || p === NEW_RUN.href || RESEARCH_LINKS.some((l) => l.match(p));

export const PRIMARY_LINKS = [
  { href: "/research", label: "Research", match: (p: string) => p.startsWith("/models") || isResearchPath(p) },
  { href: "/penny", label: "Penny", match: (p: string) => p.startsWith("/penny") },
  { href: "/check", label: "Shield", match: (p: string) => p.startsWith("/check") },
  { href: "/connect", label: "Connect", match: (p: string) => p.startsWith("/connect") },
] as const;

export const isLabPath = (p: string) => LAB_LINKS.some((l) => l.match(p));
