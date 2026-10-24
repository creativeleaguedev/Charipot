// Shared styling + helpers for the Support UI (used by Support.jsx and SupportInboxPanel.jsx)

export const PRIORITIES = [
  { key: "low", label: "Low" },
  { key: "normal", label: "Normal" },
  { key: "high", label: "High" },
];

export const PRIORITY_STYLE = {
  low: "bg-slate-100 text-slate-600",
  normal: "bg-blue-100 text-blue-700",
  high: "bg-red-100 text-red-700",
};

export const PRIORITY_DOT = {
  low: "bg-slate-400",
  normal: "bg-blue-500",
  high: "bg-red-500",
};

// Color-coded category chips so the inbox is scannable at a glance.
export const CATEGORY_STYLE = {
  General: "bg-slate-100 text-slate-700",
  "Account & Profile": "bg-violet-100 text-violet-700",
  "Payments & Wallet": "bg-emerald-100 text-emerald-700",
  "Tickets & Draws": "bg-amber-100 text-amber-700",
  "GOV Marketplace": "bg-sky-100 text-sky-700",
  "Governance & Projects": "bg-indigo-100 text-indigo-700",
  "Technical Issue": "bg-red-100 text-red-700",
  Other: "bg-muted text-muted-foreground",
};

export function categoryClass(category) {
  return CATEGORY_STYLE[category] || CATEGORY_STYLE.Other;
}

export function priorityLabel(priority) {
  return PRIORITIES.find((p) => p.key === priority)?.label || "Normal";
}

// Other side's "last read" timestamp, used to mark my messages as seen.
export function otherSideReadAt(ticket, isAdmin) {
  return isAdmin ? ticket.lastReadAtUser : ticket.lastReadAtAdmin;
}

// My side's "last read" timestamp, used for the new-message divider.
export function mySideReadAt(ticket, isAdmin) {
  return isAdmin ? ticket.lastReadAtAdmin : ticket.lastReadAtUser;
}

// My typing flag field, set while I'm composing.
export function myTypingField(isAdmin) {
  return isAdmin ? "adminTyping" : "userTyping";
}

// The other side's typing flag, shown to me as "X is typing…".
export function otherTyping(ticket, isAdmin) {
  return isAdmin ? ticket.userTyping : ticket.adminTyping;
}

// Initials for an avatar chip, ignoring parentheticals/punctuation.
export function initialsOf(name) {
  if (!name) return "?";
  const clean = String(name).replace(/\([^)]*\)/g, "").replace(/[^\p{L}\p{N}\s]/gu, " ").trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}