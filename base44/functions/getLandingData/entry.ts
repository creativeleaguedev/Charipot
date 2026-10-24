import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { readOnChainBalances } from '../../shared/walletCrypto.ts';

const CHARITY_FALLBACK = '0x52C2EBF9D6e589eB6a9F16b079Ee46f0AE83eC7f';

// Public landing-page data. Stat figures are driven by live, real data:
//  - Charity Funded   = live on-chain USDC+USDT balance of the charity wallet
//  - Beneficiaries    = sum of beneficiaries across approved/funded projects
//  - Draws Completed  = count of COMPLETED draws
//  - Active Orgs      = number of active (approved/funded) projects
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const role = base44.asServiceRole;

    // Latest / current draw (widen the window so the completed count stays
    // accurate as the number of draws grows over time).
    const draws = await role.entities.Draw.list("-drawNumber", 500);
    const currentDraw = draws[0] || null;
    const totalDrawsCompleted = draws.filter((d: any) => d.status === "COMPLETED").length;
    const totalTicketsSold = draws.reduce((s: number, d: any) => s + (d.ticketCount || 0), 0);

    // Charity funded = live on-chain balance of the charity wallet.
    let charityOnChainTotal = 0;
    try {
      const charityWallet = (await role.entities.PlatformWallet.filter({ key: 'charity' }))[0];
      const charityAddress = charityWallet?.address || CHARITY_FALLBACK;
      const chains = await readOnChainBalances(charityAddress);
      let usdc = 0, usdt = 0;
      for (const c of chains) {
        usdc += Number(c.balances?.USDC ?? 0);
        usdt += Number(c.balances?.USDT ?? 0);
      }
      charityOnChainTotal = +(usdc + usdt).toFixed(2);
    } catch (_) { /* fall back to 0 */ }

    // Projects
    const projects = await role.entities.Project.list("-updated_date", 500);
    const featuredStatuses = ["PUBLISHED", "VOTING", "SELECTED", "FUNDING_APPROVED", "FUNDING_IN_PROGRESS", "COMPLETED"];
    const featuredProjects = projects.filter((p: any) => featuredStatuses.includes(p.status)).slice(0, 6);
    // Beneficiaries are only counted from projects that have actually been
    // approved / funded — not from every submitted draft.
    const approvedStatuses = ["APPROVED", "PUBLISHED", "VOTING", "SELECTED", "FUNDING_APPROVED", "FUNDING_IN_PROGRESS", "COMPLETED"];
    const totalBeneficiaries = projects
      .filter((p: any) => approvedStatuses.includes(p.status) || (p.fundingDisbursed || 0) > 0 || (p.fundingAllocated || 0) > 0)
      .reduce((s: number, p: any) => s + (p.beneficiaries || 0), 0);
    const totalFundingAllocated = projects.reduce((s: number, p: any) => s + (p.fundingAllocated || 0), 0);
    // "Active charity organizations" = number of active (approved/funded)
    // projects, so it grows as new projects are approved rather than reading
    // a static club-registry count.
    const activeOrgsCount = projects.filter((p: any) => approvedStatuses.includes(p.status)).length;

    // Recent completed draws with winning numbers
    const recentWinners = draws.filter((d: any) => d.status === "COMPLETED" && d.winningNumbers).slice(0, 3);

    // Donations: aggregate confirmed on-chain DONATION transactions and split
    // them across the same revenue allocations as ticket sales.
    const donationTx = await role.entities.CryptoTransaction.filter({ type: "DONATION", status: "CONFIRMED" });
    const totalDonations = donationTx.reduce((s: number, t: any) => s + Number(t.amount || 0), 0);

    const configParams = await role.entities.ConfigParameter.list("-key", 100);
    const cfg: any = {};
    for (const p of configParams) cfg[p.key] = p.value;
    const revCharity = cfg.rev_charity ?? 50;
    const revPrize = cfg.rev_prize ?? 40;
    const revPlatform = cfg.rev_platform ?? 8;
    const reserveSplit = cfg.reserve_split ?? 10;
    const prize5 = cfg.prize_5 ?? 70;

    const donationsCharity = +((totalDonations * revCharity) / 100).toFixed(2);
    const donationsPrize = +((totalDonations * revPrize) / 100).toFixed(2);
    const donationsPlatform = +((totalDonations * revPlatform) / 100).toFixed(2);
    const donationsReserve = +((donationsPrize * reserveSplit) / 100).toFixed(2);
    const donationsJackpot = +(((donationsPrize - donationsReserve) * prize5) / 100).toFixed(2);

    return Response.json({
      currentDraw,
      totalCharityRaised: charityOnChainTotal,
      totalDrawsCompleted,
      totalTicketsSold,
      totalBeneficiaries,
      totalFundingAllocated,
      clubsCount: activeOrgsCount,
      featuredProjects,
      recentWinners,
      donations: {
        total: totalDonations,
        charity: donationsCharity,
        prize: donationsPrize,
        jackpot: donationsJackpot,
        reserve: donationsReserve,
        platform: donationsPlatform,
        count: donationTx.length,
      },
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}