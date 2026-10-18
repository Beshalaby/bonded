import type { Proposal } from "@/lib/procure/types";
import type { PennyReply } from "@/lib/procure/relevance";

export interface PennyDraft { request: string; budget: string; where: "web" | "arena" }
export interface PennyRequest {
  id: string;
  draft: PennyDraft;
  proposal?: Proposal;
  reply?: PennyReply;
  conversationId?: string;
  createdAt?: number;
  error?: string;
}
export interface PennyChat { id: string; title: string; updatedAt: number }

const requests = new Map<string, PennyRequest>();
const pending = new Map<string, Promise<Proposal | PennyReply>>();
const deleted = new Set<string>();
let lastDraft: PennyDraft | undefined;
const DRAFT_KEY = "penny:draft";
const REQUEST_PREFIX = "penny:request:";
const requestKey = (id: string) => `${REQUEST_PREFIX}${id}`;

function readStored<T>(key: string): T | undefined {
  try { return JSON.parse(sessionStorage.getItem(key) ?? "null") ?? undefined; }
  catch { return undefined; }
}

function store(key: string, value: unknown) {
  try { sessionStorage.setItem(key, JSON.stringify(value)); }
  catch { /* The current conversation still works when browser storage is unavailable. */ }
}

function restoreRequests() {
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (!key?.startsWith(REQUEST_PREFIX)) continue;
      const id = key.slice(REQUEST_PREFIX.length);
      if (!requests.has(id)) readRequest(id);
    }
  } catch { /* In-memory history remains available when storage is denied. */ }
}

function persist(request: PennyRequest) {
  if (deleted.has(request.id)) return; // A late response must not restore a deleted conversation.
  requests.set(request.id, request);
  store(requestKey(request.id), request);
}

export function readDraft(): PennyDraft | undefined {
  return lastDraft ?? readStored<PennyDraft>(DRAFT_KEY);
}

export function createRequest(draft: PennyDraft, conversationId?: string): string {
  const id = crypto.randomUUID();
  const rootId = conversationId ? readRequest(conversationId)?.conversationId ?? conversationId : id;
  const request: PennyRequest = { id, draft: { ...draft }, conversationId: rootId, createdAt: Date.now() };
  if (!conversationId) {
    lastDraft = request.draft;
    store(DRAFT_KEY, request.draft);
  }
  persist(request);
  return id;
}

export function readRequest(id: string): PennyRequest | undefined {
  if (deleted.has(id)) return undefined;
  const request = requests.get(id) ?? readStored<PennyRequest>(requestKey(id));
  if (!request || request.id !== id || typeof request.draft?.request !== "string"
    || typeof request.draft.budget !== "string" || !["web", "arena"].includes(request.draft.where)) return undefined;
  requests.set(id, request);
  return request;
}

export function readConversation(rootId: string): PennyRequest[] {
  restoreRequests();
  const conversationId = readRequest(rootId)?.conversationId ?? rootId;
  return [...requests.values()]
    .filter((request) => (request.conversationId ?? request.id) === conversationId)
    .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
}

export function listChats(): PennyChat[] {
  restoreRequests();
  const chats = new Map<string, PennyChat>();
  for (const request of requests.values()) {
    const id = request.conversationId ?? request.id;
    const root = readRequest(id) ?? request;
    const updatedAt = request.createdAt ?? (Date.parse(request.proposal?.createdAt ?? "") || 0);
    const chat = chats.get(id);
    if (chat) chat.updatedAt = Math.max(chat.updatedAt, updatedAt);
    else chats.set(id, { id, title: root.draft.request, updatedAt });
  }
  return [...chats.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function deleteChat(id: string): void {
  for (const turn of readConversation(id)) {
    deleted.add(turn.id);
    requests.delete(turn.id);
    try { sessionStorage.removeItem(requestKey(turn.id)); }
    catch { /* In-memory deletion still works when browser storage is unavailable. */ }
  }
}

function contextualRequest(request: PennyRequest): string {
  const conversation = readConversation(request.conversationId ?? request.id);
  const previous = conversation.slice(0, conversation.findIndex((turn) => turn.id === request.id)).filter((turn) => !turn.reply);
  if (!previous.length) return request.draft.request;
  const latest = request.draft.request;
  const contextLabel = "\nPrevious context (latest message takes priority):\n";
  const available = 1000 - latest.length - contextLabel.length;
  // A full-length user message takes priority over conversation context.
  if (available < 50) return latest;
  const original = previous[0].draft.request.slice(0, Math.ceil(available * 0.6));
  const answer = [...previous].reverse().find((turn) => turn.proposal)?.proposal;
  const answerContext = [
    answer?.wouldBuy ? `Suggested: ${answer.wouldBuy.title}` : "",
    answer?.questions.length ? `Penny asked: ${answer.questions.join(" ")}` : "",
  ].filter(Boolean).join("\n").slice(0, 200);
  const answerText = answerContext ? `\n${answerContext}`.slice(0, available - original.length) : "";
  const earlierUpdates = previous.slice(1).reverse().map((turn) => turn.draft.request).join("; ");
  const remaining = available - original.length - answerText.length;
  const updates = earlierUpdates && remaining > 20
    ? `Earlier updates: ${earlierUpdates.slice(0, Math.min(300, remaining - 18))}\n` : "";
  const context = `${updates}${original}${answerText}`;
  // Intake prefers budget phrases over bare prices, so discard superseded amounts
  // when this message supplies a new price (e.g. “I can spend $200”).
  const effectiveContext = /\$\s*\d/.test(latest)
    ? context.replace(/\$\s*\d+(?:[,.]\d+)*/g, "") : context;
  return `${latest}${contextLabel}${effectiveContext}`;
}

export function shop(input: PennyRequest): Promise<Proposal | PennyReply> {
  const request = readRequest(input.id) ?? input;
  if (request.proposal) return Promise.resolve(request.proposal);
  if (request.reply) return Promise.resolve(request.reply);
  const existing = pending.get(request.id);
  if (existing) return existing;
  delete request.error;
  persist(request);

  const promise = (async () => {
    const { draft } = request;
    const budget = Number(draft.budget.replace(/[$,\s]/g, ""));
    let res: Response;
    try {
      res = await fetch("/api/procure", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ request: contextualRequest(request), message: draft.request, budget: budget > 0 ? budget : undefined, sources: [draft.where] }),
      });
    } catch {
      throw new Error("Couldn’t reach Penny. Check your connection and try again.");
    }
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(res.status === 429 ? "Penny is busy with a lot of requests right now. Try again in a minute."
        : res.status === 401 && draft.where === "web" ? "Sign in to search the web."
        : res.status === 401 || res.status === 403 ? "Penny isn’t open to the public on this server."
          : body?.error ?? "Something went wrong. Try again.");
    }
    if (body?.kind === "reply") request.reply = body as PennyReply;
    else request.proposal = body as Proposal;
    persist(request);
    return (request.reply ?? request.proposal)!;
  })().catch((error: unknown) => {
    request.error = error instanceof Error ? error.message : "Something went wrong. Try again.";
    persist(request);
    throw error;
  }).finally(() => pending.delete(request.id));
  pending.set(request.id, promise);
  return promise;
}
