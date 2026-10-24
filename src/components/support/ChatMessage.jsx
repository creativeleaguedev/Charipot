import React from "react";
import { cn } from "@/lib/utils";
import { Check, CheckCheck } from "lucide-react";
import { AttachmentGallery } from "@/components/support/AttachmentUpload";

const SUPPORT_LOGO_URL = "https://media.base44.com/images/public/6a9fd1112d3233a0a31bca58/978434dde_generated_image.png";

function initials(name) {
  if (!name) return "?";
  const clean = String(name).replace(/\([^)]*\)/g, "").replace(/[^\p{L}\p{N}\s]/gu, " ").trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function timeLabel(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/**
 * A single chat bubble with an avatar, sender name, and tail.
 * `mine` controls alignment and bubble style; `viewerIsAdmin` labels the support side.
 */
export default function ChatMessage({ message, mine, viewerIsAdmin, seen }) {
  const m = message;
  const isSupport = m.authorRole === "admin";

  const Avatar = () =>
    isSupport ? (
      <img
        src={SUPPORT_LOGO_URL}
        alt="Support"
        className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-border"
      />
    ) : (
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy-gradient font-semibold text-white ring-1 ring-border">
        <span className="text-[11px]">{initials(m.authorName)}</span>
      </div>
    );

  const senderName = mine
    ? viewerIsAdmin
      ? "You · Support"
      : "You"
    : isSupport
      ? "Support Team"
      : m.authorName || "User";

  return (
    <div className={cn("flex w-full items-end gap-2.5", mine ? "flex-row-reverse" : "flex-row")}>
      <Avatar />

      <div className={cn("flex min-w-0 max-w-[78%] flex-col", mine ? "items-end" : "items-start")}>
        <div
          className={cn(
            "relative rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
            mine
              ? "rounded-br-sm bg-navy-gradient text-white shadow-md shadow-primary/20"
              : "rounded-bl-sm bg-card text-foreground ring-1 ring-border shadow-sm"
          )}
        >
          {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
          <AttachmentGallery value={m.attachments} />
        </div>
        <div className="mt-1 flex items-center gap-1.5 px-1 text-[10px] text-muted-foreground">
          <span>{senderName} · {timeLabel(m.createdAt)}</span>
          {mine && (
            <span className={cn("ml-0.5", seen ? "text-sky-500" : "text-muted-foreground")}>
              {seen ? <CheckCheck className="h-3 w-3" /> : <Check className="h-3 w-3" />}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}