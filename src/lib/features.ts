/**
 * The paid add-on catalogue. Prices are monthly, in rand, and are the single
 * place to change them — a request copies the price onto its row, so changing
 * one here never rewrites what an existing client was quoted.
 *
 * Billing happens outside the app: Wayne invoices (via Rebill) and switches
 * the feature on once it is paid.
 */

export type FeatureKey =
  | "usage_insights"
  | "email_reports"
  | "direct_chat"
  | "cost_tariffs"
  | "history_export";

export type FeatureStatus = "requested" | "active" | "declined" | "cancelled";

export interface AddOn {
  key: FeatureKey;
  name: string;
  tagline: string;
  /** What the client actually gets, in their words. */
  bullets: string[];
  priceRand: number;
  /** Shipped and ready to switch on, vs still to be built. */
  available: boolean;
}

export const ADD_ONS: AddOn[] = [
  {
    key: "usage_insights",
    name: "Usage insights",
    tagline: "See how much you're using, and whether it's normal",
    bullets: [
      "Monthly electricity and water totals at a glance",
      "A dial showing this month against a usual month",
      "Six months of history, so you can spot a creep early",
    ],
    priceRand: 49,
    available: true,
  },
  {
    key: "email_reports",
    name: "Monthly report by email",
    tagline: "Your readings land in your inbox, no login needed",
    bullets: [
      "A PDF of the month's readings, sent automatically",
      "Goes to everyone on your contact list, not just one person",
      "Useful for trustee packs and AGM minutes",
    ],
    priceRand: 49,
    // Not built: nothing reads this key, and there is no scheduled send. Wayne
    // can already email a report by hand from Admin -> Reports, but switching
    // this on would put nothing new on the client's dashboard, so it must not
    // present itself as ready to buy.
    available: false,
  },
  {
    key: "direct_chat",
    name: "Direct chat with Wayne",
    tagline: "Ask about a reading without picking up the phone",
    bullets: [
      "Message Wayne from inside the app",
      "Queries stay attached to the reading they're about",
      "Replies within one working day",
    ],
    priceRand: 49,
    available: false,
  },
  {
    key: "cost_tariffs",
    name: "Cost & tariffs",
    tagline: "Usage converted into rands at your municipal tariff",
    bullets: [
      "Your tariff applied to every unit's usage",
      "Monthly cost per unit, ready to recover",
      "Tariff increases applied from the date they take effect",
    ],
    priceRand: 49,
    available: false,
  },
  {
    key: "history_export",
    name: "Past readings",
    tagline: "Look back further than this month",
    bullets: [
      "Filter by last 3 months, 6 months, or everything",
      "Compare a unit against the same month last year",
      "Download any period as a PDF, not just the current one",
    ],
    priceRand: 49,
    available: true,
  },
];

/**
 * Without the past-readings add-on a client sees the latest month only.
 * Everything older is still theirs — it just isn't on the dashboard until
 * they take the add-on.
 */
export const HISTORY_FEATURE: FeatureKey = "history_export";

export const ADD_ON_BY_KEY: Record<string, AddOn> = Object.fromEntries(
  ADD_ONS.map((a) => [a.key, a])
);

export function isFeatureKey(value: string): value is FeatureKey {
  return value in ADD_ON_BY_KEY;
}

export function formatRand(rand: number): string {
  return `R${rand.toLocaleString("en-US")}`;
}
