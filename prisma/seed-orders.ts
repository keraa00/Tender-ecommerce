/**
 * Demo order history for the two seeded stores, so Customers, Orders and
 * Analytics have something to show.
 *
 * There is no customers table — a customer is the email on settled orders — so
 * seeding customers means seeding orders. The named buyers below are chosen to
 * land in every customer filter: repeat, loyal, lapsed, signed-in and guest.
 * Around them are the cases the Customers pages have to get right: an address
 * typed in two cases, a buyer of both stores, a checkout that was never paid,
 * a cancelled order, codes from each store's own discounts, and enough one-off
 * guests that Rosewater's list needs a second page.
 *
 * Dates are days before the seed runs rather than fixed. "Lapsed" means no
 * order in 90 days, so fixed dates would drift every buyer into it; reseeding
 * moves them back. Everything else is fixed, including the one-off guests,
 * whose dates and baskets come from a seeded generator so every run writes the
 * same orders.
 */

import { SEED_STORES } from "./seed-catalog";

export type SeedOrderStatus = "PENDING" | "PAID" | "FULFILLED" | "CANCELLED";

export type SeedAddress = {
  line1: string;
  line2?: string;
  city: string;
  /** ISO 3166-2 without the country prefix, for the countries that use one. */
  region?: string;
  postalCode: string;
  /** ISO 3166-1 alpha-2. */
  countryCode: string;
};

export type SeedOrder = {
  /** Stable across runs: the order's id is derived from it. */
  key: string;
  /** As the buyer typed it. Checkout lower-cases it now; older orders did not. */
  email: string;
  name: string;
  /** Placed while signed in to the seeded account with this email. */
  signedIn: boolean;
  status: SeedOrderStatus;
  daysAgo: number;
  items: { sku: string; quantity: number }[];
  /** One of the store's seeded discount codes. */
  code: string | null;
  address: SeedAddress;
};

type Buyer = {
  /** Order keys derive from it, so renaming one orphans its old orders. */
  handle: string;
  name: string;
  email: string;
  signedIn?: boolean;
  address: SeedAddress;
  orders: {
    daysAgo: number;
    /** A SKU, or a SKU and a quantity. */
    items: (string | [string, number])[];
    /** Recent orders default to paid, older ones to fulfilled. */
    status?: SeedOrderStatus;
    code?: string;
    /** The email as typed on this order, when it differs in case. */
    typedEmail?: string;
  }[];
};

/** Paid but not yet shipped, for orders younger than this. */
const UNFULFILLED_DAYS = 7;

function toOrders(storeSlug: string, buyers: readonly Buyer[]): SeedOrder[] {
  return buyers.flatMap((buyer) =>
    buyer.orders.map((order, index) => ({
      key: `${storeSlug}/${buyer.handle}/${index + 1}`,
      email: order.typedEmail ?? buyer.email,
      name: buyer.name,
      signedIn: buyer.signedIn ?? false,
      status: order.status ?? (order.daysAgo <= UNFULFILLED_DAYS ? "PAID" : "FULFILLED"),
      daysAgo: order.daysAgo,
      items: order.items.map((item) =>
        typeof item === "string"
          ? { sku: item, quantity: 1 }
          : { sku: item[0], quantity: item[1] },
      ),
      code: order.code ?? null,
      address: buyer.address,
    })),
  );
}

// ---------------------------------------------------------------------------
// One-off guests
// ---------------------------------------------------------------------------

/** Name, then the address. */
type Person = [name: string, line1: string, city: string, postalCode: string, countryCode: string, region?: string];

/** mulberry32 over an FNV-1a hash of the seed: tiny, and the same everywhere. */
function generator(seed: string): () => number {
  let state = 2166136261;
  for (const char of seed) state = Math.imul(state ^ char.charCodeAt(0), 16777619);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function emailFor(name: string): string {
  const ascii = name.normalize("NFD").replace(/[̀-ͯ]/g, "");
  return `${ascii.toLowerCase().replace(/\s+/g, ".")}@example.com`;
}

/**
 * One order each, a few days to four months old — so some have lapsed — with
 * one to three different products from the store's catalogue.
 */
function oneOffGuests(storeSlug: string, people: readonly Person[]): Buyer[] {
  const store = SEED_STORES.find((candidate) => candidate.slug === storeSlug);
  if (!store) throw new Error(`No seeded store "${storeSlug}".`);
  const skus = store.products.flatMap((product) => product.variants.map((variant) => variant.sku));

  const random = generator(storeSlug);
  const between = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));

  return people.map(([name, line1, city, postalCode, countryCode, region]) => {
    const pool = [...skus];
    const items = Array.from({ length: between(1, 3) }, (): [string, number] => [
      pool.splice(between(0, pool.length - 1), 1)[0],
      between(1, 2),
    ]);

    return {
      handle: emailFor(name).split("@")[0],
      name,
      email: emailFor(name),
      address: { line1, city, region, postalCode, countryCode },
      orders: [{ daysAgo: between(2, 120), items }],
    };
  });
}

// ---------------------------------------------------------------------------
// Rosewater Ceramics
// ---------------------------------------------------------------------------

const rosewaterBuyers: Buyer[] = [
  {
    // Nordhavn's owner, shopping signed in: a customer with an account.
    handle: "ingrid",
    name: "Ingrid Lund",
    email: "nordhavn@example.com",
    signedIn: true,
    address: { line1: "Storgata 14", city: "Tromsø", postalCode: "9008", countryCode: "NO" },
    orders: [
      { daysAgo: 34, items: [["RSW-SSM-SL", 2], "RSW-ECP-OS"] },
      { daysAgo: 4, items: ["RSW-HTT-OS"] },
    ],
  },
  {
    // Loyal and current. Also buys from Nordhavn, which must not show here.
    handle: "priya",
    name: "Priya Shah",
    email: "priya.shah@example.org",
    address: { line1: "27 Elm Row", city: "Edinburgh", postalCode: "EH7 4AA", countryCode: "GB" },
    orders: [
      { daysAgo: 330, items: [["RSW-SSM-CR", 2], ["RSW-AGP-27", 2]], code: "WELCOME10" },
      { daysAgo: 240, items: ["RSW-LSB-OS"] },
      { daysAgo: 150, items: ["RSW-POS-OS"] },
      { daysAgo: 64, items: ["RSW-RBT-4"] },
      { daysAgo: 12, items: ["RSW-SBK-OS", "RSW-SCL-OS"] },
    ],
  },
  {
    // Loyal but lapsed — and the first order was typed with capitals, before
    // checkout lower-cased addresses. Still one customer.
    handle: "tomas",
    name: "Tomás Berg",
    email: "tomas.berg@example.net",
    address: { line1: "Södermannagatan 5", city: "Stockholm", postalCode: "116 23", countryCode: "SE" },
    orders: [
      { daysAgo: 400, items: ["RSW-MBV-OS", "RSW-BDV-OS"], typedEmail: "Tomas.Berg@Example.net" },
      { daysAgo: 260, items: [["RSW-AGP-22", 4]] },
      { daysAgo: 140, items: ["RSW-UCK-OS"] },
    ],
  },
  {
    handle: "hannah",
    name: "Hannah Okafor",
    email: "hannah.okafor@example.com",
    address: { line1: "54 Thomas Street", city: "Manchester", postalCode: "M4 1ER", countryCode: "GB" },
    orders: [
      { daysAgo: 300, items: ["RSW-TCP-M", "RSW-TCP-S"] },
      { daysAgo: 200, items: ["RSW-TCP-L"] },
    ],
  },
  {
    // Lapsed, then won back with the lapsed-customer code.
    handle: "sam",
    name: "Sam Rivera",
    email: "sam.rivera@example.com",
    address: {
      line1: "2140 W Division St",
      city: "Chicago",
      region: "IL",
      postalCode: "60622",
      countryCode: "US",
    },
    orders: [
      { daysAgo: 260, items: ["RSW-ECP-OS"] },
      { daysAgo: 9, items: ["RSW-POS-OS", ["RSW-SSM-CR", 2]], code: "COMEBACK20" },
    ],
  },
  {
    // Lapsed, with a checkout started this week and never paid.
    handle: "leo",
    name: "Leo Martin",
    email: "leo.martin@example.com",
    address: { line1: "5 Rue Sainte-Catherine", city: "Bordeaux", postalCode: "33000", countryCode: "FR" },
    orders: [
      { daysAgo: 120, items: ["RSW-SBD-OS"] },
      { daysAgo: 2, items: ["RSW-LSB-OS"], status: "PENDING" },
    ],
  },
  {
    // Cancelled, then placed again the next day.
    handle: "chloe",
    name: "Chloé Dubois",
    email: "chloe.dubois@example.com",
    address: { line1: "Rue Neuve 30", city: "Brussels", postalCode: "1000", countryCode: "BE" },
    orders: [
      { daysAgo: 45, items: ["RSW-RBT-2"], status: "CANCELLED" },
      { daysAgo: 44, items: ["RSW-RBT-4"] },
    ],
  },
  {
    // A `+` in the address, which the customer's URL has to survive.
    handle: "mia",
    name: "Mia Fischer",
    email: "mia+ceramics@example.com",
    address: {
      line1: "Schanzenstraße 7",
      line2: "3. OG",
      city: "Hamburg",
      postalCode: "20357",
      countryCode: "DE",
    },
    orders: [{ daysAgo: 18, items: [["RSW-BDV-OS", 3]], code: "SECONDS" }],
  },
  {
    // An `_`, which a careless LIKE would read as a wildcard.
    handle: "noah",
    name: "Noah Kim",
    email: "noah_kim@example.com",
    address: {
      line1: "88 Bedford Ave",
      line2: "Apt 4C",
      city: "Brooklyn",
      region: "NY",
      postalCode: "11249",
      countryCode: "US",
    },
    orders: [{ daysAgo: 27, items: ["RSW-MBV-OS"] }],
  },
  {
    // Never paid, so never a customer.
    handle: "alex",
    name: "Alex Doyle",
    email: "alex.doyle@example.net",
    address: { line1: "3 Quay Street", city: "Galway", postalCode: "H91 DX47", countryCode: "IE" },
    orders: [{ daysAgo: 1, items: ["RSW-GSD-OS"], status: "PENDING" }],
  },
  ...oneOffGuests("rosewater-ceramics", [
    ["Ana Costa", "Rua do Almada 112", "Porto", "4050-038", "PT"],
    ["Lucas Moreau", "18 Rue des Martyrs", "Paris", "75009", "FR"],
    ["Sofia Romano", "Via dei Serpenti 45", "Rome", "00184", "IT"],
    ["Jonas Weber", "Oranienstraße 21", "Berlin", "10999", "DE"],
    ["Emma Jansen", "Prinsengracht 263", "Amsterdam", "1016 GV", "NL"],
    ["Oliver Hughes", "14 Hope Street", "Liverpool", "L1 9BH", "GB"],
    ["Maya Patel", "220 Valencia Street", "San Francisco", "94103", "US", "CA"],
    ["Elena García", "Calle de Fuencarral 70", "Madrid", "28004", "ES"],
    ["Finn Larsen", "Jægersborggade 9", "Copenhagen", "2200", "DK"],
    ["Aisha Bello", "9 Clerkenwell Road", "London", "EC1M 5RN", "GB"],
    ["Mateo Silva", "Rua Augusta 150", "Lisbon", "1100-053", "PT"],
    ["Clara Novak", "Vinohradská 34", "Prague", "120 00", "CZ"],
    ["Ethan Brooks", "401 Congress Avenue", "Austin", "78701", "US", "TX"],
    ["Inês Ferreira", "Avenida da Liberdade 98", "Lisbon", "1250-145", "PT"],
    ["Hugo Lambert", "7 Place Bellecour", "Lyon", "69002", "FR"],
    ["Freya Nilsson", "Götgatan 48", "Stockholm", "118 26", "SE"],
    ["Daniel Reyes", "1520 Pike Place", "Seattle", "98101", "US", "WA"],
    ["Lea Hoffmann", "Sendlinger Straße 12", "Munich", "80331", "DE"],
    ["Ruby Walsh", "33 Dawson Street", "Dublin", "D02 XY72", "IE"],
    ["Marco Bianchi", "Corso Buenos Aires 23", "Milan", "20124", "IT"],
    ["Zoe Clarke", "61 Victoria Street", "Bristol", "BS1 6AD", "GB"],
    ["Nina Petrova", "Mariahilfer Straße 88", "Vienna", "1070", "AT"],
  ]),
];

// ---------------------------------------------------------------------------
// Nordhavn Supply
// ---------------------------------------------------------------------------

const nordhavnBuyers: Buyer[] = [
  {
    // Rosewater's owner, signed in, and a loyal customer here.
    handle: "marta",
    name: "Marta Oliveira",
    email: "rosewater@example.com",
    signedIn: true,
    address: { line1: "Rua da Rosa 210", city: "Lisbon", postalCode: "1200-385", countryCode: "PT" },
    orders: [
      { daysAgo: 200, items: ["NRD-FSJ-M"] },
      { daysAgo: 70, items: [["NRD-MBL-S", 2]] },
      { daysAgo: 6, items: ["NRD-WWC-OA", "NRD-ECM-NV"] },
    ],
  },
  {
    // The same buyer as at Rosewater, seen separately here.
    handle: "priya",
    name: "Priya Shah",
    email: "priya.shah@example.org",
    address: { line1: "27 Elm Row", city: "Edinburgh", postalCode: "EH7 4AA", countryCode: "GB" },
    orders: [{ daysAgo: 20, items: ["NRD-TIF-750", "NRD-RHS-M"], code: "WELCOME10" }],
  },
  {
    handle: "erik",
    name: "Erik Haugen",
    email: "erik.haugen@example.com",
    address: { line1: "Bryggen 15", city: "Bergen", postalCode: "5003", countryCode: "NO" },
    orders: [
      { daysAgo: 180, items: ["NRD-PDV-M"] },
      { daysAgo: 110, items: ["NRD-STG-M", "NRD-ALH-OS"] },
    ],
  },
  {
    handle: "anna",
    name: "Anna Lindqvist",
    email: "anna.lindqvist@example.com",
    address: { line1: "Kungsgatan 22", city: "Uppsala", postalCode: "753 21", countryCode: "SE" },
    orders: [
      { daysAgo: 15, items: ["NRD-CFT-32", "NRD-BLB-34"], code: "WELCOME10" },
      { daysAgo: 3, items: ["NRD-CRS-L"], status: "CANCELLED" },
    ],
  },
  ...oneOffGuests("nordhavn-supply", [
    ["Lars Johansen", "Thorvald Meyers gate 40", "Oslo", "0555", "NO"],
    ["Siobhan Murphy", "12 Shop Street", "Galway", "H91 E2W8", "IE"],
    ["Kai Müller", "Maria-Theresien-Straße 9", "Innsbruck", "6020", "AT"],
    ["Ellie Fraser", "8 Church Street", "Inverness", "IV1 1DY", "GB"],
    ["Mikko Virtanen", "Fredrikinkatu 33", "Helsinki", "00120", "FI"],
    ["Grace Taylor", "21 Lake Road", "Keswick", "CA12 5BX", "GB"],
    ["Ben Carter", "1310 Pearl Street", "Boulder", "80302", "US", "CO"],
    ["Astrid Berg", "Olav Tryggvasons gate 18", "Trondheim", "7011", "NO"],
  ]),
];

export const SEED_ORDERS: Record<string, SeedOrder[]> = {
  "rosewater-ceramics": toOrders("rosewater-ceramics", rosewaterBuyers),
  "nordhavn-supply": toOrders("nordhavn-supply", nordhavnBuyers),
};
