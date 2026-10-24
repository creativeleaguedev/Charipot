import React, { useState, useEffect, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import AttachmentUpload, { AttachmentChips } from "@/components/support/AttachmentUpload";
import ChatMessage from "@/components/support/ChatMessage";
import { Inbox, Send, Loader2, Search, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { InteractiveInput } from "@/components/ui/interactive-input";
import { categoryClass, PRIORITY_STYLE, PRIORITY_DOT, priorityLabel, PRIORITIES, otherSideReadAt, mySideReadAt, initialsOf } from "@/lib/supportUi";

const STATUS_STYLE = {
  OPEN: "bg-blue-100 text-blue-700",
  AWAITING_USER: "bg-amber-100 text-amber-700",
  AWAITING_ADMIN: "bg-sky-100 text-sky-700",
  RESOLVED: "bg-emerald-100 text-emerald-700",
  CLOSED: "bg-muted text-muted-foreground",
};

const FILTERS = [
  { key: "open", label: "Needs attention", match: (t) => ["OPEN", "AWAITING_ADMIN"].includes(t.status) },
  { key: "resolved", label: "Resolved/Closed", match: (t) => ["RESOLVED", "CLOSED"].includes(t.status) },
  { key: "all", label: "All", match: () => true },
];

function timeAgo(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString();
}

export default function SupportInboxPanel({ user }) {
  const [tickets, setTickets] = useState([]);
  const [filter, setFilter] = useState("open");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const scrollRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const list = await base44.entities.SupportTicket.list("-updatedAt", 200);
      setTickets(list);
    } catch (e) {
      // ignore
    }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  useEffect(() => {
    const unsub = base44.entities.SupportTicket.subscribe(() => setRefreshKey((k) => k + 1));
    return unsub;
  }, []);

  const filtered = tickets
    .filter((t) => FILTERS.find((f) => f.key === filter).match(t))
    .filter((t) => {
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return (t.ticketCode || "").toLowerCase().includes(q) ||
             (t.subject || "").toLowerCase().includes(q) ||
             (t.userName || "").toLowerCase().includes(q) ||
             (t.userEmail || "").toLowerCase().includes(q);
    })
    .sort((a, b) => {
      const PRIORITY_RANK = { high: 0, normal: 1, low: 2 };
      const pr = (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1);
      if (pr !== 0) return pr;
      return (b.lastMessageAt || "").localeCompare(a.lastMessageAt || "");
    });

  const counts = FILTERS.reduce((acc, f) => {
    acc[f.key] = tickets.filter(f.match).length;
    return acc;
  }, {});
  const openCount = counts.open;

  const selected = tickets.find((t) => t.id === selectedId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Support inbox — reply to users and resolve or close tickets. {openCount > 0 && <span className="font-semibold text-accent">{openCount} awaiting reply.</span>}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        {/* Inbox list */}
        <div className="rounded-2xl border border-border bg-card p-3 shadow-sm">
          <div className="space-y-2 pb-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <InteractiveInput
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search tickets, users…"
                className="w-full pl-8 pr-3"
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors",
                    filter === f.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
                  )}
                >
                  {f.label}
                  <span className={cn("rounded-full px-1.5 text-[10px]", filter === f.key ? "bg-white/20" : "bg-background")}>{counts[f.key]}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="max-h-[65vh] space-y-1.5 overflow-y-auto pr-1">
            {filtered.length === 0 && (
              <div className="rounded-xl bg-muted/40 p-6 text-center">
                <Inbox className="mx-auto h-7 w-7 text-muted-foreground" />
                <p className="mt-2 text-sm text-muted-foreground">No tickets here.</p>
              </div>
            )}
            {filtered.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                className={cn(
                  "w-full rounded-xl border p-3 text-left transition-colors",
                  selectedId === t.id ? "border-primary bg-primary/5" : "border-transparent hover:bg-muted"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className={cn("h-2 w-2 shrink-0 rounded-full", PRIORITY_DOT[t.priority] || PRIORITY_DOT.normal)} title={`${priorityLabel(t.priority)} priority`} />
                    <span className="truncate font-mono text-[11px] font-semibold text-primary">{t.ticketCode}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold capitalize", PRIORITY_STYLE[t.priority] || PRIORITY_STYLE.normal)}>{priorityLabel(t.priority)}</span>
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", STATUS_STYLE[t.status])}>
                      {t.status.replace(/_/g, " ").toLowerCase()}
                    </span>
                  </div>
                </div>
                <p className="mt-1 truncate text-sm font-medium">{t.subject}</p>
                {t.lastMessagePreview && <p className="mt-0.5 truncate text-xs text-muted-foreground">{t.lastMessagePreview}</p>}
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", categoryClass(t.category))}>{t.category}</span>
                  <span className="text-[11px] text-muted-foreground">{t.userName || t.userEmail} · {timeAgo(t.lastMessageAt || t.createdAt)}</span>
                </div>
                {t.unreadForAdmin && <span className="mt-1 inline-block rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-accent-foreground">New</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Conversation */}
        <div className="min-h-[65vh] rounded-2xl border border-border bg-card shadow-sm">
          {selected ? (
            <AdminConversation ticket={selected} user={user} scrollRef={scrollRef} onUpdated={() => setRefreshKey((k) => k + 1)} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center p-10 text-center">
              <Inbox className="h-10 w-10 text-muted-foreground" />
              <p className="mt-3 text-sm font-medium">Select a ticket to reply</p>
              <p className="mt-1 text-xs text-muted-foreground">All replies are visible to the user in-app.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AdminConversation({ ticket, user, scrollRef, onUpdated }) {
  const { toast } = useToast();
  const [messages, setMessages] = useState([]);
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState("");
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [settingPriority, setSettingPriority] = useState(false);

  const readBoundaryRef = useRef(null);
  const typingActiveRef = useRef(false);

  const setTyping = async (on) => {
    if (typingActiveRef.current === on) return;
    typingActiveRef.current = on;
    try {
      await base44.entities.SupportTicket.update(ticket.id, { adminTyping: on });
    } catch (_) {}
  };

  const setPriority = async (priority) => {
    setSettingPriority(true);
    try {
      await base44.entities.SupportTicket.update(ticket.id, { priority });
      toast({ title: "Priority updated", description: `${ticket.ticketCode} → ${priorityLabel(priority)}` });
      onUpdated();
    } catch (err) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally {
      setSettingPriority(false);
    }
  };

  const loadMessages = useCallback(async () => {
    try {
      const list = await base44.entities.SupportMessage.filter({ ticketId: ticket.id }, "createdAt", 200);
      setMessages(list);
      const now = new Date().toISOString();
      await base44.entities.SupportTicket.update(ticket.id, { unreadForAdmin: false, lastReadAtAdmin: now });
      onUpdated();
    } catch (e) {
      // ignore
    }
  }, [ticket.id, onUpdated]);

  // Open: capture read boundary, load, clear typing on close.
  useEffect(() => {
    readBoundaryRef.current = mySideReadAt(ticket, true) || null;
    loadMessages();
    return () => { setTyping(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket.id]);

  // Realtime: reload this conversation on any SupportMessage event. loadMessages
  // already filters by ticketId, so cross-session replies appear without refresh.
  useEffect(() => {
    const unsub = base44.entities.SupportMessage.subscribe(() => loadMessages());
    return unsub;
  }, [ticket.id, loadMessages]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, scrollRef]);

  const send = async (e) => {
    e.preventDefault();
    if (!body.trim() && !attachments) return;
    setSending(true);
    try {
      const now = new Date().toISOString();
      await base44.entities.SupportMessage.create({
        ticketId: ticket.id,
        ticketCode: ticket.ticketCode,
        ticketNumber: ticket.ticketNumber,
        ticketOwnerId: ticket.userId,
        authorId: user?.id,
        authorName: user?.full_name || user?.email || "Support Team",
        authorRole: "admin",
        body: body.trim(),
        attachments,
        createdAt: now,
      });
      await base44.entities.SupportTicket.update(ticket.id, {
        status: "OPEN",
        unreadForUser: true,
        unreadForAdmin: false,
        lastMessageAt: now,
        lastMessagePreview: previewText(body) || "(attachment)",
      });
      // Notify the ticket owner in-app so the bell + sidebar light up.
      try {
        await base44.entities.Notification.create({
          userId: ticket.userId,
          title: `Support replied · ${ticket.ticketCode}`,
          message: previewText(body) || "(attachment)",
          type: "ticket",
          read: false,
          createdAt: now,
        });
      } catch (_) {}
      setBody("");
      setAttachments("");
      await setTyping(false);
      onUpdated();
      loadMessages();
      toast({ title: "Reply sent", description: `Replied to ${ticket.ticketCode}.` });
    } catch (err) {
      toast({ title: "Could not send reply", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const setStatus = async (status) => {
    setBusy(true);
    try {
      await base44.entities.SupportTicket.update(ticket.id, { status });
      await setTyping(false);
      onUpdated();
      toast({ title: status === "RESOLVED" ? "Marked resolved" : "Ticket closed", description: ticket.ticketCode });
    } catch (err) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-4">
        <div className="min-w-0">
          <p className="font-mono text-xs font-semibold text-primary">{ticket.ticketCode}</p>
          <div className="mt-0.5 flex items-center gap-2">
            <h2 className="truncate text-sm font-bold">{ticket.subject}</h2>
            <span className={cn("shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold", categoryClass(ticket.category))}>{ticket.category}</span>
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{ticket.userName || "—"}{ticket.userEmail ? ` · ${ticket.userEmail}` : ""}</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={ticket.priority || "normal"}
            onChange={(e) => setPriority(e.target.value)}
            disabled={settingPriority}
            title="Set priority"
            className="rounded-full border border-input bg-background px-2 py-1 text-[11px] font-semibold capitalize disabled:opacity-60"
          >
            {PRIORITIES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
          <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-semibold", STATUS_STYLE[ticket.status])}>
            {ticket.status.replace(/_/g, " ").toLowerCase()}
          </span>
          {!["RESOLVED", "CLOSED"].includes(ticket.status) && (
            <>
              <button onClick={() => setStatus("RESOLVED")} disabled={busy} className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">
                <CheckCircle2 className="h-3.5 w-3.5" /> Resolve
              </button>
              <button onClick={() => setStatus("CLOSED")} disabled={busy} className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-50">
                <XCircle className="h-3.5 w-3.5" /> Close
              </button>
            </>
          )}
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No messages yet.</p>}
        {(() => {
          const otherRead = otherSideReadAt(ticket, true);
          const boundary = readBoundaryRef.current;
          const showTyping = ticket.userTyping && !["RESOLVED", "CLOSED"].includes(ticket.status);
          const dividerIndex = boundary
            ? messages.findIndex((m) => m.authorRole === "user" && m.createdAt > boundary)
            : -1;
          return (
            <>
              {messages.map((m, i) => {
                const mine = m.authorRole === "admin";
                const seen = mine && !!otherRead && new Date(m.createdAt) <= new Date(otherRead);
                return (
                  <div key={m.id} className="space-y-3">
                    {i === dividerIndex && dividerIndex > 0 && (
                      <div className="flex items-center gap-2 py-1">
                        <div className="h-px flex-1 bg-border" />
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">New messages</span>
                        <div className="h-px flex-1 bg-border" />
                      </div>
                    )}
                    <ChatMessage message={m} mine={mine} viewerIsAdmin seen={seen} />
                  </div>
                );
              })}
              {showTyping && (
                <div className="flex items-end gap-2.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy-gradient font-semibold text-white ring-1 ring-border">
                    <span className="text-[11px]">{initialsOf(ticket.userName)}</span>
                  </div>
                  <div>
                    <p className="mb-1 px-1 text-[10px] text-muted-foreground">{ticket.userName || "User"} is typing…</p>
                    <div className="w-fit rounded-2xl rounded-bl-sm bg-card px-4 py-3.5 shadow-sm ring-1 ring-border">
                      <div className="flex items-center gap-1">
                        <span className="h-2 w-2 animate-bounce rounded-full bg-primary/40 [animation-delay:-0.3s]" />
                        <span className="h-2 w-2 animate-bounce rounded-full bg-primary/60 [animation-delay:-0.15s]" />
                        <span className="h-2 w-2 animate-bounce rounded-full bg-primary/80" />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          );
        })()}
      </div>

      {ticket.status === "CLOSED" ? (
        <div className="border-t border-border p-4 text-center text-sm text-muted-foreground">This ticket is closed.</div>
      ) : (
        <form onSubmit={send} className="space-y-2 border-t border-border p-3">
          <AttachmentChips value={attachments} onChange={setAttachments} />
          <div className="flex items-end gap-2 rounded-full border border-input bg-muted/40 px-2 py-1.5 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary">
            <AttachmentUpload value={attachments} onChange={setAttachments} triggerOnly />
            <textarea
              value={body}
              onChange={(e) => { setBody(e.target.value); setTyping(true); }}
              onFocus={() => setTyping(true)}
              onBlur={() => setTyping(false)}
              rows={1}
              placeholder="Reply to user…"
              className="max-h-32 flex-1 resize-none bg-transparent px-1 py-1.5 text-sm outline-none"
            />
            <button
              type="submit"
              disabled={sending || (!body.trim() && !attachments)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function previewText(text) {
  const t = (text || "").replace(/\s+/g, " ").trim();
  return t.length > 80 ? t.slice(0, 80) + "…" : t;
}