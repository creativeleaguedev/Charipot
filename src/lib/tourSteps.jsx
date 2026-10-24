// Guided tour steps for new users (and the "stuck" refresher). Each step
// optionally navigates to a route, then highlights a CSS selector with a
// positioned tooltip + arrow. Steps that omit a selector render a centered
// modal. Selectors target real DOM, and the overlay scrolls any hidden
// section into view before spotlighting it. All copy is localized via `t`.
//
// The number of steps is fixed across languages, so TOUR_STEPS_COUNT is a
// constant the tour state machine uses without needing the translated array.
export const TOUR_STEPS_COUNT = 20;

export function getTourSteps(t) {
  return [
    {
      centered: true,
      title: t("tour.welcome_title"),
      body: t("tour.welcome_body"),
    },
    {
      route: "/home",
      selector: "aside nav",
      placement: "right",
      title: t("tour.nav_title"),
      body: t("tour.nav_body"),
    },
    {
      route: "/home",
      selector: '[data-tour="hero"]',
      placement: "bottom",
      title: t("tour.home_title"),
      body: t("tour.home_body"),
    },
    {
      route: "/home",
      selector: '[data-tour="quick-actions"]',
      placement: "bottom",
      title: t("tour.quick_title"),
      body: t("tour.quick_body"),
    },
    {
      route: "/home",
      selector: '[data-tour="how-it-works"]',
      placement: "top",
      title: t("tour.how_title"),
      body: t("tour.how_body"),
    },
    {
      route: "/home",
      selector: '[data-tour="proof-impact"]',
      placement: "bottom",
      title: t("tour.proof_title"),
      body: t("tour.proof_body"),
    },
    {
      route: "/home",
      selector: '[data-tour="wallets"]',
      placement: "top",
      title: t("tour.wallets_title"),
      body: t("tour.wallets_body"),
    },
    {
      route: "/home",
      selector: '[data-tour="featured"]',
      placement: "top",
      title: t("tour.featured_title"),
      body: t("tour.featured_body"),
    },
    {
      route: "/home",
      selector: '[data-tour="transparency"]',
      placement: "top",
      title: t("tour.transparency_title"),
      body: t("tour.transparency_body"),
    },
    {
      route: "/play",
      selector: "main",
      placement: "bottom",
      title: t("tour.play_title"),
      body: t("tour.play_body"),
    },
    {
      route: "/passes",
      selector: "main",
      placement: "bottom",
      title: t("tour.passes_title"),
      body: t("tour.passes_body"),
    },
    {
      route: "/dashboard",
      selector: "main",
      placement: "bottom",
      title: t("tour.dashboard_title"),
      body: t("tour.dashboard_body"),
    },
    {
      route: "/wallet",
      selector: "main",
      placement: "bottom",
      title: t("tour.wallet_title"),
      body: t("tour.wallet_body"),
    },
    {
      route: "/donate",
      selector: "main",
      placement: "bottom",
      title: t("tour.donate_title"),
      body: t("tour.donate_body"),
    },
    {
      route: "/projects",
      selector: "main",
      placement: "bottom",
      title: t("tour.projects_title"),
      body: t("tour.projects_body"),
    },
    {
      route: "/funding-rounds",
      selector: "main",
      placement: "bottom",
      title: t("tour.gov_title"),
      body: t("tour.gov_body"),
    },
    {
      route: "/marketplace",
      selector: "main",
      placement: "bottom",
      title: t("tour.market_title"),
      body: t("tour.market_body"),
    },
    {
      route: "/agent",
      selector: "main",
      placement: "bottom",
      title: t("tour.agent_title"),
      body: t("tour.agent_body"),
    },
    {
      route: "/support",
      selector: "main",
      placement: "bottom",
      title: t("tour.support_title"),
      body: t("tour.support_body"),
    },
    {
      centered: true,
      title: t("tour.done_title"),
      body: t("tour.done_body"),
    },
  ];
}