import React, { useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Image } from "@/components/ui/image";
import { Paperclip, Plus, X, Loader2, FileText, Download } from "lucide-react";
import { cn } from "@/lib/utils";

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const IMAGE_EXT = ["png", "jpg", "jpeg", "gif", "webp", "bmp"];

function kindOf(name) {
  const ext = (name.split(".").pop() || "").toLowerCase();
  return IMAGE_EXT.includes(ext) ? "image" : "file";
}

export function parseAttachments(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function serializeAttachments(arr) {
  return JSON.stringify(arr || []);
}

/** Standalone chip row with remove support. Used above the pill input. */
export function AttachmentChips({ value, onChange, disabled }) {
  const attachments = parseAttachments(value);
  if (attachments.length === 0) return null;
  const remove = (idx) => onChange(serializeAttachments(attachments.filter((_, i) => i !== idx)));
  return (
    <div className="flex flex-wrap gap-2">
      {attachments.map((a, i) => (
        <div key={i} className="group relative overflow-hidden rounded-lg border border-border bg-card">
          {a.kind === "image" ? (
            <a href={a.url} target="_blank" rel="noreferrer" className="block">
              <Image src={a.url} alt={a.name} fittingType="fill" className="h-16 w-16 object-cover" />
            </a>
          ) : (
            <a href={a.url} target="_blank" rel="noreferrer" className="flex h-16 w-44 items-center gap-2 px-2 hover:bg-muted">
              <FileText className="h-5 w-5 shrink-0 text-primary" />
              <span className="min-w-0 flex-1 truncate text-[11px] font-medium">{a.name}</span>
              <Download className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </a>
          )}
          {!disabled && (
            <button
              type="button"
              onClick={() => remove(i)}
              className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white opacity-0 transition group-hover:opacity-100"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export default function AttachmentUpload({ value, onChange, disabled, compact, triggerOnly, icon, accept, title, buttonClassName }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const attachments = parseAttachments(value);

  const handleFiles = async (files) => {
    setError("");
    const next = [...attachments];
    for (const file of Array.from(files)) {
      if (file.size > MAX_SIZE) {
        setError(`${file.name} exceeds 10 MB`);
        continue;
      }
      setUploading(true);
      try {
        const res = await base44.integrations.Core.UploadPublicFile({ file });
        next.push({ name: file.name, url: res.file_url, kind: kindOf(file.name), size: file.size });
      } catch (e) {
        setError(`Failed to upload ${file.name}`);
      } finally {
        setUploading(false);
      }
    }
    onChange(serializeAttachments(next));
    if (inputRef.current) inputRef.current.value = "";
  };

  // Pill input mode: a compact toolbar icon button that opens the file picker.
  // `icon` picks the lucide glyph (Paperclip / Image / FileText…); `accept`
  // restricts the picker; `title` is the tooltip. Shared by the chat composer.
  if (triggerOnly) {
    const TriggerIcon = icon || Plus;
    return (
      <>
        <button
          type="button"
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50",
            buttonClassName,
          )}
          title={title || "Attach file"}
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <TriggerIcon className="h-5 w-5" />}
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={accept}
          className="hidden"
          onChange={(e) => e.target.files?.length && handleFiles(e.target.files)}
        />
      </>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-50",
            compact ? "" : "px-4 py-2 text-sm"
          )}
        >
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
          {uploading ? "Uploading…" : "Attach file"}
        </button>
        <span className="text-[11px] text-muted-foreground">Images & documents · max 10 MB each</span>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => e.target.files?.length && handleFiles(e.target.files)}
        />
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <AttachmentChips value={value} onChange={onChange} disabled={disabled} />
    </div>
  );
}

export function AttachmentGallery({ value }) {
  const attachments = parseAttachments(value);
  if (attachments.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {attachments.map((a, i) =>
        a.kind === "image" ? (
          <a key={i} href={a.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-border">
            <Image src={a.url} alt={a.name} fittingType="fill" className="h-24 w-24 object-cover" />
          </a>
        ) : (
          <a key={i} href={a.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs hover:bg-muted">
            <FileText className="h-4 w-4 shrink-0 text-primary" />
            <span className="max-w-[160px] truncate font-medium">{a.name}</span>
            <Download className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </a>
        )
      )}
    </div>
  );
}