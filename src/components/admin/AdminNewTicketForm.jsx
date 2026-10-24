import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { ArrowLeft, Send, Loader2, Search } from "lucide-react";
import { InteractiveInput } from "@/components/ui/interactive-input";

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

export default function AdminNewTicketForm({ user, onCreated, onCancel }) {
  const { toast } = useToast();
  const [users, setUsers] = useState([]);
  const [query, setQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const list = await base44.entities.User.list("email", 500);
        setUsers(list.filter((u) => u.id !== user?.id));
      } catch (e) {
        // ignore
      }
    })();
  }, [user?.id]);

  const filtered = query.trim()
    ? users.filter(
        (u) =>
          (u.email || "").toLowerCase().includes(query.toLowerCase()) ||
          (u.full_name || "").toLowerCase().includes(query.toLowerCase())
      )
    : users;

  const submit = async (e) => {
    e.preventDefault();
    if (!selectedUser) {
      toast({ title: "Select a recipient", variant: "destructive" });
      return;
    }
    if (!subject.trim() || !body.trim()) {
      toast({ title: "Subject and message are required", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const res = await base44.functions.invoke("adminCreateSupportTicket", {
        userId: selectedUser.id,
        subject: subject.trim(),
        category,
        body: body.trim(),
      });
      toast({
        title: "Ticket created",
        description: `${res.data.ticketCode} opened for ${selectedUser.email}.`,
      });
      onCreated({ id: res.data.ticketId, ticketCode: res.data.ticketCode });
    } catch (err) {
      toast({ title: "Could not create ticket", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border p-4">
        <button type="button" onClick={onCancel} className="rounded-lg p-1.5 hover:bg-muted">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h2 className="font-bold">New Ticket to User</h2>
      </div>
      <form onSubmit={submit} className="flex flex-1 flex-col">
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div>
            <label className="text-sm font-medium">Recipient</label>
            {selectedUser ? (
              <div className="mt-1 flex items-center justify-between rounded-lg border border-input bg-background px-3 py-2">
                <span className="truncate text-sm">
                  {selectedUser.full_name || selectedUser.email}{" "}
                  <span className="text-muted-foreground">&lt;{selectedUser.email}&gt;</span>
                </span>
                <button type="button" onClick={() => setSelectedUser(null)} className="ml-2 shrink-0 text-xs font-semibold text-primary">
                  Change
                </button>
              </div>
            ) : (
              <div className="mt-1">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <InteractiveInput
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search user by name or email…"
                    className="w-full pl-8 pr-3"
                  />
                </div>
                <div className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-border">
                  {filtered.slice(0, 20).map((u) => (
                    <button
                      type="button"
                      key={u.id}
                      onClick={() => { setSelectedUser(u); setQuery(""); }}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted"
                    >
                      <span className="truncate">{u.full_name || u.email}</span>
                      <span className="ml-2 shrink-0 text-xs text-muted-foreground">{u.email}</span>
                    </button>
                  ))}
                  {filtered.length === 0 && (
                    <p className="px-3 py-2 text-sm text-muted-foreground">No users found.</p>
                  )}
                </div>
              </div>
            )}
          </div>
          <div>
            <label className="text-sm font-medium">Subject</label>
            <InteractiveInput
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={120}
              placeholder="Brief summary"
              className="mt-1 w-full"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Message</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              maxLength={3000}
              placeholder="Type your message to the user…"
              className="mt-1 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>
        <div className="flex gap-2 border-t border-border p-4">
          <button type="button" onClick={onCancel} className="flex-1 rounded-lg border border-border py-2.5 text-sm font-semibold hover:bg-muted">
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {busy ? "Creating…" : "Create & Send"}
          </button>
        </div>
      </form>
    </div>
  );
}