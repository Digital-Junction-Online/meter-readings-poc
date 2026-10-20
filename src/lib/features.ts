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
    priceRand: 79,
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
    available: true,
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
    priceRand: 99,
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
    priceRand: 149,
    available: false,
  },
  {
    key: "history_export",
    name: "Full history & exports",
    tagline: "Every reading ever taken, downloadable",
    bullets: [
      "History beyond the last twelve months",
      "Download as a spreadsheet for your accountant",
      "Meter photos included in the export",
    ],
    priceRand: 39,
    available: false,
  },
];

export const ADD_ON_BY_KEY: Record<string, AddOn> = Object.fromEntries(
  ADD_ONS.map((a) => [a.key, a])
);

export function isFeatureKey(value: string): value is FeatureKey {
  return value in ADD_ON_BY_KEY;
}

export function formatRand(rand: number): string {
  return `R${rand.toLocaleString("en-US")}`;
}
