import React, { useRef, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Download, X, Loader2, CheckCircle2, XCircle } from "lucide-react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { getChain } from "@/lib/chains";

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function fmtDay(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
}
function fmtTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}
// Perforated tear divider: a dashed line with two semi-circular cutouts punched
// into the card's left and right borders, giving the receipt a ticket-stub look.
function TearDivider() {
  return (
    <div className="relative -mx-5 my-4 h-px">
      <div className="absolute inset-x-6 top-0 border-t border-dashed border-[#1A2B3C]/25" />
      <div className="absolute -left-3 -top-3 h-6 w-6 rounded-full bg-white border border-[#1A2B3C]/15" />
      <div className="absolute -right-3 -top-3 h-6 w-6 rounded-full bg-white border border-[#1A2B3C]/15" />
    </div>
  );
}
function shortTx(h) {
  return h ? `${h.slice(0, 10)}…${h.slice(-8)}` : "N/A";
}

// Compact on-screen withdrawal receipt branded "Rotary Inc" — narrow like a
// paper till receipt, with sharp (un-rounded) top and bottom edges and a
// perforated tear line. Shown after every withdrawal attempt (success or
// failure). "Download" captures the card to a PDF; the X / Done buttons close.
export default function WithdrawalReceipt({ open, receipt, onClose }) {
  const cardRef = useRef(null);
  const [downloading, setDownloading] = useState(false);

  if (!receipt) return null;

  const success = receipt.status === "success";
  const chain = getChain(receipt.chain);

  const downloadPdf = async () => {
    if (!cardRef.current) return;
    setDownloading(true);
    try {
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
        logging: false,
      });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "pt", "a4");
      const pageW = pdf.internal.pageSize.getWidth();
      const imgW = pageW - 60;
      const imgH = (canvas.height * imgW) / canvas.width;
      pdf.addImage(imgData, "PNG", 30, 40, imgW, imgH);
      pdf.save(`Rotary-Inc-Receipt-${(receipt.paymentOrderId || "withdrawal").slice(0, 8)}.pdf`);
    } catch (e) {
      try {
        const pdf = new jsPDF("p", "pt", "a4");
        pdf.setFillColor(255, 255, 255);
        pdf.rect(0, 0, pdf.internal.pageSize.getWidth(), pdf.internal.pageSize.getHeight(), "F");
        pdf.setTextColor(20, 20, 20);
        pdf.setFontSize(18);
        pdf.text("Receipt from Rotary Inc", 40, 60);
        pdf.setFontSize(10);
        pdf.setTextColor(120, 120, 120);
        pdf.text(fmtDate(receipt.date), 40, 78);
        pdf.setTextColor(success ? 16 : 200, success ? 120 : 30, success ? 60 : 30);
        pdf.text(success ? "Successful" : "Failed", 40, 96);
        pdf.setTextColor(20, 20, 20);
        pdf.setFontSize(14);
        pdf.text(`Amount: ${receipt.amount || 0} ${receipt.token}`, 40, 130);
        pdf.setFontSize(10);
        pdf.setTextColor(120, 120, 120);
        pdf.text(`Order ID: ${receipt.paymentOrderId || "—"}`, 40, 150);
        pdf.text(`Transaction: ${shortTx(receipt.txHash)}`, 40, 165);
        pdf.text(`Method: ${receipt.token} on ${chain?.name || receipt.chain}`, 40, 180);
        pdf.text(`Destination: ${receipt.toAddress ? `${receipt.toAddress.slice(0, 10)}…${receipt.toAddress.slice(-8)}` : "—"}`, 40, 195);
        if (receipt.error) { pdf.setTextColor(220, 50, 50); pdf.text(`Reason: ${receipt.error}`, 40, 210); }
        pdf.save(`Rotary-Inc-Receipt-${(receipt.paymentOrderId || "withdrawal").slice(0, 8)}.pdf`);
      } catch (_) {}
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-[330px] gap-0 overflow-hidden border border-[#1A2B3C]/15 bg-white p-0 text-neutral-800 shadow-2xl rounded-[18px] sm:rounded-[18px] [&>button]:hidden">
        {/* Exit */}
        <button onClick={onClose} className="absolute right-2 top-2 z-10 rounded-full p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700">
          <X className="h-3.5 w-3.5" />
        </button>

        {/* Receipt body — captured for PDF */}
        <div ref={cardRef} className="rounded-[18px] bg-white p-5">
          {/* ===== Header ===== */}
          <div className="flex items-start justify-between gap-3">
            <p className="text-lg font-bold leading-tight text-[#2B2B33]">
              {receipt.toAddress ? `${receipt.toAddress.slice(0, 8)}…${receipt.toAddress.slice(-4)}` : (receipt.paymentOrderId ? receipt.paymentOrderId.slice(0, 14) : "—")}
            </p>
            <span className="inline-flex items-center gap-1 text-[12px] font-bold" style={{ color: success ? "#38A169" : "#E53E3E" }}>
              {success ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
              {success ? "Completed" : "Failed"}
            </span>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
            <div>
              <p className="text-[#A0A0A0]">Transaction ID</p>
              <p className="break-all font-semibold text-[#2B2B33]">{shortTx(receipt.txHash)}</p>
            </div>
            <div className="text-right">
              <p className="text-[#A0A0A0]">Reference</p>
              <p className="break-all font-semibold text-[#2B2B33]">{receipt.paymentOrderId || "—"}</p>
            </div>
          </div>

          <TearDivider />

          {/* ===== Middle: two-column data grid ===== */}
          <div className="grid grid-cols-2 gap-x-5 gap-y-3">
            <div className="space-y-3">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-[#A0A0A0]">Amount</p>
                <p className="text-[13px] font-bold text-[#2B2B33]">{Number(receipt.amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {receipt.token}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-[#A0A0A0]">Network</p>
                <p className="text-[13px] font-bold text-[#2B2B33]">{chain?.name || receipt.chain}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-[#A0A0A0]">Total Amount</p>
                <p className="text-[13px] font-bold text-[#2B2B33]">{Number(receipt.amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {receipt.token}</p>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-[#A0A0A0]">Other Party</p>
                <p className="break-all text-[13px] font-bold text-[#38A169]">{receipt.toAddress ? `${receipt.toAddress.slice(0, 8)}…${receipt.toAddress.slice(-6)}` : "—"}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-[#A0A0A0]">Transaction Date</p>
                <p className="text-[13px] font-bold text-[#2B2B33]">{fmtDay(receipt.date)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-[#A0A0A0]">Transaction Time</p>
                <p className="text-[13px] font-bold text-[#2B2B33]">{fmtTime(receipt.date)}</p>
              </div>
            </div>
          </div>

          {receipt.error && (
            <div className="mt-3 rounded-lg bg-red-50 px-2.5 py-1.5 text-[11px] text-red-600">
              <span className="font-semibold">Reason:</span> {receipt.error}
            </div>
          )}

          <TearDivider />

          {/* ===== Bottom: QR code for the transaction id ===== */}
          <div className="flex flex-col items-center">
            <div className="relative">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&margin=0&ecc=H&data=${encodeURIComponent(receipt.txHash || receipt.paymentOrderId || "charipot-receipt")}`}
                alt="Transaction QR"
                className="h-28 w-28"
              />
              <div className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-[3px] bg-red-600" />
            </div>
            <p className="mt-2 text-[12px] font-bold text-[#2B2B33]">Scan for Receipt</p>
          </div>
        </div>

        {/* Actions (kept outside the captured card) */}
        <div className="flex gap-2 bg-white px-5 pb-4 pt-1">
          <button
            onClick={onClose}
            className="flex-1 rounded-full border border-neutral-200 py-2 text-xs font-semibold text-neutral-600 transition-colors hover:bg-neutral-50"
          >
            Done
          </button>
          <button
            onClick={downloadPdf}
            disabled={downloading}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-neutral-900 py-2 text-xs font-bold text-white transition-transform hover:scale-[1.02] disabled:opacity-70"
          >
            {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Download
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}