"use client";
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowUp, Check, Menu, MessageSquare, Plus, RotateCcw, X } from "lucide-react";
import { cx, EASE } from "@/design";
import Answer, { PennyAvatar } from "./Answer";
import { createRequest, listChats, readConversation, shop, type PennyChat, type PennyDraft, type PennyRequest } from "./session";

const STAGES = ["Reading your request", "Finding options", "Checking listings", "Comparing options", "Checking the final pick"];
const STAGE_AT = [0, 1800, 6000, 11000, 18000];

export default function ProcessView({ id }: { id?: string }) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [turns, setTurns] = useState<PennyRequest[]>([]);
  const [chats, setChats] = useState<PennyChat[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busyId, setBusyId] = useState<string>();
  const [stage, setStage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [retry, setRetry] = useState<{ id: string; nonce: number }>();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [budget, setBudget] = useState("");
  const [where, setWhere] = useState<PennyDraft["where"]>("web");
  const textarea = useRef<HTMLTextAreaElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const dialog = useRef<HTMLDialogElement>(null);
  const initialized = useRef(false);

  useEffect(() => {
    const conversation = id ? readConversation(id) : [];
    setTurns(conversation);
    setChats(listChats());
    setLoaded(true);
    if (!initialized.current) {
      const latest = conversation.at(-1);
      if (latest) { setBudget(latest.draft.budget); setWhere(latest.draft.where); }
      initialized.current = true;
    }
    const current = (retry && conversation.find((turn) => turn.id === retry.id && !turn.proposal)) || conversation.at(-1);
    if (!current || current.proposal || (current.error && retry?.id !== current.id)) {
      setBusyId(undefined);
      return;
    }
    let active = true;
    setBusyId(current.id);
    setStage(0);
    const timers = STAGE_AT.slice(1).map((ms, i) => setTimeout(() => {
      if (active) setStage(i + 1);
    }, ms));
    const refresh = () => {
      if (!active) return;
      setTurns(readConversation(id!));
      setChats(listChats());
      setBusyId(undefined);
    };
    shop(current).then(refresh, refresh).finally(() => timers.forEach(clearTimeout));
    return () => { active = false; timers.forEach(clearTimeout); };
  }, [id, revision, retry]);

  useEffect(() => {
    if (sidebarOpen) dialog.current?.showModal();
    else dialog.current?.close();
  }, [sidebarOpen]);

  useLayoutEffect(() => {
    if (stick.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [turns, busyId]);

  useEffect(() => {
    const observer = new ResizeObserver(() => {
      if (stick.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
    });
    if (scroll.current) observer.observe(scroll.current);
    if (content.current) observer.observe(content.current);
    return () => observer.disconnect();
  }, []);

  const send = (event: FormEvent) => {
    event.preventDefault();
    const text = message.trim();
    if (!text || busyId) return;
    const conversationId = turns.length ? id : undefined;
    const requestId = createRequest({ request: text, budget, where }, conversationId);
    setMessage("");
    if (textarea.current) textarea.current.style.height = "auto";
    stick.current = true;
    if (conversationId) setRevision((n) => n + 1);
    else router.push("/penny/shop/" + requestId);
    textarea.current?.focus();
  };
  const newChat = () => {
    setSidebarOpen(false);
    if (id) router.push("/penny/shop");
    else { setMessage(""); textarea.current?.focus(); }
  };
  const sidebar = <Sidebar chats={chats} activeId={id} onNew={newChat} onSelect={() => setSidebarOpen(false)} />;
  const missing = loaded && !!id && !turns.length;

  return (
    <motion.section className="grid h-full min-h-0 bg-canvas md:grid-cols-[256px_minmax(0,1fr)]" aria-label="Chat with Penny"
      initial={{ opacity: 0, y: reduce ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduce ? 0 : 0.45, ease: EASE }}>
      <aside className="hidden min-h-0 flex-col bg-canvas-sunk/60 md:flex">{sidebar}</aside>
      <dialog ref={dialog} id="penny-history" aria-label="Chat history" onClose={() => setSidebarOpen(false)}
        onClick={(e) => { if (e.target === e.currentTarget) setSidebarOpen(false); }}
        className="fixed inset-y-0 left-0 m-0 h-dvh max-h-none w-[min(300px,85vw)] max-w-none border-0 bg-canvas-sunk p-0 text-ink backdrop:bg-ink/25 backdrop:backdrop-blur-[2px]">
        <div className="relative flex h-full flex-col">
          <button type="button" onClick={() => setSidebarOpen(false)} aria-label="Close chat history" className="absolute right-3 top-4 grid size-10 place-items-center rounded-full text-ink-3 hover:bg-ink/5"><X size={18} /></button>
          {sidebar}
        </div>
      </dialog>

      <div className="flex min-h-0 min-w-0 flex-col">
        <header className="flex h-[72px] shrink-0 items-center justify-between gap-3 px-4 sm:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={() => setSidebarOpen(true)} aria-label="Open chat history" aria-controls="penny-history" aria-expanded={sidebarOpen}
              className="-ml-1 grid size-10 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-canvas-sunk md:hidden"><Menu size={20} /></button>
            <div>
              <h1 className="text-[18px] font-[600] tracking-[-0.03em] text-ink">Penny</h1>
            </div>
          </div>
          <Link href="/penny" className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-[12.5px] text-ink-3 transition-colors hover:bg-canvas-sunk hover:text-ink">
            <ArrowLeft size={14} aria-hidden /> Back to Penny
          </Link>
        </header>

        <div ref={scroll} onScroll={() => { const el = scroll.current; if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100; }}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]" role="region" aria-label="Conversation">
          <div ref={content} className="mx-auto flex min-h-full w-full max-w-[800px] flex-col px-4 pb-8 pt-7 sm:px-8 sm:pt-10">
            {!loaded && <div className="flex items-center gap-3 text-[14px] text-ink-3"><PennyAvatar size={28} /><span className="animate-pulse">Loading…</span></div>}
            {loaded && !turns.length && (
              <div className="flex flex-1 flex-col items-center justify-center pb-8 text-center">
                <div className="relative isolate">
                  <div aria-hidden className="burst burst-gold" style={{ "--bs": "300px", "--bx": "50%", "--by": "50%", "--bo": 0.45 } as React.CSSProperties} />
                  <PennyAvatar size={56} />
                </div>
                <h2 className="mt-6 text-[30px] font-[600] leading-[1.1] tracking-[-0.04em] text-ink sm:text-[38px]">What are we shopping for?</h2>
                {missing && <p className="mt-3 max-w-[34ch] text-[15px] leading-relaxed text-ink-3">Chat unavailable. Start a new one below.</p>}
                <div className="mt-7 flex flex-wrap justify-center gap-2">
                  {["AirPods Pro 2 under $250", "A gift for a coffee lover", "Running shoes"].map((example) => (
                    <button key={example} type="button" onClick={() => { setMessage(example); textarea.current?.focus(); }}
                      className="rounded-full bg-canvas-sunk px-3.5 py-2.5 text-[12.5px] text-ink-2 transition-colors hover:bg-ink/[0.08]">{example}</button>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-12" aria-live="polite">
              {turns.map((turn) => (
                <motion.article key={turn.id} aria-label="Shopping request" initial={{ opacity: 0, y: reduce ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }} className="grid gap-7">
                  <RequestBubble draft={turn.draft} />
                  {turn.proposal ? <Answer p={turn.proposal} showRequest={false} />
                    : turn.error && busyId !== turn.id ? (
                      <div className="flex items-start gap-3">
                        <PennyAvatar size={28} />
                        <div role="alert" className="min-w-0 flex-1 rounded-[20px] rounded-tl-[6px] bg-coral-soft px-4 py-3 text-[14px] leading-relaxed text-ink">
                          <p>{turn.error}</p>
                          <button type="button" disabled={!!busyId} onClick={() => setRetry({ id: turn.id, nonce: Date.now() })} className="mt-2 inline-flex min-h-10 items-center gap-2 font-medium text-coral-ink hover:underline disabled:opacity-50"><RotateCcw size={13} aria-hidden /> Try again</button>
                        </div>
                      </div>
                    ) : <Working stage={busyId === turn.id ? stage : 0} />}
                </motion.article>
              ))}
            </div>
          </div>
        </div>

        <Composer message={message} onMessage={setMessage} budget={budget} onBudget={setBudget}
          busy={!!busyId || !loaded} textarea={textarea} onSubmit={send} />
      </div>
    </motion.section>
  );
}

function Sidebar({ chats, activeId, onNew, onSelect }: { chats: PennyChat[]; activeId?: string; onNew: () => void; onSelect: () => void }) {
  return (
    <>
      <Link href="/penny" className="mx-5 mt-6 flex w-fit items-center gap-2.5 text-[19px] font-[600] tracking-[-0.035em] text-ink"><PennyAvatar size={28} /> Penny</Link>
      <button type="button" onClick={onNew} className="mx-3 mt-7 flex min-h-11 items-center gap-2.5 rounded-[12px] px-3 text-[13.5px] font-medium text-ink transition-colors hover:bg-ink/[0.06]">
        <Plus size={17} aria-hidden /> New chat
      </button>
      <nav aria-label="Previous chats" className="mt-7 min-h-0 flex-1 overflow-y-auto px-3">
        <p className="mb-2 px-3 text-[11.5px] font-medium text-ink-3">Chats</p>
        {chats.length ? <ul className="space-y-1">
          {chats.map((chat) => <li key={chat.id}>
            <Link href={"/penny/shop/" + chat.id} onClick={onSelect} aria-current={activeId === chat.id ? "page" : undefined} title={chat.title}
              className={cx("flex min-h-11 items-center gap-2.5 rounded-[12px] px-3 text-[13px] transition-colors hover:bg-ink/[0.05]", activeId === chat.id ? "bg-ink/[0.06] font-medium text-ink" : "text-ink-2")}>
              <MessageSquare size={14} className="shrink-0 text-ink-3" aria-hidden /><span className="truncate">{chat.title}</span>
            </Link>
          </li>)}
        </ul> : <p className="px-3 text-[12.5px] text-ink-3">No chats yet</p>}
      </nav>
    </>
  );
}

function Composer({ message, onMessage, budget, onBudget, busy, textarea, onSubmit }: {
  message: string; onMessage: (s: string) => void; budget: string; onBudget: (s: string) => void;
  busy: boolean;
  textarea: RefObject<HTMLTextAreaElement | null>; onSubmit: (event: FormEvent) => void;
}) {
  return (
    <div className="shrink-0 bg-canvas px-3 pt-2 sm:px-7" style={{ paddingBottom: "max(20px, env(safe-area-inset-bottom))" }}>
      <form onSubmit={onSubmit} aria-label="Message Penny" className="mx-auto max-w-[736px] rounded-[24px] bg-white p-3 shadow-[0_0_0_1px_oklch(20%_0.012_70/0.10),0_8px_28px_-16px_oklch(20%_0.012_70/0.2)] transition-shadow focus-within:shadow-[0_0_0_1px_oklch(52%_0.105_72/0.35),0_8px_28px_-16px_oklch(20%_0.012_70/0.2)] sm:p-4">
        <label htmlFor="penny-message" className="sr-only">Message Penny</label>
        <textarea ref={textarea} id="penny-message" value={message} maxLength={1000} rows={1}
          onChange={(e) => { onMessage(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px"; }}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }}
          placeholder="Message Penny…"
          className="block max-h-40 min-h-12 w-full resize-none bg-transparent px-1 py-1 text-[15px] leading-relaxed text-ink outline-none placeholder:text-ink-3" />
        <div className="mt-2 flex items-center gap-2">
          <label className="inline-flex items-center gap-1 rounded-full bg-canvas-sunk px-2.5 text-[12px] text-ink-3">
            <span>Budget</span><span aria-hidden>$</span>
            <input value={budget} onChange={(e) => onBudget(e.target.value)} inputMode="decimal" placeholder="Any" aria-label="Budget in dollars" className="h-8 w-12 bg-transparent text-ink outline-none placeholder:text-ink-3" />
          </label>
          <button type="submit" disabled={busy || !message.trim()} aria-label="Send message" className="ml-auto grid size-9 shrink-0 place-items-center rounded-full bg-ink text-white transition-[opacity,transform] hover:opacity-80 active:scale-95 disabled:opacity-20">
            <ArrowUp size={18} strokeWidth={2.2} aria-hidden />
          </button>
        </div>
      </form>
    </div>
  );
}

function RequestBubble({ draft }: { draft: PennyDraft }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[88%] whitespace-pre-wrap break-words rounded-[22px] rounded-br-[6px] bg-canvas-sunk px-4 py-3 text-[15px] leading-relaxed text-ink sm:max-w-[80%]">
        {draft.request}
        <p className="mt-1.5 text-[11.5px] text-ink-3">{draft.budget && <>Budget $ {draft.budget.replace(/^\$/, "")} · </>}{draft.where === "web" ? "The web" : "Sandbox store"}</p>
      </div>
    </div>
  );
}

function Working({ stage }: { stage: number }) {
  return (
    <div className="flex items-start gap-3" role="status">
      <PennyAvatar size={28} />
      <div className="min-w-0 pt-1">
        <div className="relative h-[22px] overflow-hidden">
          <AnimatePresence initial={false} mode="popLayout">
            <motion.p key={stage} className="text-[14px] font-medium text-ink-3" initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -8, opacity: 0 }} transition={{ duration: 0.3, ease: EASE }}>{STAGES[stage]}</motion.p>
          </AnimatePresence>
        </div>
        <div className="mt-2 flex items-center gap-2.5">
          <div className="flex gap-1" aria-hidden>{STAGES.map((s, i) => <span key={s} className={cx("grid size-3 place-items-center rounded-full", i < stage ? "text-pass-ink" : i === stage ? "animate-pulse bg-gold/50" : "bg-ink/[0.06]")}>{i < stage && <Check size={10} />}</span>)}</div>
        </div>
      </div>
    </div>
  );
}
