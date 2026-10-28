import type * as React from "react";

// Pastel tints (owner, 28 Oct 2026: "a bit dull with black & white"). Each kind of figure keeps
// one soft colour wherever it appears, so it can be found at a glance:
//
//   mint      sales, profit
//   peach     cash, spending
//   sky       Paytm, online, payouts, loans
//   lavender  waiting for approval, requests
//   butter    stock, momos, production
//   rose      team, pay, leave, attendance
//
// Status colours (success / warning / danger) still win wherever something has a status.

export type Tint = "mint" | "peach" | "sky" | "lavender" | "butter" | "rose";

export const TINTS: Tint[] = ["mint", "peach", "sky", "lavender", "butter", "rose"];

/** Tile background, its label colour and its figure colour; the icon well's fill and icon. */
export const tintClasses: Record<Tint, { tile: string; label: string; value: string; well: string }> = {
  mint: { tile: "border-tint-mint bg-tint-mint", label: "text-tint-mint-label", value: "text-tint-mint-ink", well: "bg-tint-mint text-tint-mint-label" },
  peach: { tile: "border-tint-peach bg-tint-peach", label: "text-tint-peach-label", value: "text-tint-peach-ink", well: "bg-tint-peach text-tint-peach-label" },
  sky: { tile: "border-tint-sky bg-tint-sky", label: "text-tint-sky-label", value: "text-tint-sky-ink", well: "bg-tint-sky text-tint-sky-label" },
  lavender: { tile: "border-tint-lavender bg-tint-lavender", label: "text-tint-lavender-label", value: "text-tint-lavender-ink", well: "bg-tint-lavender text-tint-lavender-label" },
  butter: { tile: "border-tint-butter bg-tint-butter", label: "text-tint-butter-label", value: "text-tint-butter-ink", well: "bg-tint-butter text-tint-butter-label" },
  rose: { tile: "border-tint-rose bg-tint-rose", label: "text-tint-rose-label", value: "text-tint-rose-ink", well: "bg-tint-rose text-tint-rose-label" },
};

// Checked in this order: "Production days to approve" is an approval before it is production,
// and "Cash top-ups" is cash.
const LABEL_RULES: [Tint, RegExp][] = [
  ["lavender", /approv|waiting|pending|request|অনুমোদন|অপেক্ষা|অনুরোধ|मंजूर|अनुरोध/i],
  ["sky", /paytm|online|upi|zomato|swiggy|payout|loan|bank|পেটিএম|অনলাইন|ঋণ|ऑनलाइन/i],
  ["peach", /cash|spent|spend|expense|cost|bill|top-up|topup|ক্যাশ|নগদ|খরচ|নগদ|नकद|खर्च/i],
  ["mint", /sale|sold|revenue|profit|counter|income|বিক্রি|লাভ|बिक्री|मुनाफ/i],
  ["butter", /stock|momo|piece|production|batch|wastage|kitchen|bag|delivery|স্টক|মোমো|পিস|উৎপাদন|স্টক|स्टॉक|मोमो/i],
  ["rose", /salary|\bpay\b|team|staff|leave|attendance|people|present|absent|shift|বেতন|ছুটি|হাজিরা|কর্মী|वेतन|छुट्टी|हाजिरी/i],
];

/** Plain text of a label, for matching (strings, numbers and their children). */
export function textOfNode(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOfNode).join(" ");
  if (typeof node === "object" && "props" in node) return textOfNode((node as React.ReactElement<{ children?: React.ReactNode }>).props.children);
  return "";
}

/** The tint for a figure's label, or null when it isn't one of the kinds above. */
export function tintForLabel(label: React.ReactNode): Tint | null {
  const text = textOfNode(label);
  if (!text) return null;
  for (const [tint, re] of LABEL_RULES) if (re.test(text)) return tint;
  return null;
}

const ICON_TINTS: Record<string, Tint> = {
  TrendingUp: "mint", TrendingDown: "mint", ChartLine: "mint", ChartColumn: "mint", ChartBar: "mint", ChartNoAxesColumn: "mint", ChartPie: "mint", Store: "mint", ShoppingBag: "mint", ShoppingCart: "mint", Sparkles: "mint",
  Wallet: "peach", Banknote: "peach", Coins: "peach", IndianRupee: "peach", Receipt: "peach", ReceiptText: "peach", HandCoins: "peach", PiggyBank: "peach", Zap: "peach", Lightbulb: "peach",
  Smartphone: "sky", CreditCard: "sky", QrCode: "sky", Landmark: "sky", Bike: "sky", MapPin: "sky", Map: "sky", Globe: "sky", Send: "sky", Phone: "sky",
  Clock: "lavender", Hourglass: "lavender", SquareCheck: "lavender", CheckSquare: "lavender", ClipboardCheck: "lavender", BadgeCheck: "lavender", Bell: "lavender", Inbox: "lavender", ShieldCheck: "lavender", CircleCheck: "lavender", ListChecks: "lavender", Settings: "lavender", Cog: "lavender", KeyRound: "lavender", Lock: "lavender",
  ChefHat: "butter", Factory: "butter", Package: "butter", PackageOpen: "butter", Boxes: "butter", Warehouse: "butter", Truck: "butter", Soup: "butter", Utensils: "butter", UtensilsCrossed: "butter", Snowflake: "butter", Flame: "butter", Target: "butter", Scale: "butter", Archive: "butter", Wrench: "butter",
  Users: "rose", User: "rose", UserCheck: "rose", UserPlus: "rose", UserRound: "rose", UsersRound: "rose", CalendarClock: "rose", CalendarDays: "rose", Calendar: "rose", CalendarCheck: "rose", Briefcase: "rose", IdCard: "rose", HeartHandshake: "rose", Camera: "rose", Network: "rose",
};

/** The tint for an icon well: by what the icon means, else the same tint every time for that icon. */
export function tintForIcon(name?: string): Tint {
  if (!name) return "butter";
  const known = ICON_TINTS[name] || ICON_TINTS[name.replace(/Icon$/, "")];
  if (known) return known;
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return TINTS[h % TINTS.length];
}
