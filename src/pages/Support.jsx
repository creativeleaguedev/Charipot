import React, { useState, useEffect, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useWallet } from "@/lib/useWallet";
import { useToast } from "@/components/ui/use-toast";
import AttachmentUpload from "@/components/support/AttachmentUpload";
import MessageComposer from "@/components/support/MessageComposer";
import ChatMessage from "@/components/support/ChatMessage";
import { Send, Plus, Loader2, MessageSquare, CheckCircle2, ArrowLeft, Inbox, History, XCircle, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { InteractiveInput } from "@/components/ui/interactive-input";
import { canAccessAdmin } from "@/lib/adminAccess";
import { Image } from "@/components/ui/image";
import { useLang } from "@/lib/LanguageContext";
import { categoryClass, PRIORITY_STYLE, PRIORITY_DOT, priorityLabel, PRIORITIES, otherSideReadAt, mySideReadAt, myTypingField, otherTyping, initialsOf } from "@/lib/supportUi";

const SUPPORT_LOGO_URL = "https://media.base44.com/images/public/6a9fd1112d3233a0a31bca58/978434dde_generated_image.png";

async function notifySupportAdmins(payload) {
  try { await base44.functions.invoke("notifySupportAdmins", payload); } catch (_) {}
}

const CATEGORIES = [
  "General",
  "Account & Profile",
  "Payments & Wallet",
  "Tickets & Draws",
  "GOV Marketplace",
  "Governance & Projects",
  "Technical Issue",
  "Other",
];

const STATUS_STYLE = {
  OPEN: "bg-blue-100 text-blue-700",
  AWAITING_USER: "bg-amber-100 text-amber-700",
  AWAITING_ADMIN: "bg-sky-100 text-sky-700",
  RESOLVED: "bg-emerald-100 text-emerald-700",
  CLOSED: "bg-muted text-muted-foreground",
};

function previewText(text) {
  const t = (text || "").replace(/\s+/g, " ").trim();
  return t.length > 80 ? t.slice(0, 80) + "…" : t;
}

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

export default function Support() {
  const { user, loading } = useWallet();
  const isAdmin = canAccessAdmin(user);
  const { t } = useLang();
  const { toast } = useToast();
  const [tickets, setTickets] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false);
  const scrollRef = useRef(null);

  const ACTIVE = ["OPEN", "AWAITING_USER", "AWAITING_ADMIN"];
  const activeTickets = tickets.filter((t) => ACTIVE.includes(t.status));
  const historyTickets = tickets.filter((t) => !ACTIVE.includes(t.status));

  const loadTickets = useCallback(async () => {
    if (!user?.id) return;
    try {
      // Admins see every ticket (the support inbox); users only see their own.
      const list = isAdmin
        ? await base44.entities.SupportTicket.list("-updatedAt", 200)
        : await base44.entities.SupportTicket.filter({ userId: user.id }, "-updatedAt", 50);
      setTickets(list);
    } catch (e) {
      // ignore
    }
  }, [user?.id, isAdmin]);

  useEffect(() => {
    loadTickets();
  }, [loadTickets, refreshKey]);

  // Realtime: refresh ticket list when any of my tickets changes.
  useEffect(() => {
    if (!user?.id) return;
    const unsub = base44.entities.SupportTicket.subscribe(() => setRefreshKey((k) => k + 1));
    return unsub;
  }, [user?.id]);

  const selected = tickets.find((t) => t.id === selectedId);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex items-center gap-3">
        <img
          src={SUPPORT_LOGO_URL}
          alt="Support"
          className="h-14 w-14 shrink-0 rounded-full object-cover"
        />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("support.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("support.subtitle")}</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[300px_1fr]">
        {/* Ticket list */}
        <div className={cn("rounded-2xl border border-border bg-card p-3 shadow-sm", selectedId || showNew ? "hidden md:block" : "block")}>
          <div className="flex items-center justify-between px-1 pb-2">
            <p className="text-sm font-bold">{t("support.my_tickets")}</p>
            {!isAdmin && (
              <button
                onClick={() => { setShowNew(true); setSelectedId(null); }}
                className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
              >
                <Plus className="h-3.5 w-3.5" /> {t("support.new")}
              </button>
            )}
          </div>
          <div className="max-h-[60vh] space-y-1.5 overflow-y-auto pr-1">
            {loading && <p className="p-4 text-sm text-muted-foreground">{t("support.loading")}</p>}
            {!loading && tickets.length === 0 && (
              <div className="rounded-xl bg-muted/40 p-6 text-center">
                <Inbox className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-2 text-sm text-muted-foreground">{t("support.no_tickets")}</p>
              </div>
            )}
            {!loading && activeTickets.length === 0 && historyTickets.length > 0 && (
              <div className="rounded-xl bg-muted/40 p-6 text-center">
                <Inbox className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-2 text-sm text-muted-foreground">{t("support.no_active")}</p>
              </div>
            )}
            {activeTickets.map((tk) => (
              <button
                key={tk.id}
                onClick={() => { setSelectedId(tk.id); setShowNew(false); }}
                className={cn(
                  "w-full rounded-xl border p-3 text-left transition-colors",
                  selectedId === tk.id ? "border-primary bg-primary/5" : "border-transparent hover:bg-muted"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className={cn("h-2 w-2 shrink-0 rounded-full", PRIORITY_DOT[tk.priority] || PRIORITY_DOT.normal)} title={`${priorityLabel(tk.priority)} priority`} />
                    <span className="truncate font-mono text-[11px] font-semibold text-primary">{tk.ticketCode}</span>
                  </div>
                  {!(tk.status === "AWAITING_ADMIN" && !isAdmin) && (
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", STATUS_STYLE[tk.status] || "bg-muted")}>
                      {tk.status.replace(/_/g, " ").toLowerCase()}
                    </span>
                  )}
                </div>
                <p className="mt-1 truncate text-sm font-medium">{tk.subject}</p>
                {tk.lastMessagePreview && <p className="mt-0.5 truncate text-xs text-muted-foreground">{tk.lastMessagePreview}</p>}
                <div className="mt-1 flex items-center gap-1.5">
                  <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", categoryClass(tk.category))}>{tk.category}</span>
                  <span className="text-[11px] text-muted-foreground">{timeAgo(tk.lastMessageAt || tk.createdAt)}</span>
                </div>
                {tk.unreadForUser && <span className="mt-1 inline-block rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-accent-foreground">{t("support.new_reply")}</span>}
              </button>
            ))}
            {!loading && historyTickets.length > 0 && (
              <div className="pt-2">
                <button
                  onClick={() => setHistoryOpen((v) => !v)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted"
                >
                  {historyOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  <History className="h-3.5 w-3.5" />
                  {t("support.history")}
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold">{historyTickets.length}</span>
                </button>
                {historyOpen && (
                  <div className="mt-1 space-y-1.5">
                    {historyTickets.map((tk) => (
                      <button
                        key={tk.id}
                        onClick={() => { setSelectedId(tk.id); setShowNew(false); }}
                        className={cn(
                          "w-full rounded-xl border p-3 text-left transition-colors opacity-80",
                          selectedId === tk.id ? "border-primary bg-primary/5" : "border-transparent hover:bg-muted"
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <span className={cn("h-2 w-2 shrink-0 rounded-full", PRIORITY_DOT[tk.priority] || PRIORITY_DOT.normal)} title={`${priorityLabel(tk.priority)} priority`} />
                            <span className="truncate font-mono text-[11px] font-semibold text-primary">{tk.ticketCode}</span>
                          </div>
                          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", STATUS_STYLE[tk.status] || "bg-muted")}>
                            {tk.status.replace(/_/g, " ").toLowerCase()}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-sm font-medium">{tk.subject}</p>
                        <div className="mt-1 flex items-center gap-1.5">
                          <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", categoryClass(tk.category))}>{tk.category}</span>
                          <span className="text-[11px] text-muted-foreground">{timeAgo(tk.lastMessageAt || tk.createdAt)}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Conversation / new ticket */}
        <div className={cn("min-h-[60vh] rounded-2xl border border-border bg-card shadow-sm", selectedId || showNew ? "block" : "hidden md:block")}>
          {showNew ? (
            <NewTicketForm user={user} onCreated={(t) => { setShowNew(false); setSelectedId(t.id); setRefreshKey((k) => k + 1); }} onCancel={() => setShowNew(false)} />
          ) : selected ? (
            <Conversation ticket={selected} user={user} isAdmin={isAdmin} scrollRef={scrollRef} onUpdated={() => setRefreshKey((k) => k + 1)} onBack={() => { setSelectedId(null); setShowNew(false); }} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center p-10 text-center">
              <MessageSquare className="h-10 w-10 text-muted-foreground" />
              <p className="mt-3 text-sm font-medium">{t("support.select_ticket")}</p>
              <p className="mt-1 text-xs text-muted-foreground">{isAdmin ? t("support.admin_hint") : t("support.user_hint")}</p>
              {!isAdmin && (
                <button onClick={() => setShowNew(true)} className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
                  <Plus className="h-4 w-4" /> {t("support.new_ticket")}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-muted/30 p-5 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">{t("support.urgent")}</p>
        <p className="mt-1">{t("support.urgent_desc")}</p>
      </div>
    </div>
  );
}

function NewTicketForm({ user, onCreated, onCancel }) {
  const { toast } = useToast();
  const { t } = useLang();
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState("");
  const [busy, setBusy] = useState(false);
  const [priority, setPriority] = useState("normal");

  const submit = async (e) => {
    e.preventDefault();
    if (!subject.trim() || !body.trim()) {
      toast({ title: t("support.missing_title"), description: t("support.missing_desc"), variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      // Compute next sequential ticket number.
      const existing = await base44.entities.SupportTicket.list("-ticketNumber", 1);
      const nextNum = (existing[0]?.ticketNumber || 0) + 1;
      const ticketCode = `SUP-${String(nextNum).padStart(4, "0")}`;
      const now = new Date().toISOString();
      const ticket = await base44.entities.SupportTicket.create({
        ticketNumber: nextNum,
        ticketCode,
        userId: user.id,
        userName: user.full_name || user.email,
        userEmail: user.email,
        subject: subject.trim(),
        category,
        priority,
        status: "AWAITING_ADMIN",
        unreadForAdmin: true,
        unreadForUser: false,
        lastReadAtUser: now,
        lastMessageAt: now,
        lastMessagePreview: previewText(body),
        createdAt: now,
      });
      await base44.entities.SupportMessage.create({
        ticketId: ticket.id,
        ticketCode,
        ticketNumber: nextNum,
        ticketOwnerId: user.id,
        authorId: user.id,
        authorName: user.full_name || user.email,
        authorRole: "user",
        body: body.trim(),
        attachments,
        createdAt: now,
      });
      notifySupportAdmins({ ticketCode, subject: subject.trim(), userName: user.full_name || user.email, userEmail: user.email, message: body.trim(), category, isNewTicket: true });
      toast({ title: t("support.created_title"), description: t("support.created_desc", { code: ticketCode }) });
      onCreated(ticket);
    } catch (err) {
      toast({ title: t("support.create_failed"), description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border p-4">
        <button type="button" onClick={onCancel} className="rounded-lg p-1.5 hover:bg-muted"><ArrowLeft className="h-4 w-4" /></button>
        <h2 className="font-bold">{t("support.new_ticket_title")}</h2>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <div>
          <label className="text-sm font-medium">{t("support.subject")}</label>
          <InteractiveInput
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={120}
            placeholder={t("support.subject_ph")}
            className="mt-1 w-full"
          />
        </div>
        <div>
          <label className="text-sm font-medium">{t("support.category")}</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary">
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium">{t("support.priority")}</label>
          <div className="mt-1 flex gap-2">
            {PRIORITIES.map((p) => (
              <button
                type="button"
                key={p.key}
                onClick={() => setPriority(p.key)}
                className={cn(
                  "flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors",
                  priority === p.key ? cn(PRIORITY_STYLE[p.key], "border-transparent") : "border-border hover:bg-muted"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-sm font-medium">{t("support.message")}</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            maxLength={3000}
            placeholder={t("support.message_ph")}
            className="mt-1 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
          <p className="text-right text-[11px] text-muted-foreground">{body.length}/3000</p>
        </div>
        <div>
          <label className="text-sm font-medium">{t("support.attachments")}</label>
          <div className="mt-1">
            <AttachmentUpload value={attachments} onChange={setAttachments} />
          </div>
        </div>
      </div>
      <div className="flex gap-2 border-t border-border p-4">
        <button type="button" onClick={onCancel} className="flex-1 rounded-lg border border-border py-2.5 text-sm font-semibold hover:bg-muted">{t("support.cancel")}</button>
        <button type="submit" disabled={busy} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {busy ? t("support.creating") : t("support.create")}
        </button>
      </div>
    </form>
  );
}

function Conversation({ ticket, user, isAdmin, scrollRef, onUpdated, onBack }) {
  const { toast } = useToast();
  const { t } = useLang();
  const [messages, setMessages] = useState([]);
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState("");
  const [sending, setSending] = useState(false);
  const [ending, setEnding] = useState(false);
  const [settingPriority, setSettingPriority] = useState(false);

  // Read-receipt boundary captured once per ticket open (my side's last read time).
  const readBoundaryRef = useRef(null);
  const typingActiveRef = useRef(false);

  const setTyping = async (on) => {
    if (typingActiveRef.current === on) return;
    typingActiveRef.current = on;
    try {
      await base44.entities.SupportTicket.update(ticket.id, { [myTypingField(isAdmin)]: on });
    } catch (_) {}
  };

  const setPriority = async (priority) => {
    setSettingPriority(true);
    try {
      await base44.entities.SupportTicket.update(ticket.id, { priority });
      toast({ title: t("support.priority_updated"), description: `${ticket.ticketCode} → ${priorityLabel(priority)}` });
      onUpdated();
    } catch (err) {
      toast({ title: t("support.priority_failed"), description: err.message, variant: "destructive" });
    } finally {
      setSettingPriority(false);
    }
  };

  const setStatus = async (status) => {
    setEnding(true);
    try {
      await base44.entities.SupportTicket.update(ticket.id, { status });
      await setTyping(false);
      toast({ title: status === "RESOLVED" ? t("support.resolved_title") : t("support.ended_title"), description: t("support.moved_history", { code: ticket.ticketCode }) });
      onUpdated();
    } catch (err) {
      toast({ title: t("support.failed"), description: err.message, variant: "destructive" });
    } finally {
      setEnding(false);
    }
  };

  const loadMessages = useCallback(async () => {
    try {
      const list = await base44.entities.SupportMessage.filter({ ticketId: ticket.id }, "createdAt", 200);
      setMessages(list);
      // Mark this conversation read on my side (drives read receipts for the other party).
      const now = new Date().toISOString();
      const patch = isAdmin
        ? { unreadForAdmin: false, lastReadAtAdmin: now }
        : { unreadForUser: false, lastReadAtUser: now };
      await base44.entities.SupportTicket.update(ticket.id, patch);
      onUpdated();
    } catch (e) {
      // ignore
    }
  }, [ticket.id, isAdmin, onUpdated]);

  // Open: capture the read boundary, load messages, clear typing on close.
  useEffect(() => {
    readBoundaryRef.current = mySideReadAt(ticket, isAdmin) || null;
    loadMessages();
    return () => { setTyping(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket.id]);

  // Realtime: new messages arrive live. Reload on any SupportMessage event —
  // loadMessages already filters by this ticket, so this stays cheap and works
  // even when the event payload doesn't include ticketId.
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
      const authorRole = isAdmin ? "admin" : "user";
      await base44.entities.SupportMessage.create({
        ticketId: ticket.id,
        ticketCode: ticket.ticketCode,
        ticketNumber: ticket.ticketNumber,
        ticketOwnerId: ticket.userId,
        authorId: user.id,
        authorName: user.full_name || user.email,
        authorRole,
        body: body.trim(),
        attachments,
        createdAt: now,
      });
      await base44.entities.SupportTicket.update(ticket.id, {
        status: isAdmin ? "OPEN" : "AWAITING_ADMIN",
        unreadForUser: isAdmin ? true : ticket.unreadForUser,
        unreadForAdmin: isAdmin ? false : true,
        lastMessageAt: now,
        lastMessagePreview: previewText(body) || "(attachment)",
      });
      if (isAdmin) {
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
      } else {
        notifySupportAdmins({ ticketCode: ticket.ticketCode, subject: ticket.subject, userName: user.full_name || user.email, userEmail: user.email, message: body.trim(), category: ticket.category, isNewTicket: false });
      }
      setBody("");
      setAttachments("");
      await setTyping(false);
      onUpdated();
      loadMessages();
    } catch (err) {
      toast({ title: t("support.create_failed"), description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border p-4">
        <div className="flex items-center gap-2">
          <button type="button" onClick={onBack} className="rounded-lg p-1.5 hover:bg-muted md:hidden" title={t("support.back")}><ArrowLeft className="h-4 w-4" /></button>
          <div className="min-w-0">
          <p className="font-mono text-xs font-semibold text-primary">{ticket.ticketCode}</p>
          <div className="mt-0.5 flex items-center gap-2">
            <h2 className="truncate text-sm font-bold">{ticket.subject}</h2>
            <span className={cn("shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold", categoryClass(ticket.category))}>{ticket.category}</span>
          </div>
        </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isAdmin ? (
            <select
              value={ticket.priority || "normal"}
              onChange={(e) => setPriority(e.target.value)}
              disabled={settingPriority}
              title={t("support.set_priority")}
              className="rounded-full border border-input bg-background px-2 py-1 text-[11px] font-semibold capitalize disabled:opacity-60"
            >
              {PRIORITIES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          ) : (
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize", PRIORITY_STYLE[ticket.priority] || PRIORITY_STYLE.normal)}>
              {priorityLabel(ticket.priority)}
            </span>
          )}
          {!(ticket.status === "AWAITING_ADMIN" && !isAdmin) && (
            <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-semibold", STATUS_STYLE[ticket.status])}>
              {ticket.status.replace(/_/g, " ").toLowerCase()}
            </span>
          )}
          {isAdmin && !["RESOLVED", "CLOSED"].includes(ticket.status) && (
            <>
              <button
                onClick={() => setStatus("RESOLVED")}
                disabled={ending}
                className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> {t("support.resolve")}
                </button>
                <button
                onClick={() => setStatus("CLOSED")}
                disabled={ending}
                className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-50"
                >
                <XCircle className="h-3.5 w-3.5" /> {t("support.end")}
                </button>
            </>
          )}
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">{t("support.no_messages")}</p>}
        {(() => {
          const otherRead = otherSideReadAt(ticket, isAdmin);
          const boundary = readBoundaryRef.current;
          const showTyping = otherTyping(ticket, isAdmin) && !["RESOLVED", "CLOSED"].includes(ticket.status);
          const dividerIndex = boundary
            ? messages.findIndex((m) => {
                const incoming = isAdmin ? m.authorRole === "user" : m.authorRole === "admin";
                return incoming && m.createdAt > boundary;
              })
            : -1;
          return (
            <>
              {messages.map((m, i) => {
                const mine = isAdmin ? m.authorRole === "admin" : m.authorRole === "user";
                const seen = mine && !!otherRead && new Date(m.createdAt) <= new Date(otherRead);
                return (
                  <div key={m.id} className="space-y-3">
                    {i === dividerIndex && dividerIndex > 0 && (
                      <div className="flex items-center gap-2 py-1">
                        <div className="h-px flex-1 bg-border" />
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t("support.new_messages")}</span>
                        <div className="h-px flex-1 bg-border" />
                      </div>
                    )}
                    <ChatMessage message={m} mine={mine} viewerIsAdmin={isAdmin} seen={seen} />
                  </div>
                );
              })}
              {showTyping && (
                <div className="flex items-end gap-2.5">
                  {isAdmin ? (
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy-gradient font-semibold text-white ring-1 ring-border">
                      <span className="text-[11px]">{initialsOf(ticket.userName)}</span>
                    </div>
                  ) : (
                    <img src={SUPPORT_LOGO_URL} alt="Support" className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-border" />
                  )}
                  <div>
                    <p className="mb-1 px-1 text-[10px] text-muted-foreground">{isAdmin ? t("support.typing_admin", { name: ticket.userName || "User" }) : t("support.typing_user")}</p>
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

      {["RESOLVED", "CLOSED"].includes(ticket.status) ? (
        <div className="border-t border-border p-4 text-center text-sm text-muted-foreground">
          <CheckCircle2 className="mx-auto mb-1 h-5 w-5 text-emerald-600" />
          {t("support.ended_conv")}
        </div>
      ) : (
        <div className="border-t border-border p-3">
          <MessageComposer
            body={body}
            setBody={setBody}
            attachments={attachments}
            setAttachments={setAttachments}
            onSend={send}
            sending={sending}
            onTypingChange={setTyping}
            onFocus={() => setTyping(true)}
            onBlur={() => setTyping(false)}
          />
        </div>
      )}
    </div>
  );
}