import React from "react";
import { Paperclip, Image as ImageIcon, FileText, Smile, Send, Loader2, X } from "lucide-react";
import AttachmentUpload, { parseAttachments, serializeAttachments } from "@/components/support/AttachmentUpload";
import { Image } from "@/components/ui/image";
import { cn } from "@/lib/utils";

function formatSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Chat reply composer styled after the reference mockup:
 * attachment previews above, a toolbar row (file / photo / document triggers,
 * a growing textarea, an emoji button, and a round send button), and a
 * "Press Enter to send • Shift + Enter for new line" hint below.
 *
 * Pure UI — it owns no data; all state is passed in (body, attachments,
 * sending) and reported back up via callbacks, so the conversation logic in
 * Support.jsx stays unchanged.
 */
export default function MessageComposer({
  body,
  setBody,
  attachments,
  setAttachments,
  onSend,
  sending,
  disabled,
  onTypingChange,
  onFocus,
  onBlur,
}) {
  const list = parseAttachments(attachments);
  const canSend = !sending && !disabled && (!!body.trim() || list.length > 0);

  const remove = (idx) => setAttachments(serializeAttachments(list.filter((_, i) => i !== idx)));

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (canSend) onSend(e);
    }
  };

  const ICON_BTN = "text-[#4B5563] hover:bg-[#F3F4F6] hover:text-[#374151]";

  return (
    <div className="rounded-2xl border border-[#E5E7EB] bg-white p-3 shadow-sm">
      {/* Attachment preview area (above the input) */}
      {list.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {list.map((a, i) => (
            <div key={i} className="flex items-center gap-2 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] py-1.5 pl-1.5 pr-2">
              {a.kind === "image" ? (
                <Image src={a.url} alt={a.name} fittingType="fill" className="h-9 w-9 shrink-0 rounded-lg object-cover" />
              ) : (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#EFF6FF] text-[#2563EB]">
                  <FileText className="h-4 w-4" />
                </div>
              )}
              <div className="flex min-w-0 flex-col">
                <span className="max-w-[150px] truncate text-xs font-medium text-[#1F2937]">{a.name}</span>
                <span className="text-[10px] text-[#9CA3AF]">{formatSize(a.size)}</span>
              </div>
              <button
                type="button"
                onClick={() => remove(i)}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[#9CA3AF] transition-colors hover:bg-[#F3F4F6] hover:text-[#4B5563]"
                title="Remove attachment"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Toolbar + input + send row */}
      <form onSubmit={onSend} className="flex items-end gap-1.5">
        <AttachmentUpload value={attachments} onChange={setAttachments} triggerOnly icon={Paperclip} title="Attach file" buttonClassName={ICON_BTN} />
        <AttachmentUpload value={attachments} onChange={setAttachments} triggerOnly icon={ImageIcon} accept="image/*" title="Attach photo" buttonClassName={ICON_BTN} />
        <AttachmentUpload value={attachments} onChange={setAttachments} triggerOnly icon={FileText} accept=".pdf,.doc,.docx,.txt,.csv,.xlsx,.xls" title="Attach document" buttonClassName={ICON_BTN} />
        <textarea
          value={body}
          onChange={(e) => { setBody(e.target.value); onTypingChange?.(true); }}
          onFocus={onFocus}
          onBlur={onBlur}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder="Type your message..."
          className="max-h-32 min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-sm text-[#1F2937] outline-none placeholder:text-[#9CA3AF]"
        />
        <button
          type="button"
          onClick={() => setBody((b) => b + "😊")}
          className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors", ICON_BTN)}
          title="Add emoji"
        >
          <Smile className="h-5 w-5" />
        </button>
        <button
          type="submit"
          disabled={!canSend}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#2563EB] text-white transition-colors hover:bg-[#1D4ED8] disabled:opacity-50"
          title="Send message"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </form>

    </div>
  );
}