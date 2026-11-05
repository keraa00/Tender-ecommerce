/**
 * Demo order history for the seeded stores, so Customers, Orders and
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
 *
 * Stores whose catalogue entry offers cash on delivery are paid that way
 * wherever it was on offer, unless an order says it was paid by card — so
 * their history has cash still due, cash collected and parcels refused at the
 * door, beside card orders from abroad.
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
  /** Omitted: by age and payment — see `defaultOrderStatus`. */
  status?: SeedOrderStatus;
  /** Omitted: cash on delivery where the store's seed offers it, else card. */
  payment?: "card" | "cod";
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
    /** Omitted: by age and payment — see `defaultOrderStatus`. */
    status?: SeedOrderStatus;
    payment?: "card" | "cod";
    code?: string;
    /** The email as typed on this order, when it differs in case. */
    typedEmail?: string;
  }[];
};

/** Not yet shipped — or, paid in cash, not yet delivered — for orders younger than this. */
const UNFULFILLED_DAYS = 7;

/**
 * A recent card order is paid and waiting to ship; a recent cash-on-delivery
 * one is out with the courier, its cash still due. Older ones are fulfilled.
 */
export function defaultOrderStatus(daysAgo: number, cashOnDelivery: boolean): SeedOrderStatus {
  if (daysAgo > UNFULFILLED_DAYS) return "FULFILLED";
  return cashOnDelivery ? "PENDING" : "PAID";
}

function toOrders(storeSlug: string, buyers: readonly Buyer[]): SeedOrder[] {
  return buyers.flatMap((buyer) =>
    buyer.orders.map((order, index) => ({
      key: `${storeSlug}/${buyer.handle}/${index + 1}`,
      email: order.typedEmail ?? buyer.email,
      name: buyer.name,
      signedIn: buyer.signedIn ?? false,
      status: order.status,
      payment: order.payment,
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
 *
 * `codShare` is the share of guests who pay in cash where the store offers
 * it; the rest pay by card. Drawn from its own generator, so adding it never
 * moves anyone's basket.
 */
function oneOffGuests(
  storeSlug: string,
  people: readonly Person[],
  { codShare }: { codShare?: number } = {},
): Buyer[] {
  const store = SEED_STORES.find((candidate) => candidate.slug === storeSlug);
  if (!store) throw new Error(`No seeded store "${storeSlug}".`);
  const skus = store.products.flatMap((product) => product.variants.map((variant) => variant.sku));

  const random = generator(storeSlug);
  const between = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
  const pay = generator(`${storeSlug}/payment`);

  return people.map(([name, line1, city, postalCode, countryCode, region]) => {
    const pool = [...skus];
    const items = Array.from({ length: between(1, 3) }, (): [string, number] => [
      pool.splice(between(0, pool.length - 1), 1)[0],
      between(1, 2),
    ]);
    const payment = codShare !== undefined && pay() >= codShare ? "card" : undefined;

    return {
      handle: emailFor(name).split("@")[0],
      name,
      email: emailFor(name),
      address: { line1, city, region, postalCode, countryCode },
      orders: [{ daysAgo: between(2, 120), items, payment }],
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

// ---------------------------------------------------------------------------
// Wildmoor Apothecary — cash on delivery inside the UK
// ---------------------------------------------------------------------------

const wildmoorBuyers: Buyer[] = [
  {
    // Marlowe's owner, signed in, sending gifts across the Atlantic.
    handle: "camille",
    name: "Camille Tremblay",
    email: "marlowe@example.com",
    signedIn: true,
    address: {
      line1: "5420 Boulevard Saint-Laurent",
      city: "Montréal",
      region: "QC",
      postalCode: "H2T 1S1",
      countryCode: "CA",
    },
    orders: [
      { daysAgo: 52, items: ["WLD-MGB-OS"] },
      { daysAgo: 5, items: ["WLD-BCC-300", "WLD-LPM-100"] },
    ],
  },
  {
    // Loyal and local: card at first, cash on the doorstep since.
    handle: "eleanor",
    name: "Eleanor Price",
    email: "eleanor.price@example.com",
    address: { line1: "12 Albert Street", city: "Hebden Bridge", postalCode: "HX7 8AH", countryCode: "GB" },
    orders: [
      { daysAgo: 300, items: ["WLD-OHS-3", "WLD-LBB-60"], code: "WELCOME10", payment: "card" },
      { daysAgo: 210, items: ["WLD-BCC-180", "WLD-FLC-180"] },
      { daysAgo: 120, items: ["WLD-RFO-30"] },
      { daysAgo: 60, items: ["WLD-OHS-3", "WLD-MBS-500"], code: "THANKYOU15" },
      { daysAgo: 3, items: ["WLD-WMD-100", "WLD-BLB-RS"] },
    ],
  },
  {
    handle: "james",
    name: "James Whitaker",
    email: "james.whitaker@example.com",
    address: { line1: "7 Brudenell Grove", city: "Leeds", postalCode: "LS6 1HR", countryCode: "GB" },
    orders: [
      { daysAgo: 260, items: ["WLD-SSB-OS"] },
      { daysAgo: 150, items: ["WLD-SSB-OS", ["WLD-SSS-1", 2]] },
    ],
  },
  {
    // Refused at the door, then ordered again and paid by card.
    handle: "sophie",
    name: "Sophie Barker",
    email: "sophie.barker@example.com",
    address: { line1: "41 Burton Road", city: "Manchester", postalCode: "M20 3ED", countryCode: "GB" },
    orders: [
      { daysAgo: 30, items: ["WLD-MGB-OS"], status: "CANCELLED" },
      { daysAgo: 28, items: ["WLD-MGB-OS"], payment: "card" },
    ],
  },
  {
    handle: "aoife",
    name: "Aoife Byrne",
    email: "aoife.byrne@example.com",
    address: { line1: "14 Camden Street Lower", city: "Dublin", postalCode: "D02 R628", countryCode: "IE" },
    orders: [{ daysAgo: 40, items: [["WLD-CHC-75", 2], "WLD-KJS-OS"] }],
  },
  {
    // A card checkout started and never paid.
    handle: "isla",
    name: "Isla Grant",
    email: "isla.grant@example.com",
    address: { line1: "88 Great Western Road", city: "Glasgow", postalCode: "G4 9AB", countryCode: "GB" },
    orders: [{ daysAgo: 1, items: ["WLD-LBB-120"], status: "PENDING", payment: "card" }],
  },
  ...oneOffGuests(
    "wildmoor-apothecary",
    [
      ["Olivia Bennett", "23 Bootham", "York", "YO30 7BW", "GB"],
      ["Thomas Hall", "16 Kelham Square", "Sheffield", "S3 8SD", "GB"],
      ["Charlotte Evans", "4 Pulteney Bridge", "Bath", "BA2 4AT", "GB"],
      ["Rhys Morgan", "31 Pontcanna Street", "Cardiff", "CF11 9HS", "GB"],
      ["Lily Shaw", "9 Jesmond Road", "Newcastle upon Tyne", "NE2 1NL", "GB"],
      ["Henry Cole", "58 Cowley Road", "Oxford", "OX4 1JB", "GB"],
      ["Freya Mackenzie", "22 Broughton Street", "Edinburgh", "EH1 3RH", "GB"],
      ["Poppy Turner", "3 The Shambles", "York", "YO1 7LZ", "GB"],
      ["Arthur Davies", "70 North Road", "Brighton", "BN1 1YD", "GB"],
      ["Grace Neill", "19 Botanic Avenue", "Belfast", "BT7 1JG", "GB"],
      ["Ruby Fletcher", "45 Lark Lane", "Liverpool", "L17 8UW", "GB"],
      ["Saoirse Kelly", "8 Oliver Plunkett Street", "Cork", "T12 X8KC", "IE"],
      ["Margot Lefèvre", "24 Rue Oberkampf", "Paris", "75011", "FR"],
      ["Anke de Vries", "Oudegracht 140", "Utrecht", "3511 AZ", "NL"],
      ["Emily Tran", "1820 Haight Street", "San Francisco", "94117", "US", "CA"],
    ],
    { codShare: 0.5 },
  ),
];

// ---------------------------------------------------------------------------
// Halden Coffee Roasters — cash on delivery in Australia, up to A$400
// ---------------------------------------------------------------------------

const haldenBuyers: Buyer[] = [
  {
    // Loyal: a bag every few weeks for most of a year.
    handle: "mei",
    name: "Mei Chen",
    email: "mei.chen@example.com",
    address: {
      line1: "41 Smith Street",
      line2: "Unit 3",
      city: "Fitzroy",
      region: "VIC",
      postalCode: "3065",
      countryCode: "AU",
    },
    orders: [
      { daysAgo: 330, items: ["HLD-ETH-250W", "HLD-GNK-OS"], code: "FIRSTBREW", payment: "card" },
      { daysAgo: 280, items: [["HLD-COL-250W", 2]] },
      { daysAgo: 240, items: ["HLD-KEN-250W"] },
      { daysAgo: 190, items: ["HLD-FHB-1KW"] },
      { daysAgo: 140, items: ["HLD-COL-1KW"] },
      { daysAgo: 95, items: [["HLD-ETH-250W", 2]] },
      { daysAgo: 45, items: ["HLD-GUA-250W", "HLD-PPF-100"], code: "REGULAR10" },
      { daysAgo: 6, items: ["HLD-COL-1KW"] },
    ],
  },
  {
    handle: "jack",
    name: "Jack Thompson",
    email: "jack.thompson@example.com",
    address: {
      line1: "17 James Street",
      city: "Fortitude Valley",
      region: "QLD",
      postalCode: "4006",
      countryCode: "AU",
    },
    orders: [
      { daysAgo: 250, items: ["HLD-BHG-OS"] },
      { daysAgo: 160, items: [["HLD-FHB-250W", 2]] },
    ],
  },
  {
    handle: "aroha",
    name: "Aroha Ngata",
    email: "aroha.ngata@example.com",
    address: { line1: "120 Cuba Street", city: "Wellington", postalCode: "6011", countryCode: "NZ" },
    orders: [
      { daysAgo: 70, items: ["HLD-ETH-250W", "HLD-NSD-250W"] },
      { daysAgo: 20, items: ["HLD-ETH-1KW"] },
    ],
  },
  {
    handle: "weiming",
    name: "Wei Ming Tan",
    email: "weiming.tan@example.com",
    address: { line1: "8 Haji Lane", city: "Singapore", postalCode: "189201", countryCode: "SG" },
    orders: [{ daysAgo: 35, items: [["HLD-KEN-250W", 2], "HLD-GLS-600"] }],
  },
  {
    // Turned the parcel away for the wrong size, then ordered the small one.
    handle: "sienna",
    name: "Sienna Walker",
    email: "sienna.walker@example.com",
    address: {
      line1: "52 Darling Street",
      city: "Balmain",
      region: "NSW",
      postalCode: "2041",
      countryCode: "AU",
    },
    orders: [
      { daysAgo: 25, items: ["HLD-SFP-1L"], status: "CANCELLED" },
      { daysAgo: 24, items: ["HLD-SFP-600"] },
    ],
  },
  {
    // Over the cash limit, so this one went on a card.
    handle: "ben",
    name: "Ben Kowalski",
    email: "ben.kowalski@example.com",
    address: {
      line1: "200 Rundle Street",
      city: "Adelaide",
      region: "SA",
      postalCode: "5000",
      countryCode: "AU",
    },
    orders: [{ daysAgo: 14, items: ["HLD-BHG-OS", "HLD-GNK-OS", "HLD-BSC-OS", "HLD-GLS-600"] }],
  },
  ...oneOffGuests(
    "halden-coffee",
    [
      ["Charlotte Nguyen", "88 Chapel Street", "Windsor", "3181", "AU", "VIC"],
      ["Liam Brennan", "14 Hardware Lane", "Melbourne", "3000", "AU", "VIC"],
      ["Isabella Rossi", "305 King Street", "Newtown", "2042", "AU", "NSW"],
      ["Noah Williams", "61 Brunswick Street", "New Farm", "4005", "AU", "QLD"],
      ["Harper Scott", "9 Lonsdale Street", "Braddon", "2612", "AU", "ACT"],
      ["Oscar Patel", "142 Oxford Street", "Leederville", "6007", "AU", "WA"],
      ["Ava Mitchell", "27 Salamanca Place", "Hobart", "7000", "AU", "TAS"],
      ["Jacob Lee", "410 Crown Street", "Surry Hills", "2010", "AU", "NSW"],
      ["Zara Ahmed", "75 Lygon Street", "Carlton", "3053", "AU", "VIC"],
      ["Ethan Murray", "33 Mitchell Street", "Darwin", "0800", "AU", "NT"],
      ["Ruby Anderson", "18 Gouger Street", "Adelaide", "5000", "AU", "SA"],
      ["Hamish Taylor", "2 Ponsonby Road", "Auckland", "1011", "NZ"],
      ["Aisyah Rahman", "12 Jalan Telawi 3", "Kuala Lumpur", "59100", "MY"],
    ],
    { codShare: 0.6 },
  ),
];

// ---------------------------------------------------------------------------
// Marlowe Paper Co. — cash on delivery in Canada, from C$20
// ---------------------------------------------------------------------------

const marloweBuyers: Buyer[] = [
  {
    // Wildmoor's owner, signed in.
    handle: "harriet",
    name: "Harriet Ashworth",
    email: "wildmoor@example.com",
    signedIn: true,
    address: { line1: "12 Market Street", city: "Hebden Bridge", postalCode: "HX7 6AA", countryCode: "GB" },
    orders: [
      { daysAgo: 90, items: ["MRL-BFP-F", "MRL-INK-SP"] },
      { daysAgo: 8, items: [["MRL-WP27-OS", 2]] },
    ],
  },
  {
    handle: "etienne",
    name: "Étienne Gagnon",
    email: "etienne.gagnon@example.com",
    address: {
      line1: "4210 Rue Saint-Denis",
      city: "Montréal",
      region: "QC",
      postalCode: "H2J 2K8",
      countryCode: "CA",
    },
    orders: [
      { daysAgo: 320, items: [["MRL-A5D-BL", 2]], code: "BIENVENUE10", payment: "card" },
      { daysAgo: 230, items: ["MRL-BFP-M", "MRL-INK-MN"] },
      { daysAgo: 150, items: ["MRL-INK-BK", "MRL-CTG-12"] },
      { daysAgo: 80, items: ["MRL-LBJ-OS"] },
      { daysAgo: 6, items: ["MRL-WP27-OS", "MRL-WTS-4"] },
    ],
  },
  {
    handle: "sarah",
    name: "Sarah Goldberg",
    email: "sarah.goldberg@example.com",
    address: {
      line1: "388 Queen Street West",
      city: "Toronto",
      region: "ON",
      postalCode: "M5V 2A2",
      countryCode: "CA",
    },
    orders: [
      { daysAgo: 200, items: ["MRL-WDT-OS", "MRL-BFP-F"], code: "WRITE10" },
      { daysAgo: 120, items: ["MRL-WFM-CH"] },
    ],
  },
  {
    // Under the cash-on-delivery minimum, so it was paid by card.
    handle: "owen",
    name: "Owen MacLeod",
    email: "owen.macleod@example.com",
    address: {
      line1: "1245 Barrington Street",
      city: "Halifax",
      region: "NS",
      postalCode: "B3J 1Y2",
      countryCode: "CA",
    },
    orders: [{ daysAgo: 15, items: ["MRL-CTG-12"] }],
  },
  {
    handle: "hannah",
    name: "Hannah Reed",
    email: "hannah.reed@example.com",
    address: {
      line1: "915 SE Hawthorne Blvd",
      city: "Portland",
      region: "OR",
      postalCode: "97214",
      countryCode: "US",
    },
    orders: [{ daysAgo: 40, items: ["MRL-LPR-OS", "MRL-BMP-07"] }],
  },
  {
    // Refused at the door.
    handle: "julien",
    name: "Julien Roy",
    email: "julien.roy@example.com",
    address: {
      line1: "780 Rue Saint-Jean",
      city: "Québec",
      region: "QC",
      postalCode: "G1R 1P9",
      countryCode: "CA",
    },
    orders: [{ daysAgo: 33, items: ["MRL-WSK-OS", "MRL-LPC-5"], status: "CANCELLED" }],
  },
  {
    // A card checkout started and never paid.
    handle: "maya",
    name: "Maya Singh",
    email: "maya.singh@example.com",
    address: {
      line1: "1150 Commercial Drive",
      city: "Vancouver",
      region: "BC",
      postalCode: "V5L 3X3",
      countryCode: "CA",
    },
    orders: [{ daysAgo: 2, items: ["MRL-WFM-GR"], status: "PENDING", payment: "card" }],
  },
  ...oneOffGuests(
    "marlowe-paper",
    [
      ["Léa Bouchard", "3510 Avenue du Parc", "Montréal", "H2X 2H7", "CA", "QC"],
      ["Gabriel Côté", "155 Rue Saint-Paul Est", "Montréal", "H2Y 1G8", "CA", "QC"],
      ["Emma Wilson", "620 Bloor Street West", "Toronto", "M6G 1K7", "CA", "ON"],
      ["Liam Chen", "2190 West 4th Avenue", "Vancouver", "V6K 1N8", "CA", "BC"],
      ["Chloé Lavoie", "250 Rue Wellington Nord", "Sherbrooke", "J1H 5C1", "CA", "QC"],
      ["Benjamin Hart", "45 Elgin Street", "Ottawa", "K1P 5K6", "CA", "ON"],
      ["Ava Thompson", "10125 Whyte Avenue", "Edmonton", "T6E 1Z4", "CA", "AB"],
      ["Nathan Wong", "1012 17th Avenue SW", "Calgary", "T2T 0A5", "CA", "AB"],
      ["Rosalie Pelletier", "1 Rue des Jardins", "Québec", "G1R 4S9", "CA", "QC"],
      ["Jacob Morrison", "300 Water Street", "St. John's", "A1C 1B9", "CA", "NL"],
      ["Ryan Cooper", "2215 N Milwaukee Ave", "Chicago", "60647", "US", "IL"],
      ["Megan Kelly", "140 Newbury Street", "Boston", "02116", "US", "MA"],
      ["Isabelle Durand", "8 Rue Mouffetard", "Paris", "75005", "FR"],
      ["Lena Schmidt", "Bergmannstraße 5", "Berlin", "10961", "DE"],
    ],
    { codShare: 0.5 },
  ),
];

// ---------------------------------------------------------------------------
// Bakar Atelier — cash on delivery in Bosnia and Herzegovina, up to 1,500 KM
// ---------------------------------------------------------------------------

const bakarBuyers: Buyer[] = [
  {
    // Kehre's owner, signed in, ordering from Zürich.
    handle: "lukas",
    name: "Lukas Brunner",
    email: "kehre@example.com",
    signedIn: true,
    address: { line1: "Langstrasse 120", city: "Zürich", postalCode: "8004", countryCode: "CH" },
    orders: [
      { daysAgo: 60, items: ["BKR-CST-2"] },
      { daysAgo: 12, items: ["BKR-PCL-L", ["BKR-KAF-200", 2]] },
    ],
  },
  {
    // Loyal and in town: everything in cash at the door.
    handle: "amra",
    name: "Amra Hodžić",
    email: "amra.hodzic@example.com",
    address: { line1: "Ferhadija 12", city: "Sarajevo", postalCode: "71000", countryCode: "BA" },
    orders: [
      { daysAgo: 310, items: ["BKR-DZV-4", "BKR-FLD-2"], code: "DOBRODOSLI" },
      { daysAgo: 200, items: [["BKR-KAF-200", 3]] },
      { daysAgo: 130, items: ["BKR-ERT-30"] },
      { daysAgo: 70, items: [["BKR-KAF-200", 2], "BKR-SCR-OS"], code: "HVALA15" },
      { daysAgo: 4, items: ["BKR-LKD-OS"] },
    ],
  },
  {
    // Diaspora in Vienna, buying sets to give away.
    handle: "mirza",
    name: "Mirza Begić",
    email: "mirza.begic@example.com",
    address: { line1: "Ottakringer Straße 54", city: "Vienna", postalCode: "1160", countryCode: "AT" },
    orders: [
      { daysAgo: 180, items: ["BKR-CST-2"] },
      { daysAgo: 40, items: ["BKR-DZV-6", ["BKR-KAF-200", 4]] },
    ],
  },
  {
    handle: "lejla",
    name: "Lejla Mehmedović",
    email: "lejla.mehmedovic@example.com",
    address: { line1: "Södra Förstadsgatan 22", city: "Malmö", postalCode: "211 43", countryCode: "SE" },
    orders: [{ daysAgo: 22, items: ["BKR-HPL-35"] }],
  },
  {
    handle: "haris",
    name: "Haris Delić",
    email: "haris.delic@example.com",
    address: { line1: "Braće Fejića 18", city: "Mostar", postalCode: "88000", countryCode: "BA" },
    orders: [
      { daysAgo: 280, items: ["BKR-ERT-40"] },
      { daysAgo: 150, items: ["BKR-IBR-15"] },
    ],
  },
  {
    // Refused at the door.
    handle: "tarik",
    name: "Tarik Mujić",
    email: "tarik.mujic@example.com",
    address: { line1: "Maršala Tita 5", city: "Tuzla", postalCode: "75000", countryCode: "BA" },
    orders: [{ daysAgo: 18, items: ["BKR-HPL-35"], status: "CANCELLED" }],
  },
  {
    handle: "ivana",
    name: "Ivana Marić",
    email: "ivana.maric@example.com",
    address: { line1: "Ilica 45", city: "Zagreb", postalCode: "10000", countryCode: "HR" },
    orders: [{ daysAgo: 55, items: ["BKR-FLD-2", "BKR-DZV-2"] }],
  },
  ...oneOffGuests(
    "bakar-atelier",
    [
      ["Emina Hasić", "Zelenih beretki 8", "Sarajevo", "71000", "BA"],
      ["Dino Kurtović", "Kralja Petra I Karađorđevića 33", "Banja Luka", "78000", "BA"],
      ["Selma Alić", "Kulina bana 4", "Zenica", "72000", "BA"],
      ["Kenan Mešić", "Bosanska 15", "Bihać", "77000", "BA"],
      ["Ajla Hadžiomerović", "Ćemaluša 6", "Sarajevo", "71000", "BA"],
      ["Nermin Zukić", "Bosanska 71", "Travnik", "72270", "BA"],
      ["Lamija Pašić", "Rade Bitange 12", "Mostar", "88000", "BA"],
      ["Adna Bešlija", "Gradačačka 21", "Sarajevo", "71000", "BA"],
      ["Jasmin Omerović", "Turalibegova 9", "Tuzla", "75000", "BA"],
      ["Ana Jurić", "Fra Didaka Buntića 3", "Široki Brijeg", "88220", "BA"],
      ["Milica Petrović", "Knez Mihailova 20", "Belgrade", "11000", "RS"],
      ["Amel Smajić", "Sonnenallee 112", "Berlin", "12045", "DE"],
      ["Sara Halilović", "Linnégatan 12", "Gothenburg", "413 04", "SE"],
      ["Amina Ramić", "Annenstraße 30", "Graz", "8020", "AT"],
      ["Edin Hukić", "4150 Gravois Avenue", "St. Louis", "63116", "US", "MO"],
    ],
    { codShare: 0.85 },
  ),
];

// ---------------------------------------------------------------------------
// Kehre Velo — Swiss Post cash on delivery in Switzerland and Liechtenstein
// ---------------------------------------------------------------------------

const kehreBuyers: Buyer[] = [
  {
    // Halden's owner, signed in, ordering kit to Melbourne.
    handle: "lachlan",
    name: "Lachlan Reid",
    email: "halden@example.com",
    signedIn: true,
    address: {
      line1: "88 Gertrude Street",
      city: "Fitzroy",
      region: "VIC",
      postalCode: "3065",
      countryCode: "AU",
    },
    orders: [
      { daysAgo: 75, items: ["KHR-MLJ-M", "KHR-CCC-NV"] },
      { daysAgo: 16, items: ["KHR-PRJ-M"] },
    ],
  },
  {
    // Bakar's owner, signed in.
    handle: "adnan",
    name: "Adnan Kazazić",
    email: "bakar@example.com",
    signedIn: true,
    address: { line1: "Kazandžiluk 7", city: "Sarajevo", postalCode: "71000", countryCode: "BA" },
    orders: [
      { daysAgo: 110, items: ["KHR-FRB-M", ["KHR-INB-BL", 2]] },
      { daysAgo: 28, items: ["KHR-WGL-M"] },
    ],
  },
  {
    handle: "marco",
    name: "Marco Keller",
    email: "marco.keller@example.com",
    address: { line1: "Hardturmstrasse 161", city: "Zürich", postalCode: "8005", countryCode: "CH" },
    orders: [
      { daysAgo: 340, items: ["KHR-PBS-M", "KHR-MLJ-M"], code: "WILLKOMMEN", payment: "card" },
      { daysAgo: 270, items: [["KHR-WCL-120", 2], "KHR-SMT-OS"] },
      { daysAgo: 190, items: ["KHR-PRJ-M"] },
      { daysAgo: 100, items: ["KHR-STP-10", "KHR-FRB-M"] },
      { daysAgo: 50, items: ["KHR-TGL-M"] },
      { daysAgo: 5, items: [["KHR-MCS-43", 3], "KHR-WCL-120"] },
    ],
  },
  {
    handle: "simone",
    name: "Simone Baumann",
    email: "simone.baumann@example.com",
    address: { line1: "Spalenberg 22", city: "Basel", postalCode: "4051", countryCode: "CH" },
    orders: [
      { daysAgo: 230, items: ["KHR-PBS-S"] },
      { daysAgo: 160, items: ["KHR-CCC-CK", ["KHR-MCS-39", 2]] },
    ],
  },
  {
    // Not home for the postman, so it went back; paid by card the next day.
    handle: "nicolas",
    name: "Nicolas Favre",
    email: "nicolas.favre@example.com",
    address: { line1: "Rue du Marché 10", city: "Genève", postalCode: "1204", countryCode: "CH" },
    orders: [
      { daysAgo: 21, items: ["KHR-PRJ-L"], status: "CANCELLED" },
      { daysAgo: 20, items: ["KHR-PRJ-L"], payment: "card" },
    ],
  },
  {
    handle: "julia",
    name: "Julia Frick",
    email: "julia.frick@example.com",
    address: { line1: "Städtle 30", city: "Vaduz", postalCode: "9490", countryCode: "LI" },
    orders: [{ daysAgo: 37, items: ["KHR-LTS-OS"] }],
  },
  {
    handle: "felix",
    name: "Felix Wagner",
    email: "felix.wagner@example.com",
    address: { line1: "Leopoldstraße 50", city: "Munich", postalCode: "80802", countryCode: "DE" },
    orders: [{ daysAgo: 65, items: ["KHR-SMT-OS", "KHR-MPM-OS"] }],
  },
  {
    // A card checkout started and never paid.
    handle: "laura",
    name: "Laura Meier",
    email: "laura.meier@example.com",
    address: { line1: "Bahnhofstrasse 8", city: "Luzern", postalCode: "6003", countryCode: "CH" },
    orders: [{ daysAgo: 1, items: ["KHR-MLJ-S"], status: "PENDING", payment: "card" }],
  },
  ...oneOffGuests(
    "kehre-velo",
    [
      ["Noah Huber", "Seefeldstrasse 45", "Zürich", "8008", "CH"],
      ["Lea Schneider", "Marktgasse 12", "Bern", "3011", "CH"],
      ["Jonas Steiner", "Rorschacher Strasse 70", "St. Gallen", "9000", "CH"],
      ["Mia Gerber", "Via Nassa 5", "Lugano", "6900", "CH"],
      ["Luca Rossi", "Avenue de la Gare 12", "Lausanne", "1003", "CH"],
      ["Moritz Wyss", "Hauptgasse 33", "Solothurn", "4500", "CH"],
      ["Sara Bianchi", "Bahnhofplatz 3", "Chur", "7000", "CH"],
      ["Elena Brunetti", "Via Roma 14", "Bormio", "23032", "IT"],
      ["Chiara Fontana", "Via Garibaldi 9", "Turin", "10122", "IT"],
      ["Tobias Gruber", "Museumstraße 20", "Innsbruck", "6020", "AT"],
      ["Sophie Lang", "Kaiser-Joseph-Straße 61", "Freiburg im Breisgau", "79098", "DE"],
      ["Pierre Girard", "8 Rue Royale", "Annecy", "74000", "FR"],
      ["Tom Jansen", "Nieuwe Binnenweg 120", "Rotterdam", "3015 BG", "NL"],
      ["Erik Sandberg", "Vasagatan 10", "Stockholm", "111 20", "SE"],
    ],
    { codShare: 0.4 },
  ),
];

export const SEED_ORDERS: Record<string, SeedOrder[]> = {
  "rosewater-ceramics": toOrders("rosewater-ceramics", rosewaterBuyers),
  "nordhavn-supply": toOrders("nordhavn-supply", nordhavnBuyers),
  "wildmoor-apothecary": toOrders("wildmoor-apothecary", wildmoorBuyers),
  "halden-coffee": toOrders("halden-coffee", haldenBuyers),
  "marlowe-paper": toOrders("marlowe-paper", marloweBuyers),
  "bakar-atelier": toOrders("bakar-atelier", bakarBuyers),
  "kehre-velo": toOrders("kehre-velo", kehreBuyers),
};
