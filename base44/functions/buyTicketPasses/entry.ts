import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { computeAmountShares } from '../../shared/walletAllocations.ts';
import { emailCard, rowsHtml, noteHtml, emailPlainText } from '../../shared/emailTemplate.ts';

// Ticket Pass marketplace. A user prepays USDT for a bundle of discounted
// "passes"; each pass is worth half the normal ticket price and redeems one
// free ticket play later (see redeemPasses). The prepaid amount is divided
// across the configured revenue allocations (charity / prize / platform /
// agent referral) EXACTLY like a normal ticket purchase — the charity, prize
// pool and jackpot are credited to the current active draw (which rolls over
// until won, so the funds reach whichever draw eventually pays out). The
// agent referral (2%) goes to the house agent wallet. The on-chain USDT is
// transferred to the treasury via payToTreasury (reuse), which also records the
// PASS_PURCHASE crypto transaction.
const HOUSE_AGENT_EMAIL = 'kemboi5870@gmail.com';
const HOUSE_CODE = 'ROTARY-DEN-33';
const fmtUSD = (n: number) => '$' + (Number(n) || 0).toFixed(2);

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const svc = base44.asServiceRole;

    const body = await req.json().catch(() => ({}));
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return Response.json({ error: 'Invalid amount' }, { status: 400 });
    }

    // Economic parameters.
    const params = await svc.entities.ConfigParameter.list('-key', 100);
    const cfg: Record<string, number> = {};
    params.forEach((p) => { cfg[p.key] = Number(p.value); });
    const get = (k: string, d: number) => (cfg[k] ?? d);
    const price = get('ticket_price', 0.1);
    const target = get('draw_target', 5);

    // Resolve the pass package (admin-managed via PassPackage entity). Falls
    // back to the legacy hardcoded tiers for callers that send amount + off
    // only (no packageId).
    let discount: number;
    let pkgPassPrice: number | null = null;
    let validityDays = 0;
    let packageLabel = `${discount ?? 50}% off bundle`;
    let packageId: string | null = null;
    const pkgId = body.packageId ? String(body.packageId) : null;
    if (pkgId) {
      const pkg = await svc.entities.PassPackage.get(pkgId).catch(() => null);
      if (!pkg) return Response.json({ error: 'Package not found' }, { status: 400 });
      if (pkg.active === false) return Response.json({ error: 'This pass package is no longer available' }, { status: 400 });
      discount = Number(pkg.discount) || 0;
      pkgPassPrice = Number(pkg.passPrice) > 0 ? Number(pkg.passPrice) : null;
      validityDays = Number(pkg.validityDays) || 0;
      packageLabel = pkg.label || `${discount}% off bundle`;
      packageId = pkg.id;
    } else {
      const off = Number(body.off);
      discount = [10, 20, 30, 40, 50].includes(off) ? off : 50;
      packageLabel = `${discount}% off bundle`;
    }
    const derivedPrice = +(price * (1 - discount / 100)).toFixed(4);
    const passPrice = pkgPassPrice != null ? +pkgPassPrice.toFixed(4) : derivedPrice;
    const passes = Math.max(1, Math.round(amount / passPrice));
    const realAmount = +(passes * passPrice).toFixed(2);

    // Wallet + eligibility.
    const wallets = await svc.entities.Wallet.filter({ userId: user.id });
    const wallet = wallets[0];
    if (!wallet || !wallet.walletAddress) {
      return Response.json({ error: 'No wallet', needsWallet: true }, { status: 400 });
    }
    if (user.isBlacklisted || wallet.isBlacklisted) {
      return Response.json({ error: 'blacklisted', message: 'Account restricted' }, { status: 403 });
    }

    // Pick the chain/token with enough balance to cover the charge.
    const balRes = await base44.functions.invoke('getWalletBalances', {});
    const bd: any = balRes.data;
    if (bd?.needsWallet) return Response.json({ error: 'No wallet', needsWallet: true }, { status: 400 });
    if (bd?.error) return Response.json({ error: bd.error });
    const chains: any[] = bd?.chains || [];
    let chosen: { chain: string; token: string } | null = null;
    for (const c of chains) {
      if (Number(c.balances?.USDC) >= realAmount) { chosen = { chain: c.chain, token: 'USDC' }; break; }
      if (Number(c.balances?.USDT) >= realAmount) { chosen = { chain: c.chain, token: 'USDT' }; break; }
    }
    if (!chosen) {
      const best = chains.reduce((m, c) => Math.max(m, Number(c.balances?.USDC) || 0, Number(c.balances?.USDT) || 0), 0);
      return Response.json({ error: 'insufficient', balance: best, needed: realAmount });
    }

    // Charge on-chain to treasury (records the PASS_PURCHASE tx).
    const payRes = await base44.functions.invoke('payToTreasury', {
      amount: realAmount, chain: chosen.chain, token: chosen.token,
      purpose: 'PASS_PURCHASE', reference: 'ticket_pass',
    });
    const pd: any = payRes.data;
    if (!pd?.success) {
      if (pd?.error === 'insufficient_gas') {
        return Response.json({ error: 'insufficient_gas', chain: pd.chain || chosen.chain, native: pd.native });
      }
      if (pd?.error === 'blacklisted') {
        return Response.json({ error: 'blacklisted', message: pd.message }, { status: 403 });
      }
      return Response.json({ error: pd?.error || 'Payment failed' });
    }

    // Fixed platform split on the charged amount (identical to ticket sales).
    const shares = computeAmountShares(realAmount, cfg);
    const charity = shares.charity;
    const prize = shares.prize;
    const agentRef = shares.agent_fee;
    const jackpotAdd = shares.jackpot_5;
    const buffer = shares.buffer;
    const poolAdd = shares.pool;

    // Passes are prepaid free plays — they do NOT credit the draw jackpot,
    // prize pools, charity, reserve, or the public platform wallet ledgers.
    // Only real paid ticket purchases fund those. The on-chain charge moves
    // the pass payment to the collector (operational revenue); the pass holder
    // still gets to win the existing jackpot funded by paid tickets.
    const draws = await svc.entities.Draw.list('-drawNumber', 10);
    const currentDraw = draws.find((d) =>
      ['BUILDING', 'MINIMUM_REACHED', 'TARGET_REACHED'].includes(d.status)
    ) || null;

    // 2% agent referral → house agent wallet (no referral code on pass buys).
    const houseUser = (await svc.entities.User.filter({ email: HOUSE_AGENT_EMAIL }))[0];
    if (houseUser) {
      const houseWallet = (await svc.entities.Wallet.filter({ userId: houseUser.id }))[0];
      if (houseWallet && agentRef > 0) {
        await svc.entities.Wallet.update(houseWallet.id, {
          totalReferralEarnings: +((houseWallet.totalReferralEarnings || 0) + agentRef).toFixed(2),
        });
        await svc.entities.AgentBonusRecord.create({
          agentCode: HOUSE_CODE, agentName: 'House Agent',
          type: 'REFERRAL', amount: agentRef, status: 'SETTLED',
          createdAt: new Date().toISOString(),
        });
      }
    }

    // Credit the passes to the user's wallet (atomic increment).
    await svc.entities.Wallet.updateMany(
      { id: wallet.id },
      { $inc: { passBalance: passes, passPurchased: passes } }
    );

    // Record the package purchase for expiry tracking + reminder emails.
    // validityDays = 0 means the passes never expire (no expiry date).
    const purchasedAt = new Date().toISOString();
    let expiresAt: string | null = null;
    if (validityDays > 0) {
      const exp = new Date(Date.now() + validityDays * 24 * 3600 * 1000);
      expiresAt = exp.toISOString();
    }
    const purchase = await svc.entities.PassPurchase.create({
      userId: user.id,
      fullName: user.full_name || user.email,
      userEmail: user.email,
      packageId: packageId || '',
      packageLabel,
      quantity: passes,
      passPrice,
      amountPaid: realAmount,
      discount,
      validityDays,
      purchasedAt,
      expiresAt,
      remaining: passes,
      burnedQty: 0,
      status: 'active',
      reminderSent: false,
      paidChain: chosen.chain,
      paidToken: chosen.token,
      paidTxHash: pd.txHash || '',
    });

    // Purchase confirmation email with expiry + quantity details.
    try {
      const expLine = expiresAt
        ? `Expires on: ${new Date(expiresAt).toLocaleString()} (unused passes are burned at expiry)`
        : 'Expiry: no expiry — passes never burn';
      const passRows = [
        { label: 'Package', value: packageLabel, strong: true },
        { label: 'Quantity', value: `${passes} passes` },
        { label: 'Price per pass', value: fmtUSD(passPrice) },
        { label: 'Amount paid', value: `${fmtUSD(realAmount)} · ${chosen.token} on ${chosen.chain}`, strong: true },
        { label: 'Expiry', value: expiresAt ? new Date(expiresAt).toLocaleString() : 'No expiry — passes never burn' },
        { label: 'Transaction', value: pd.txHash ? `${pd.txHash.slice(0, 14)}…${pd.txHash.slice(-8)}` : '—' },
      ];
      const passHtml = emailCard({
        title: 'Ticket Passes Purchased',
        subtitle: packageLabel,
        greeting: `Hi ${user.full_name || 'there'}, your pass bundle is ready to use.`,
        innerHtml: rowsHtml(passRows) + noteHtml('Head to the Play page to redeem your passes — each pass equals one free ticket play.'),
      });
      const passText = emailPlainText({
        greeting: `Hi ${user.full_name || ''},`,
        lines: [
          `You purchased ${passes} ticket passes for ${fmtUSD(realAmount)} (${chosen.token} on ${chosen.chain}).`,
          `Package: ${packageLabel}`,
          `Quantity: ${passes} passes`,
          `Price per pass: ${fmtUSD(passPrice)}`,
          `Amount paid: ${fmtUSD(realAmount)}`,
          expLine,
          `Transaction: ${pd.txHash || '—'}`,
        ],
      });
      await svc.integrations.Core.SendEmail({
        to: user.email,
        subject: `Ticket passes purchased — ${packageLabel}`,
        html: passHtml,
        text: passText,
      });
    } catch (_) { /* non-critical */ }

    return Response.json({
      success: true, passes, passPrice, amount: realAmount,
      drawNumber: currentDraw?.drawNumber ?? null,
      purchaseId: purchase.id,
      expiresAt,
      split: { charity, prize, platform: shares.treasury, agentRef },
      paidWith: { chain: chosen.chain, token: chosen.token, txHash: pd.txHash },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}