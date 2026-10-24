import React from "react";
import { cn } from "@/lib/utils";
import { Plus, Trash2 } from "lucide-react";
import AttachmentUpload from "@/components/support/AttachmentUpload";

export const CATEGORIES = [
  "Water & Sanitation",
  "Education",
  "Healthcare",
  "Maternal & Child Health",
  "Food Security",
  "Environment",
  "Economic Empowerment",
  "Youth",
  "Community Infrastructure",
  "Disaster Relief",
  "Other",
];

export const FUNDING_MODELS = [
  { value: "full", label: "Full funding" },
  { value: "partial", label: "Partial funding" },
  { value: "milestone", label: "Milestone-based funding" },
  { value: "co-funded", label: "Co-funded project" },
];

export const NETWORKS = [
  { value: "bnb", label: "BNB Chain" },
  { value: "ethereum", label: "Ethereum" },
  { value: "polygon", label: "Polygon" },
];

export const TOKENS = ["USDC", "USDT"];

export function Field({ label, required, hint, children, className }) {
  return (
    <div className={cn("space-y-1", className)}>
      <label className="text-xs font-medium text-muted-foreground">
        {label}{required && <span className="text-destructive"> *</span>}
      </label>
      {children}
      {hint && <p className="text-[11px] leading-snug text-muted-foreground/80">{hint}</p>}
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary";

export function TextInput(props) {
  return <input {...props} className={cn(inputCls, props.className)} />;
}
export function TextArea(props) {
  return <textarea {...props} className={cn(inputCls, "resize-y", props.className)} />;
}
export function SelectInput({ options, ...props }) {
  return (
    <select {...props} className={cn(inputCls, props.className)}>
      {options.map((o) =>
        typeof o === "string" ? (
          <option key={o} value={o}>{o}</option>
        ) : (
          <option key={o.value} value={o.value}>{o.label}</option>
        )
      )}
    </select>
  );
}
export function NumberInput(props) {
  return <input type="number" {...props} className={cn(inputCls, props.className)} />;
}
export function DateInput(props) {
  return <input type="date" {...props} className={cn(inputCls, props.className)} />;
}

/** Repeatable list of object rows.
 *  template() -> empty row object
 *  render(row, update, i) -> row JSX; update(patch) merges into that row */
export function Repeatable({ items, onChange, template, render, addLabel, columns }) {
  const add = () => onChange([...items, template()]);
  const remove = (i) => onChange(items.filter((_, idx) => idx !== i));
  const update = (i, patch) => onChange(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  return (
    <div className="space-y-2">
      {items.map((row, i) => (
        <div key={i} className="relative rounded-xl border border-border bg-muted/20 p-3">
          <button
            type="button"
            onClick={() => remove(i)}
            className="absolute right-2 top-2 rounded-full p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            title="Remove row"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <div className={cn("grid gap-3 pr-7", columns || "grid-cols-1 sm:grid-cols-2")}>
            {render(row, (patch) => update(i, patch), i)}
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
      >
        <Plus className="h-3.5 w-3.5" /> {addLabel || "Add row"}
      </button>
    </div>
  );
}

/** File upload block. `value` is a serialized JSON string of attachments.
 *  AttachmentUpload already renders the attachment chips/preview itself,
 *  so we don't add a second AttachmentChips here (that would double them). */
export function FileUpload({ value, onChange }) {
  return <AttachmentUpload value={value} onChange={onChange} compact />;
}

export function SectionTitle({ children, desc }) {
  return (
    <div className="mb-1">
      <h3 className="text-sm font-bold text-foreground">{children}</h3>
      {desc && <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>}
    </div>
  );
}