import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Composes and emails a project-progress summary (what's built vs. what's
// waiting) to the requested recipient. Admin-only: only the app owner should
// trigger outbound status emails.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const to = body.to || user.email;
    if (!to) return Response.json({ error: 'No recipient' }, { status: 400 });

    const subject = 'Charity Program — Project Progress Update';

    // Image-description cards: emoji "image" + alt-style description per feature.
    const showcases = [
      { emoji: '🎟️', title: 'Play Lottery (5/39)',
        desc: 'Navy hero banner showing the live jackpot and ticket-progress bar, a 39-number picker grid with gold Quick-Pick balls, an order summary with charity/prize/fee breakdown, and a chain/token selector paying USDC/USDT on BNB/Ethereum/Polygon.' },
      { emoji: '🏛️', title: 'Public Landing Page',
        desc: 'Gold-gradient charity wheel badge in the header, a hero with live jackpot progress, impact-metric tiles (charity raised, projects funded, beneficiaries), and a featured-project showcase with recent winning numbers.' },
      { emoji: '📊', title: 'My Dashboard',
        desc: 'Clean stat cards — GOV balance, prize balance, tickets this draw — with tabs for active tickets, GOV history, and prize claims, all in charity navy and gold.' },
      { emoji: '🔄', title: 'GOV Marketplace',
        desc: 'Open listings table (amount, price per GOV, total) with a "Create listing" form and buy/cancel actions; deflationary token market view.' },
      { emoji: '🗳️', title: 'Governance & Voting',
        desc: 'Active governance round banner with charity fund available, eligible project cards with a GOV-commit slider, and a burn-to-vote confirmation that reduces spendable GOV.' },
      { emoji: '🌍', title: 'Impact Projects',
        desc: 'Project cards by category (Education, Healthcare, Water, etc.) showing requested funding, beneficiaries, status badges, and submit/vet/fund flows for officers and admins.' },
      { emoji: '💼', title: 'Crypto Wallet',
        desc: 'Platform-managed EVM address with QR code, a 3-chain × 2-token balance grid using CoinGecko USDC/USDT and BNB/ETH/MATIC logos, a withdrawal form, and a transaction-history table.' },
      { emoji: '🤝', title: 'Sales Agent Portal',
        desc: 'Agent registration card, a copyable referral link, earnings summary (referral + winning bonus), and attributed-ticket history.' },
      { emoji: '🛡️', title: 'Admin Command Center',
        desc: 'Role-aware admin tabs — lottery draws, treasury, vetting queue, config governance — with audit-log entries and quick actions.' },
      { emoji: '⚙️', title: 'Config Registry & Audit',
        desc: 'Parameterized economic parameters (revenue/prize splits, ticket price, GOV ratio) with PCR change-proposal workflow, timelocks, and a full audit-log timeline.' },
    ];

    const built = [
      'Role-based app shell (Participant, Agent, Club Officer, Vetting/Treasury/Config/Lottery Admin, Auditor) with sidebar layout + ProtectedRoutes.',
      'Public Landing page with live jackpot, impact metrics, featured projects, recent winning numbers.',
      'Play Lottery page — 5/39 number picker, Quick Pick, order summary, crypto charge to treasury, GOV minting, auto-creates the next BUILDING draw (with jackpot rollover) when none is active.',
      'My Dashboard, GOV Marketplace (listings/buy), Governance & Voting (burn GOV to vote), Impact Projects (submit/vet/fund).',
      'Crypto Wallet — platform-managed EVM wallets on BNB/Ethereum/Polygon, USDC/USDT balances, QR deposits, withdrawals, transaction history.',
      'Sales Agent Portal — referral codes, per-ticket referral + Winning Agent Bonus tracking.',
      'Club & Project Panel, Admin Command Center, Config Registry (PCR workflow + timelocks), Audit Log.',
      'Backend functions: createWallet, getLandingData, getWalletBalances, payToTreasury, verifyDeposits, verifyTransactions, withdrawCrypto.',
      'Data model: User, Wallet, Ticket, Draw, ConfigParameter, Project, GovTransaction, GovListing, Vote, GovernanceRound, Milestone, CharityOrganization, AgentBonusRecord, AuditLog, Notification, PCR, CryptoTransaction.',
      'Solidity lottery contract (RotaryLotteryVRF.sol) written — 5/39 with Chainlink VRF v2, prize tiers 5/5, 4/5, 3/5, rollover logic.',
    ];

    const waiting = [
      'Deploy the RotaryLotteryVRF contract + fund a Chainlink VRF v2 subscription; wire on-chain draw execution to the off-chain Draw state.',
      'Fund platform wallets with native gas (BNB/ETH/MATIC) so withdrawals/transfers can execute on-chain.',
      'Connect a custom domain and switch the agent referral link off the base44.app domain onto it.',
      'Set up a payment provider — Stripe is available in your region (KE); Base44/Wix Payments is not.',
      'Implement the on-chain deflationary GOV token contract (mint 1:1 per ticket, burn on vote) — designed, not yet deployed.',
      'Build the lottery draw auto-trigger workflow (scheduled / threshold-based draw execution) so draws lock and settle without manual action.',
      'Authorize external connectors if any third-party integrations are needed (none connected yet).',
      'Productionize RPC keys / treasury wallet funding for live multi-chain transfers.',
    ];

    const li = (arr) => arr.map((x) => `<li style="margin:6px 0;line-height:1.5">${x}</li>`).join('');

    const html = `
      <div style="font-family:ui-sans-serif,system-ui,Arial,sans-serif;max-width:640px;margin:0 auto;color:#0f172a">
        <div style="background:linear-gradient(135deg,hsl(217 72% 20%),hsl(217 72% 28%));padding:24px;border-radius:12px 12px 0 0">
          <h1 style="color:#fff;margin:0;font-size:22px">Charity Program</h1>
          <p style="color:hsl(43 74% 60%);margin:4px 0 0;font-size:13px;letter-spacing:.08em;text-transform:uppercase">Project Progress Update</p>
        </div>
        <div style="border:1px solid #e2e8f0;border-top:0;border-radius:0 0 12px 12px;padding:24px">
          <p style="margin-top:0">Hi ${user.full_name || 'there'},</p>
          <p>Here is where the Charity Program stands today.</p>

          <h2 style="font-size:17px;color:hsl(217 72% 24%)">🖼️ Feature showcase (with image descriptions)</h2>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:12px 0 20px">
            ${showcases.map((s) => `
              <div style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;background:#f8fafc">
                <div style="background:linear-gradient(135deg,hsl(217 72% 20%),hsl(217 72% 30%));padding:16px;text-align:center">
                  <div style="font-size:30px">${s.emoji}</div>
                </div>
                <div style="padding:12px">
                  <p style="margin:0 0 6px;font-weight:700;color:hsl(217 72% 24%)">${s.title}</p>
                  <p style="margin:0;font-size:12px;line-height:1.5;color:#475569">${s.desc}</p>
                </div>
              </div>`).join('')}
          </div>

          <h2 style="font-size:17px;color:hsl(217 72% 24%)">✅ What's been built</h2>
          <ul style="padding-left:20px">${li(built)}</ul>

          <h2 style="font-size:17px;color:hsl(217 72% 24%)">⏳ What's waiting</h2>
          <ul style="padding-left:20px">${li(waiting)}</ul>

          <p style="margin-top:24px;font-size:13px;color:#64748b">Generated ${new Date().toUTCString()} from the Charity Program admin tools.</p>
        </div>
      </div>`;

    const text =
      `Charity Program — Project Progress Update\n\n` +
      `What's been built:\n` + built.map((x) => `- ${x}`).join('\n') +
      `\n\nWhat's waiting:\n` + waiting.map((x) => `- ${x}`).join('\n') +
      `\n\nGenerated ${new Date().toUTCString()}`;

    const res = await base44.asServiceRole.integrations.Core.SendEmail({
      to,
      subject,
      html,
      text,
      from_name: 'Charity Program',
    });

    return Response.json({ success: true, to, result: res });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}