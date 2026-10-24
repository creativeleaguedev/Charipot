// Admin Console access control — three roles only:
//   • "admin"          → Super Admin (full access to every tab). Pre-provisioned.
//   • "platform_admin" → Platform Admin (now also full access to every tab,
//                       including Users, Payouts, Security, Wallets). Note:
//                       the built-in User entity is platform-governed and only
//                       the "admin" role can list/manage other users — so
//                       platform_admin sees the Users tab but User records are
//                       still restricted server-side to "admin" by the platform.
//   • everyone else    → User (no admin access). A User may also be an Agent —
//                       that is a wallet flag (isAgent), not a separate role.
//
// To restrict access to a particular email, add it to ADMIN_EMAILS below.
export const ADMIN_EMAILS = [
  // e.g. "admin@rotaryimpact.org"
];

// Tabs each admin role may use in the Admin Command Center.
// "admin" (Super Admin) always gets every tab.
const ALL_TABS = ["users", "payouts", "security", "pcr", "vetting", "draws", "lottery", "funding_rounds", "disbursements", "treasury", "agent_tickets", "agent_payouts", "passes", "pass_purchases", "wallets", "audit", "support"];

export const ADMIN_SUBROLE_TABS = {
  platform_admin: ALL_TABS,
};

export function canAccessAdmin(user) {
  return getAllowedAdminTabs(user).length > 0;
}

// Returns the list of Admin Command Center tab keys this user may use.
export function getAllowedAdminTabs(user) {
  if (!user) return [];
  const email = (user.email || "").toLowerCase();
  if (user.role === "admin" || (email && ADMIN_EMAILS.map((e) => e.toLowerCase()).includes(email))) {
    return ALL_TABS;
  }
  return ADMIN_SUBROLE_TABS[user.role] || [];
}