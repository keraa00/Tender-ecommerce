/**
 * Demo catalogue for the seeded stores.
 *
 * Several stores, not one: multi-tenancy is the point of this project, and a
 * single demo store proves nothing. They are deliberately styled as different
 * businesses — different palette, different photography, different voice,
 * different currency. Every accent carries white text, which is what the
 * storefront's buttons put on it.
 *
 * `imageQuery` is used by `scripts/fetch-seed-images.ts` to pull real,
 * openly-licensed photography into `prisma/seed-images.json`. The seed reads
 * that file rather than hitting the network, so seeding is deterministic and
 * works offline.
 */

import { US_STATES } from "../src/lib/address/regions";
import { SHOWCASE_STORES } from "./seed-catalog-showcase";

export type SeedVariant = {
  title: string;
  sku: string;
  priceCents: number;
  compareAtPriceCents?: number;
  inventoryQty: number;
  /** Overrides the product's weight for this option. */
  weightGrams?: number;
};

export type SeedProduct = {
  slug: string;
  title: string;
  description: string;
  imageQuery: string;
  collections: string[];
  /** Shipping weight of each option, packaging included. */
  weightGrams: number;
  /** False for a service: nothing to ship. */
  requiresShipping?: boolean;
  /** Photograph it with another seeded image, by its key in seed-images.json. */
  imageFrom?: string;
  variants: SeedVariant[];
};

export type SeedDiscount = {
  code: string | null;
  title: string;
  type: "PERCENTAGE" | "FIXED_AMOUNT" | "FREE_SHIPPING" | "BUY_X_GET_Y";
  /**
   * Basis points for PERCENTAGE and BUY_X_GET_Y (10000 = free), cents for
   * FIXED_AMOUNT, 0 for FREE_SHIPPING.
   */
  value: number;
  minSubtotalCents?: number;
  minQuantity?: number;
  appliesTo?: "ALL" | "COLLECTION" | "PRODUCT";
  /** Collection slug when appliesTo = COLLECTION. For BXGY, what the buyer gets. */
  targetCollection?: string;
  /** BUY_X_GET_Y only. */
  buy?: {
    quantity: number;
    getQuantity: number;
    /** Collection slug the buyer buys from; omitted means any product. */
    fromCollection?: string;
    maxUsesPerOrder?: number;
  };
  segments?: ("FIRST_TIME" | "RETURNING" | "LOYAL" | "LAPSED" | "ACCOUNT_HOLDERS")[];
  usageLimit?: number;
  perCustomerLimit?: number;
  combinable?: boolean;
  startsAt?: string;
  endsAt?: string;
  active?: boolean;
};

/** A rate's estimate and condition as [min, max] pairs; null leaves a side open. */
export type SeedRate = {
  name: string;
  priceCents: number;
  days?: [number, number];
  subtotalCents?: [number | null, number | null];
  weightGrams?: [number | null, number | null];
};

export type SeedZone = {
  name: string;
  restOfWorld?: true;
  /** A country code, or a country narrowed to some of its regions. */
  countries: (string | { code: string; regions: readonly string[] })[];
  rates: SeedRate[];
};

/** Cash on delivery, as Settings → Payments saves it. */
export type SeedCod = {
  label?: string;
  instructions?: string;
  /** Cents for FIXED_AMOUNT, basis points of the order total for PERCENTAGE. */
  fee: { type: "FIXED_AMOUNT" | "PERCENTAGE"; value: number };
  /** Bounds on goods and shipping after discounts, before the fee. */
  minTotalCents?: number;
  maxTotalCents?: number;
  /** Omitted: everywhere the store ships. */
  countries?: string[];
  requirePhone?: boolean;
};

export type SeedStore = {
  slug: string;
  name: string;
  description: string;
  /** ISO 4217. Prices below are cents of it. */
  currency: string;
  contactEmail: string;
  checkout: {
    phone: "HIDDEN" | "OPTIONAL" | "REQUIRED";
    company: "HIDDEN" | "OPTIONAL" | "REQUIRED";
    firstName: "OPTIONAL" | "REQUIRED";
    address2: "HIDDEN" | "OPTIONAL";
    marketingOptIn: boolean;
    orderNote: boolean;
  };
  /**
   * Omitted leaves the store's cash-on-delivery settings as its owner set
   * them. Given, it is enabled as described, and seeded orders it would take
   * are paid that way.
   */
  cod?: SeedCod;
  zones: SeedZone[];
  accentColor: string;
  bannerQuery: string;
  logoQuery: string;
  commissionBps: number;
  owner: { email: string; name: string };
  collections: { slug: string; title: string; description: string }[];
  products: SeedProduct[];
  discounts: SeedDiscount[];
};

export const SEED_PASSWORD = "tender-demo-2026";

export const PLATFORM_ADMIN = {
  email: "admin@example.com",
  name: "Platform Admin",
};

/** The contiguous United States and DC: every state but Alaska and Hawaii. */
const CONTIGUOUS_US = US_STATES.map((state) => state.code).filter(
  (code) => code !== "AK" && code !== "HI",
);

const nordhavn: SeedStore = {
  slug: "nordhavn-supply",
  name: "Nordhavn Supply",
  description:
    "Hard-wearing outdoor kit for cold, wet places. Made in small runs, built to be repaired rather than replaced.",
  currency: "USD",
  contactEmail: "hello@nordhavn.example",
  // Heavy parcels go by courier, who calls ahead; plenty of orders are for
  // outdoor clubs and guiding companies.
  checkout: {
    phone: "REQUIRED",
    company: "OPTIONAL",
    firstName: "OPTIONAL",
    address2: "OPTIONAL",
    marketingOptIn: true,
    orderNote: false,
  },
  zones: [
    {
      name: "Nordics",
      countries: ["NO", "SE", "DK", "FI", "IS"],
      rates: [
        { name: "Standard", priceCents: 900, days: [2, 4] },
        { name: "Express", priceCents: 1900, days: [1, 2] },
      ],
    },
    {
      name: "Europe",
      countries: ["GB", "IE", "DE", "FR", "NL", "BE", "AT", "CH", "PT", "ES", "IT", "CZ", "PL"],
      rates: [
        { name: "Standard", priceCents: 1500, days: [3, 6], weightGrams: [null, 2000] },
        { name: "Standard (heavy)", priceCents: 2900, days: [4, 7], weightGrams: [2001, 20000] },
        { name: "Express", priceCents: 3900, days: [1, 3], weightGrams: [null, 20000] },
      ],
    },
    {
      // Alaska and Hawaii need a different carrier contract.
      name: "North America",
      countries: [{ code: "US", regions: CONTIGUOUS_US }, "CA"],
      rates: [
        { name: "Standard", priceCents: 2400, days: [5, 8] },
        { name: "Express", priceCents: 4500, days: [2, 4] },
      ],
    },
    {
      // Only worth the freight on a decent-sized order — and the demo's
      // "no shipping options" case: a small cart to Australia has none.
      name: "Australia & New Zealand",
      countries: ["AU", "NZ"],
      rates: [
        { name: "Long-haul economy", priceCents: 3500, days: [10, 20], subtotalCents: [15000, null] },
      ],
    },
  ],
  accentColor: "#14504f",
  bannerQuery: "norwegian fjord mountains landscape",
  logoQuery: "pine forest dark",
  commissionBps: 500,
  owner: { email: "nordhavn@example.com", name: "Ingrid Lund" },
  collections: [
    {
      slug: "outerwear",
      title: "Outerwear",
      description: "Shells, insulation and layers for weather that doesn't let up.",
    },
    {
      slug: "camp-trail",
      title: "Camp & Trail",
      description: "What goes in the pack.",
    },
    {
      slug: "accessories",
      title: "Accessories",
      description: "Small things, made properly.",
    },
  ],
  products: [
    {
      slug: "fjord-shell-jacket",
      title: "Fjord Shell Jacket",
      description:
        "A three-layer waterproof shell with taped seams and pit zips. Cut long at the back for when you're bent into the wind. Every panel is replaceable.",
      imageQuery: "waterproof rain jacket outdoor",
      collections: ["outerwear"],
      weightGrams: 650,
      variants: [
        { title: "S", sku: "NRD-FSJ-S", priceCents: 24900, inventoryQty: 6 },
        { title: "M", sku: "NRD-FSJ-M", priceCents: 24900, inventoryQty: 11 },
        { title: "L", sku: "NRD-FSJ-L", priceCents: 24900, inventoryQty: 8 },
        { title: "XL", sku: "NRD-FSJ-XL", priceCents: 24900, inventoryQty: 0 },
      ],
    },
    {
      slug: "merino-base-layer",
      title: "Merino Base Layer Crew",
      description:
        "200gsm merino from a mulesing-free flock. Warm when wet, and it doesn't start to smell on day three.",
      imageQuery: "merino wool sweater clothing",
      collections: ["outerwear"],
      weightGrams: 220,
      variants: [
        { title: "S", sku: "NRD-MBL-S", priceCents: 8900, inventoryQty: 14 },
        { title: "M", sku: "NRD-MBL-M", priceCents: 8900, inventoryQty: 22 },
        { title: "L", sku: "NRD-MBL-L", priceCents: 8900, inventoryQty: 3 },
      ],
    },
    {
      slug: "waxed-canvas-rucksack",
      title: "Waxed Canvas Rucksack",
      description:
        "28 litres of waxed cotton duck with a roll-top closure and bridle leather straps. Re-wax it once a year and it will outlast you.",
      imageQuery: "canvas backpack rucksack",
      collections: ["camp-trail", "accessories"],
      weightGrams: 1400,
      variants: [
        {
          title: "One size",
          sku: "NRD-WCR-OS",
          priceCents: 15900,
          compareAtPriceCents: 18900,
          inventoryQty: 9,
        },
      ],
    },
    {
      slug: "wool-watch-cap",
      title: "Wool Watch Cap",
      description:
        "Ribbed lambswool, knitted on a hundred-year-old machine in Yorkshire. Turn the cuff once or twice.",
      imageQuery: "knitted wool beanie hat",
      collections: ["accessories"],
      weightGrams: 90,
      variants: [
        { title: "Charcoal", sku: "NRD-WWC-CH", priceCents: 3400, inventoryQty: 30 },
        { title: "Oatmeal", sku: "NRD-WWC-OA", priceCents: 3400, inventoryQty: 18 },
      ],
    },
    {
      slug: "enamel-camp-mug",
      title: "Enamel Camp Mug",
      description:
        "Porcelain enamel over heavy steel. It will chip, and the chips are the point.",
      imageQuery: "enamel camping mug",
      collections: ["camp-trail"],
      weightGrams: 260,
      variants: [
        { title: "Cream", sku: "NRD-ECM-CR", priceCents: 1800, inventoryQty: 42 },
        { title: "Navy", sku: "NRD-ECM-NV", priceCents: 1800, inventoryQty: 27 },
      ],
    },
    {
      slug: "trail-insulated-flask",
      title: "Trail Insulated Flask",
      description:
        "Vacuum-walled stainless steel. Twelve hours hot, twenty-four cold, tested in a Bergen January.",
      imageQuery: "stainless steel thermos flask",
      collections: ["camp-trail"],
      weightGrams: 480,
      variants: [
        { title: "500 ml", sku: "NRD-TIF-500", priceCents: 3900, inventoryQty: 16 },
        { title: "750 ml", sku: "NRD-TIF-750", priceCents: 4600, inventoryQty: 12 },
      ],
    },
    {
      slug: "ridgeline-hiking-socks",
      title: "Ridgeline Hiking Socks",
      description:
        "Three pairs. Cushioned heel and forefoot, flat toe seam, merino-nylon blend that survives the washing machine.",
      imageQuery: "wool hiking socks",
      collections: ["camp-trail", "accessories"],
      weightGrams: 110,
      variants: [
        { title: "S", sku: "NRD-RHS-S", priceCents: 2200, inventoryQty: 25 },
        { title: "M", sku: "NRD-RHS-M", priceCents: 2200, inventoryQty: 31 },
        { title: "L", sku: "NRD-RHS-L", priceCents: 2200, inventoryQty: 19 },
      ],
    },
    {
      slug: "storm-gloves",
      title: "Storm Gloves",
      description:
        "Goat leather palm, softshell back, fleece lining. Dexterous enough to work a stove.",
      imageQuery: "leather winter gloves",
      collections: ["outerwear", "accessories"],
      weightGrams: 180,
      variants: [
        { title: "S", sku: "NRD-STG-S", priceCents: 5400, inventoryQty: 7 },
        { title: "M", sku: "NRD-STG-M", priceCents: 5400, inventoryQty: 13 },
        { title: "L", sku: "NRD-STG-L", priceCents: 5400, inventoryQty: 0 },
      ],
    },
    {
      slug: "birch-handle-axe",
      title: "Birch Handle Axe",
      description:
        "Hand-forged Swedish head on a steam-bent birch haft. Comes sharp and with a vegetable-tanned sheath.",
      imageQuery: "hand forged axe wooden handle",
      collections: ["camp-trail"],
      weightGrams: 1200,
      variants: [
        { title: "One size", sku: "NRD-BHA-OS", priceCents: 11900, inventoryQty: 5 },
      ],
    },
    {
      slug: "packable-down-vest",
      title: "Packable Down Vest",
      description:
        "700-fill responsible down in a ripstop shell. Stuffs into its own chest pocket, about the size of a grapefruit.",
      imageQuery: "quilted down vest gilet",
      collections: ["outerwear"],
      weightGrams: 340,
      variants: [
        { title: "S", sku: "NRD-PDV-S", priceCents: 17900, inventoryQty: 4 },
        { title: "M", sku: "NRD-PDV-M", priceCents: 17900, inventoryQty: 9 },
        { title: "L", sku: "NRD-PDV-L", priceCents: 17900, inventoryQty: 6 },
      ],
    },
    {
      slug: "canvas-field-trousers",
      title: "Canvas Field Trousers",
      description:
        "12oz organic cotton canvas with articulated knees and a gusseted crotch. They soften after a month and never really wear out.",
      imageQuery: "canvas work trousers pants",
      collections: ["outerwear"],
      weightGrams: 620,
      variants: [
        { title: "30", sku: "NRD-CFT-30", priceCents: 12900, inventoryQty: 8 },
        { title: "32", sku: "NRD-CFT-32", priceCents: 12900, inventoryQty: 15 },
        { title: "34", sku: "NRD-CFT-34", priceCents: 12900, inventoryQty: 11 },
        { title: "36", sku: "NRD-CFT-36", priceCents: 12900, inventoryQty: 2 },
      ],
    },
    {
      slug: "alpine-headlamp",
      title: "Alpine Headlamp",
      description:
        "400 lumens, red night mode, USB-C. Freeze-tolerant cell and a strap you can actually adjust wearing gloves.",
      imageQuery: "headlamp head torch outdoor",
      collections: ["camp-trail"],
      weightGrams: 120,
      variants: [
        { title: "One size", sku: "NRD-ALH-OS", priceCents: 4900, inventoryQty: 21 },
      ],
    },
    {
      slug: "cotton-ripstop-shirt",
      title: "Cotton Ripstop Shirt",
      description:
        "A shirt that behaves like a light jacket. Two bellows pockets, horn buttons, cut to layer over a base.",
      imageQuery: "cotton flannel work shirt",
      collections: ["outerwear"],
      weightGrams: 300,
      variants: [
        { title: "S", sku: "NRD-CRS-S", priceCents: 9800, inventoryQty: 10 },
        { title: "M", sku: "NRD-CRS-M", priceCents: 9800, inventoryQty: 17 },
        { title: "L", sku: "NRD-CRS-L", priceCents: 9800, inventoryQty: 12 },
      ],
    },
    {
      slug: "bridle-leather-belt",
      title: "Bridle Leather Belt",
      description:
        "English bridle leather, solid brass buckle, stitched not riveted. It takes a season to break in.",
      imageQuery: "leather belt brass buckle",
      collections: ["accessories"],
      weightGrams: 260,
      variants: [
        { title: '32"', sku: "NRD-BLB-32", priceCents: 7400, inventoryQty: 6 },
        { title: '34"', sku: "NRD-BLB-34", priceCents: 7400, inventoryQty: 9 },
        { title: '36"', sku: "NRD-BLB-36", priceCents: 7400, inventoryQty: 4 },
      ],
    },
    {
      slug: "folding-camp-stool",
      title: "Folding Camp Stool",
      description:
        "Ash frame, canvas seat, three legs so it never wobbles on rock. Weighs 900 grams.",
      imageQuery: "folding wooden camp stool",
      collections: ["camp-trail"],
      weightGrams: 1100,
      variants: [
        { title: "One size", sku: "NRD-FCS-OS", priceCents: 6900, inventoryQty: 13 },
      ],
    },
  ],
  discounts: [
    {
      code: "WELCOME10",
      title: "10% off your first order",
      type: "PERCENTAGE",
      value: 1000,
      segments: ["FIRST_TIME"],
      perCustomerLimit: 1,
    },
    {
      code: "LAYERUP",
      title: "$20 off outerwear over $150",
      type: "FIXED_AMOUNT",
      value: 2000,
      minSubtotalCents: 15000,
      appliesTo: "COLLECTION",
      targetCollection: "outerwear",
    },
    {
      code: null,
      title: "Free shipping over $100",
      type: "FREE_SHIPPING",
      value: 0,
      minSubtotalCents: 10000,
      combinable: true,
    },
    {
      code: null,
      title: "Camp & trail: buy 2, get the cheapest free",
      type: "BUY_X_GET_Y",
      value: 10000,
      appliesTo: "COLLECTION",
      targetCollection: "camp-trail",
      buy: { quantity: 2, getQuantity: 1, fromCollection: "camp-trail", maxUsesPerOrder: 1 },
      combinable: true,
    },
  ],
};

const rosewater: SeedStore = {
  slug: "rosewater-ceramics",
  name: "Rosewater Ceramics",
  description:
    "Small-batch stoneware, thrown and glazed by hand in a Lisbon studio. No two pieces come out quite the same.",
  currency: "EUR",
  contactEmail: "studio@rosewater.example",
  checkout: {
    phone: "OPTIONAL",
    company: "HIDDEN",
    firstName: "REQUIRED",
    address2: "OPTIONAL",
    marketingOptIn: true,
    // Gift notes and "please leave with a neighbour".
    orderNote: true,
  },
  zones: [
    {
      name: "Portugal",
      countries: ["PT"],
      rates: [
        { name: "CTT Standard", priceCents: 490, days: [2, 4] },
        { name: "CTT Expresso", priceCents: 990, days: [1, 1] },
      ],
    },
    {
      name: "European Union",
      countries: [
        "ES", "FR", "DE", "IT", "NL", "BE", "LU", "AT", "IE",
        "DK", "SE", "FI", "CZ", "PL", "GR", "HR", "SI", "SK",
      ],
      rates: [
        { name: "Standard", priceCents: 1200, days: [3, 7], weightGrams: [null, 2000] },
        { name: "Standard", priceCents: 1900, days: [3, 7], weightGrams: [2001, 5000] },
        { name: "Standard", priceCents: 3200, days: [4, 8], weightGrams: [5001, 20000] },
      ],
    },
    {
      // Stoneware is heavy and breakable; past 10 kg it goes by quote.
      name: "Rest of world",
      restOfWorld: true,
      countries: [],
      rates: [
        { name: "International tracked", priceCents: 3500, days: [7, 14], weightGrams: [null, 10000] },
      ],
    },
  ],
  accentColor: "#b4552d",
  bannerQuery: "pottery studio wheel clay",
  logoQuery: "terracotta clay texture",
  commissionBps: 700,
  owner: { email: "rosewater@example.com", name: "Marta Oliveira" },
  collections: [
    {
      slug: "tableware",
      title: "Tableware",
      description: "Plates, bowls and serving pieces for everyday use.",
    },
    {
      slug: "drinkware",
      title: "Drinkware",
      description: "Mugs, cups and tumblers.",
    },
    {
      slug: "home",
      title: "Home",
      description: "Vases, planters and objects for the rest of the house.",
    },
  ],
  products: [
    {
      slug: "speckled-stoneware-mug",
      title: "Speckled Stoneware Mug",
      description:
        "300ml, thrown from an iron-flecked local clay and glazed inside only. The unglazed foot keeps its warmth in your hand.",
      imageQuery: "handmade ceramic mug pottery",
      collections: ["drinkware"],
      weightGrams: 380,
      variants: [
        { title: "Cream", sku: "RSW-SSM-CR", priceCents: 2800, inventoryQty: 24 },
        { title: "Slate", sku: "RSW-SSM-SL", priceCents: 2800, inventoryQty: 16 },
      ],
    },
    {
      slug: "ash-glaze-dinner-plate",
      title: "Ash Glaze Dinner Plate",
      description:
        "A wood-ash glaze that pools green in the well and breaks rust-brown at the rim. Every plate fires differently.",
      imageQuery: "ceramic dinner plate handmade",
      collections: ["tableware"],
      weightGrams: 720,
      variants: [
        { title: "22 cm", sku: "RSW-AGP-22", priceCents: 3600, inventoryQty: 18 },
        { title: "27 cm", sku: "RSW-AGP-27", priceCents: 4400, inventoryQty: 12 },
      ],
    },
    {
      slug: "terracotta-planter",
      title: "Terracotta Planter",
      description:
        "Unglazed outside so the clay can breathe, sealed inside so your table doesn't. Drainage hole and saucer included.",
      imageQuery: "terracotta plant pot planter",
      collections: ["home"],
      weightGrams: 1800,
      variants: [
        { title: "Small", sku: "RSW-TCP-S", priceCents: 2400, inventoryQty: 20 },
        { title: "Medium", sku: "RSW-TCP-M", priceCents: 3400, inventoryQty: 14 },
        { title: "Large", sku: "RSW-TCP-L", priceCents: 4800, inventoryQty: 0 },
      ],
    },
    {
      slug: "large-serving-bowl",
      title: "Large Serving Bowl",
      description:
        "Two and a half litres. Wide enough for a whole salad, heavy enough to stay put while you toss it.",
      imageQuery: "ceramic serving bowl stoneware",
      collections: ["tableware"],
      weightGrams: 1600,
      variants: [
        { title: "One size", sku: "RSW-LSB-OS", priceCents: 6800, inventoryQty: 7 },
      ],
    },
    {
      slug: "pour-over-coffee-set",
      title: "Pour-Over Coffee Set",
      description:
        "A ceramic cone and matching carafe. The cone takes a standard 02 paper filter and sits flush on the neck.",
      imageQuery: "ceramic pour over coffee dripper",
      collections: ["drinkware"],
      weightGrams: 1250,
      variants: [
        {
          title: "One size",
          sku: "RSW-POS-OS",
          priceCents: 8900,
          compareAtPriceCents: 10400,
          inventoryQty: 5,
        },
      ],
    },
    {
      slug: "matte-black-vase",
      title: "Matte Black Vase",
      description:
        "A tall, narrow form in a satin black glaze. Holds a single branch better than it holds a bouquet.",
      imageQuery: "black ceramic vase minimal",
      collections: ["home"],
      weightGrams: 900,
      variants: [
        { title: "One size", sku: "RSW-MBV-OS", priceCents: 5400, inventoryQty: 9 },
      ],
    },
    {
      slug: "stoneware-butter-dish",
      title: "Stoneware Butter Dish",
      description:
        "Takes a 250g block with the lid on. Keeps butter spreadable on the counter for about a week.",
      imageQuery: "ceramic butter dish lid",
      collections: ["tableware"],
      weightGrams: 650,
      variants: [
        { title: "One size", sku: "RSW-SBD-OS", priceCents: 3200, inventoryQty: 11 },
      ],
    },
    {
      slug: "espresso-cups-pair",
      title: "Espresso Cups, Pair",
      description:
        "70ml each, thick-walled so the shot holds its heat. Sold as a pair because one is never enough.",
      imageQuery: "espresso cup ceramic small",
      collections: ["drinkware"],
      weightGrams: 300,
      variants: [
        { title: "One size", sku: "RSW-ECP-OS", priceCents: 3800, inventoryQty: 15 },
      ],
    },
    {
      slug: "hand-thrown-teapot",
      title: "Hand-Thrown Teapot",
      description:
        "800ml with a built-in strainer and a cane handle. The spout is cut and tuned by hand so it doesn't drip.",
      imageQuery: "ceramic teapot handmade pottery",
      collections: ["drinkware", "tableware"],
      weightGrams: 1100,
      variants: [
        { title: "One size", sku: "RSW-HTT-OS", priceCents: 9600, inventoryQty: 4 },
      ],
    },
    {
      slug: "glazed-soap-dish",
      title: "Glazed Soap Dish",
      description:
        "Ridged base so the bar drains and dries. A small thing that noticeably extends the life of good soap.",
      imageQuery: "ceramic soap dish bathroom",
      collections: ["home"],
      weightGrams: 220,
      variants: [
        { title: "One size", sku: "RSW-GSD-OS", priceCents: 1900, inventoryQty: 28 },
      ],
    },
    {
      slug: "ribbed-tumbler",
      title: "Ribbed Tumbler",
      description:
        "350ml, thrown with a rib tool to leave a spiral you can feel. Stacks two high.",
      imageQuery: "ceramic tumbler cup handmade",
      collections: ["drinkware"],
      weightGrams: 280,
      variants: [
        { title: "Set of 2", sku: "RSW-RBT-2", priceCents: 3200, inventoryQty: 17 },
        { title: "Set of 4", sku: "RSW-RBT-4", priceCents: 6000, inventoryQty: 8 },
      ],
    },
    {
      slug: "salt-cellar",
      title: "Salt Cellar",
      description:
        "A pinch pot with a lid that sits at an angle so you can get a thumb and finger in without taking it off.",
      imageQuery: "small ceramic bowl salt",
      collections: ["tableware"],
      weightGrams: 250,
      variants: [
        { title: "One size", sku: "RSW-SCL-OS", priceCents: 2200, inventoryQty: 22 },
      ],
    },
    {
      slug: "utensil-crock",
      title: "Utensil Crock",
      description:
        "Wide and heavy-bottomed, so it doesn't tip when you pull a wooden spoon out one-handed.",
      imageQuery: "ceramic utensil holder crock kitchen",
      collections: ["home", "tableware"],
      weightGrams: 950,
      variants: [
        { title: "One size", sku: "RSW-UCK-OS", priceCents: 4600, inventoryQty: 10 },
      ],
    },
    {
      slug: "bud-vase",
      title: "Bud Vase",
      description:
        "Ten centimetres tall with a narrow neck. Made for one stem from the garden, not a florist's bunch.",
      imageQuery: "small ceramic bud vase flower",
      collections: ["home"],
      weightGrams: 260,
      variants: [
        { title: "One size", sku: "RSW-BDV-OS", priceCents: 2600, inventoryQty: 26 },
      ],
    },
    {
      slug: "stoneware-baking-dish",
      title: "Stoneware Baking Dish",
      description:
        "Oven to table, 28cm. Holds heat long enough that a gratin is still bubbling when it reaches the table.",
      imageQuery: "ceramic baking dish stoneware oven",
      collections: ["tableware"],
      weightGrams: 2100,
      variants: [
        { title: "One size", sku: "RSW-SBK-OS", priceCents: 7400, inventoryQty: 6 },
      ],
    },
    {
      // A service, not a parcel: checkout skips delivery for it.
      slug: "wheel-throwing-taster-class",
      title: "Wheel-throwing Taster Class",
      description:
        "Two hours at the wheel in the Lisbon studio, clay and glazing included. Your best piece is fired and ready to collect three weeks later.",
      imageQuery: "pottery wheel class hands clay",
      imageFrom: "store:rosewater-ceramics:banner",
      collections: [],
      weightGrams: 0,
      requiresShipping: false,
      variants: [
        { title: "Saturday morning", sku: "RSW-WTC-SAT", priceCents: 6500, inventoryQty: 8 },
        { title: "Weekday evening", sku: "RSW-WTC-EVE", priceCents: 5500, inventoryQty: 12 },
      ],
    },
  ],
  discounts: [
    {
      // Deliberately the same code as Nordhavn's, with a different value.
      // Two stores owning `WELCOME10` independently is the composite-unique
      // constraint doing its job, and it is the first isolation test to write.
      code: "WELCOME10",
      title: "15% off your first order",
      type: "PERCENTAGE",
      value: 1500,
      segments: ["FIRST_TIME"],
      perCustomerLimit: 1,
    },
    {
      code: "COMEBACK20",
      title: "20% off to welcome lapsed customers back",
      type: "PERCENTAGE",
      value: 2000,
      segments: ["LAPSED"],
      perCustomerLimit: 1,
    },
    {
      code: null,
      title: "10% off 4 or more tableware pieces",
      type: "PERCENTAGE",
      value: 1000,
      appliesTo: "COLLECTION",
      targetCollection: "tableware",
      minQuantity: 4,
      combinable: true,
    },
    {
      code: "SECONDS",
      title: "€5 off studio seconds",
      type: "FIXED_AMOUNT",
      value: 500,
      usageLimit: 50,
    },
    {
      code: "EXPIRED2025",
      title: "Expired holiday promotion",
      type: "PERCENTAGE",
      value: 2000,
      startsAt: "2025-12-01T00:00:00Z",
      endsAt: "2026-01-01T00:00:00Z",
      active: false,
    },
  ],
};

const wildmoor: SeedStore = {
  slug: "wildmoor-apothecary",
  name: "Wildmoor Apothecary",
  description:
    "Soaps, balms and candles made in small batches in a Yorkshire mill town. Plant oils, essential oils, and nothing on the label you'd need to look up.",
  currency: "GBP",
  contactEmail: "hello@wildmoor.example",
  // Most orders are gifts: a name for the card, and a note for the message.
  checkout: {
    phone: "OPTIONAL",
    company: "HIDDEN",
    firstName: "REQUIRED",
    address2: "OPTIONAL",
    marketingOptIn: true,
    orderNote: true,
  },
  cod: {
    // The courier that collects payment only works inside the UK.
    fee: { type: "FIXED_AMOUNT", value: 150 },
    countries: ["GB"],
    instructions: "Pay the courier when your parcel arrives — cash or card on the doorstep.",
  },
  zones: [
    {
      name: "United Kingdom",
      countries: ["GB"],
      rates: [
        { name: "Royal Mail 2nd Class", priceCents: 320, days: [2, 3], weightGrams: [null, 2000] },
        { name: "Royal Mail Tracked 24", priceCents: 550, days: [1, 1], weightGrams: [null, 2000] },
        { name: "Parcel courier", priceCents: 790, days: [1, 2], weightGrams: [2001, null] },
      ],
    },
    {
      name: "Europe",
      countries: ["IE", "FR", "DE", "NL", "BE", "LU", "ES", "PT", "IT", "AT", "DK", "SE"],
      rates: [
        { name: "International Tracked", priceCents: 950, days: [4, 8], weightGrams: [null, 2000] },
        { name: "International Tracked", priceCents: 1650, days: [5, 9], weightGrams: [2001, null] },
      ],
    },
    {
      name: "Rest of world",
      restOfWorld: true,
      countries: [],
      rates: [
        { name: "International Tracked", priceCents: 1495, days: [7, 14], weightGrams: [null, 2000] },
        { name: "International Tracked", priceCents: 2495, days: [7, 14], weightGrams: [2001, null] },
      ],
    },
  ],
  accentColor: "#6d4c74",
  bannerQuery: "heather moorland yorkshire",
  logoQuery: "dried lavender bunch",
  commissionBps: 600,
  owner: { email: "wildmoor@example.com", name: "Harriet Ashworth" },
  collections: [
    {
      slug: "skin",
      title: "Skin",
      description: "Balms, oils and creams for faces, hands and everything between.",
    },
    {
      slug: "bath",
      title: "Bath & Body",
      description: "Soaps and soaks, cured slowly and wrapped in paper.",
    },
    {
      slug: "home-scent",
      title: "Home Scent",
      description: "Candles, mists and diffusers for the rest of the house.",
    },
  ],
  products: [
    {
      slug: "oat-honey-soap",
      title: "Oat & Honey Soap",
      description:
        "Cold-process, cured for six weeks, with colloidal oats and honey from hives two fields over. Gentle enough for a baby's bath, which is how it started.",
      imageQuery: "handmade soap bars oatmeal",
      collections: ["bath"],
      weightGrams: 150,
      variants: [
        { title: "Single bar", sku: "WLD-OHS-1", priceCents: 750, inventoryQty: 40 },
        { title: "Three bars", sku: "WLD-OHS-3", priceCents: 1950, inventoryQty: 14, weightGrams: 420 },
      ],
    },
    {
      slug: "seaweed-sea-salt-soap",
      title: "Seaweed & Sea Salt Soap",
      description:
        "Hand-gathered bladderwrack from the Northumberland coast and a scrub of fine sea salt. Smells like a walk on the beach at Bamburgh in October.",
      imageQuery: "natural soap bar sea salt",
      collections: ["bath"],
      weightGrams: 150,
      variants: [
        { title: "Single bar", sku: "WLD-SSS-1", priceCents: 750, inventoryQty: 32 },
      ],
    },
    {
      slug: "lavender-body-balm",
      title: "Lavender Body Balm",
      description:
        "Shea, cocoa butter and lavender oil we distil ourselves. Melts on contact; a pea-sized amount does both elbows.",
      imageQuery: "lavender balm tin skincare",
      collections: ["skin"],
      weightGrams: 120,
      variants: [
        { title: "60 ml", sku: "WLD-LBB-60", priceCents: 1600, inventoryQty: 22 },
        { title: "120 ml", sku: "WLD-LBB-120", priceCents: 2600, inventoryQty: 9, weightGrams: 200 },
      ],
    },
    {
      slug: "rosehip-face-oil",
      title: "Rosehip Face Oil",
      description:
        "Cold-pressed rosehip and sea buckthorn in violet glass, which keeps the oil from spoiling in the light. Three drops, morning or night.",
      imageQuery: "face oil dropper bottle",
      collections: ["skin"],
      weightGrams: 110,
      variants: [
        { title: "30 ml", sku: "WLD-RFO-30", priceCents: 2400, inventoryQty: 15 },
      ],
    },
    {
      slug: "calendula-hand-cream",
      title: "Calendula Hand Cream",
      description:
        "For hands that garden, wash up or work outdoors. Sinks in within a minute, so you can pick up your phone without leaving a print.",
      imageQuery: "hand cream natural cosmetics",
      collections: ["skin", "bath"],
      weightGrams: 110,
      variants: [
        { title: "75 ml", sku: "WLD-CHC-75", priceCents: 1200, inventoryQty: 30 },
      ],
    },
    {
      slug: "beeswax-lip-balm",
      title: "Beeswax Lip Balm",
      description:
        "Beeswax, sweet almond oil and very little else. In a cardboard tube that goes on the compost when it's done.",
      imageQuery: "beeswax lip balm",
      collections: ["skin"],
      weightGrams: 30,
      variants: [
        { title: "Peppermint", sku: "WLD-BLB-PM", priceCents: 450, inventoryQty: 60 },
        { title: "Rose", sku: "WLD-BLB-RS", priceCents: 450, inventoryQty: 41 },
        { title: "Unscented", sku: "WLD-BLB-UN", priceCents: 450, inventoryQty: 0 },
      ],
    },
    {
      slug: "magnesium-bath-salts",
      title: "Magnesium Bath Salts",
      description:
        "Epsom and Dead Sea salts with rosemary and eucalyptus, for legs after a long walk over the tops.",
      imageQuery: "bath salts jar",
      collections: ["bath"],
      weightGrams: 600,
      variants: [
        { title: "500 g", sku: "WLD-MBS-500", priceCents: 1400, inventoryQty: 18 },
      ],
    },
    {
      slug: "bergamot-cedar-candle",
      title: "Bergamot & Cedar Candle",
      description:
        "Rapeseed wax poured into amber glass, with a cotton wick that burns clean to the last centimetre. About forty hours in the large size.",
      imageQuery: "candle amber glass jar",
      collections: ["home-scent"],
      weightGrams: 450,
      variants: [
        { title: "180 g", sku: "WLD-BCC-180", priceCents: 2200, inventoryQty: 20 },
        { title: "300 g", sku: "WLD-BCC-300", priceCents: 3200, inventoryQty: 11, weightGrams: 700 },
      ],
    },
    {
      slug: "fig-leaf-candle",
      title: "Fig Leaf Candle",
      description:
        "Green fig, blackcurrant leaf and a little vetiver. The one we keep lit in the shop.",
      imageQuery: "scented candle burning",
      collections: ["home-scent"],
      weightGrams: 450,
      variants: [
        { title: "180 g", sku: "WLD-FLC-180", priceCents: 2200, inventoryQty: 16 },
      ],
    },
    {
      slug: "lavender-pillow-mist",
      title: "Lavender Pillow Mist",
      description:
        "Lavender, Roman chamomile and cedarwood in a water base that won't mark cotton. Two sprays on the pillow, then put your phone in the other room.",
      imageQuery: "lavender spray bottle",
      collections: ["home-scent"],
      weightGrams: 180,
      variants: [
        { title: "100 ml", sku: "WLD-LPM-100", priceCents: 1100, inventoryQty: 25 },
      ],
    },
    {
      slug: "wild-mint-reed-diffuser",
      title: "Wild Mint Reed Diffuser",
      description:
        "Spearmint, basil and lime with rattan reeds. Turn the reeds once a week and a bottle lasts about three months.",
      imageQuery: "reed diffuser bottle",
      collections: ["home-scent"],
      weightGrams: 480,
      variants: [
        {
          title: "100 ml",
          sku: "WLD-WMD-100",
          priceCents: 2800,
          compareAtPriceCents: 3400,
          inventoryQty: 8,
        },
      ],
    },
    {
      slug: "konjac-facial-sponge",
      title: "Konjac Facial Sponge",
      description:
        "Made from the root of the konjac plant. Soft when wet, gentle enough for every day, and compostable after its couple of months.",
      imageQuery: "konjac sponge",
      collections: ["skin", "bath"],
      weightGrams: 40,
      variants: [
        { title: "One size", sku: "WLD-KJS-OS", priceCents: 600, inventoryQty: 35 },
      ],
    },
    {
      slug: "shaving-soap-beech-bowl",
      title: "Shaving Soap in Beech Bowl",
      description:
        "A dense, slow lather scented with bay rum and clove. The bowl is turned from Yorkshire beech and outlives the soap by years.",
      imageQuery: "shaving soap bowl brush",
      collections: ["bath"],
      weightGrams: 300,
      variants: [
        { title: "One size", sku: "WLD-SSB-OS", priceCents: 1800, inventoryQty: 10 },
      ],
    },
    {
      slug: "moorland-gift-box",
      title: "The Moorland Gift Box",
      description:
        "Oat & Honey Soap, a 60 ml Lavender Body Balm and a small Bergamot & Cedar Candle, boxed and tied with a handwritten card.",
      imageQuery: "gift box soap candle",
      collections: ["bath", "home-scent"],
      weightGrams: 900,
      variants: [
        {
          title: "One size",
          sku: "WLD-MGB-OS",
          priceCents: 4800,
          compareAtPriceCents: 5550,
          inventoryQty: 12,
        },
      ],
    },
  ],
  discounts: [
    {
      code: "WELCOME10",
      title: "10% off your first order",
      type: "PERCENTAGE",
      value: 1000,
      segments: ["FIRST_TIME"],
      perCustomerLimit: 1,
    },
    {
      code: "THANKYOU15",
      title: "15% off for returning customers",
      type: "PERCENTAGE",
      value: 1500,
      segments: ["RETURNING"],
      perCustomerLimit: 1,
    },
    {
      code: null,
      title: "Free delivery over £40",
      type: "FREE_SHIPPING",
      value: 0,
      minSubtotalCents: 4000,
      combinable: true,
    },
    {
      code: null,
      title: "Bath & body: buy 2, get 1 free",
      type: "BUY_X_GET_Y",
      value: 10000,
      appliesTo: "COLLECTION",
      targetCollection: "bath",
      buy: { quantity: 2, getQuantity: 1, fromCollection: "bath", maxUsesPerOrder: 1 },
      combinable: true,
    },
    {
      code: "MOTHERSDAY",
      title: "Mother's Day: 20% off",
      type: "PERCENTAGE",
      value: 2000,
      startsAt: "2026-03-01T00:00:00Z",
      endsAt: "2026-03-16T00:00:00Z",
    },
  ],
};

const halden: SeedStore = {
  slug: "halden-coffee",
  name: "Halden Coffee Roasters",
  description:
    "Specialty coffee roasted twice a week in Fitzroy, Melbourne. Light enough to taste where it's from, never so light it tastes sour.",
  currency: "AUD",
  contactEmail: "orders@halden.example",
  // Cafés and offices order on standing accounts, under the business name.
  checkout: {
    phone: "OPTIONAL",
    company: "OPTIONAL",
    firstName: "OPTIONAL",
    address2: "OPTIONAL",
    marketingOptIn: true,
    orderNote: false,
  },
  cod: {
    fee: { type: "FIXED_AMOUNT", value: 400 },
    countries: ["AU"],
    // Drivers won't carry more than this in cash.
    maxTotalCents: 40000,
    instructions: "Pay the driver when your coffee arrives. Card or cash — exact change appreciated.",
  },
  zones: [
    {
      name: "Australia",
      countries: ["AU"],
      rates: [
        { name: "Australia Post Parcel", priceCents: 995, days: [2, 6] },
        { name: "Express Post", priceCents: 1495, days: [1, 2] },
      ],
    },
    {
      name: "New Zealand",
      countries: ["NZ"],
      rates: [{ name: "Tracked international", priceCents: 1800, days: [5, 9] }],
    },
    {
      // Further than this and the coffee is stale before it lands.
      name: "South-East Asia",
      countries: ["SG", "MY"],
      rates: [{ name: "Tracked international", priceCents: 2400, days: [6, 12] }],
    },
  ],
  accentColor: "#5a3a24",
  bannerQuery: "coffee roastery roasting beans",
  logoQuery: "roasted coffee beans closeup",
  commissionBps: 500,
  owner: { email: "halden@example.com", name: "Lachlan Reid" },
  collections: [
    {
      slug: "single-origin",
      title: "Single Origin",
      description: "One farm or one washing station, roasted to show it off.",
    },
    {
      slug: "blends",
      title: "Blends",
      description: "Built for espresso and milk, and for tasting the same every week.",
    },
    {
      slug: "brew-gear",
      title: "Brew Gear",
      description: "Grinders, kettles and the small things that make a better cup.",
    },
  ],
  products: [
    {
      slug: "ethiopia-guji-natural",
      title: "Ethiopia Guji Natural",
      description:
        "Dried in the cherry on raised beds at 2,100 metres. Blueberry, jasmine and dark chocolate — best as a filter, wild as an espresso.",
      imageQuery: "coffee beans bag roasted",
      collections: ["single-origin"],
      weightGrams: 300,
      variants: [
        { title: "250 g · Whole bean", sku: "HLD-ETH-250W", priceCents: 2200, inventoryQty: 34 },
        { title: "250 g · Ground for filter", sku: "HLD-ETH-250G", priceCents: 2200, inventoryQty: 18 },
        { title: "1 kg · Whole bean", sku: "HLD-ETH-1KW", priceCents: 7200, inventoryQty: 9, weightGrams: 1100 },
      ],
    },
    {
      slug: "colombia-huila-washed",
      title: "Colombia Huila Washed",
      description:
        "From a co-operative of thirty smallholders near Pitalito. Red apple, panela and cocoa — the coffee we drink most at home.",
      imageQuery: "coffee cherries harvest",
      collections: ["single-origin"],
      weightGrams: 300,
      variants: [
        { title: "250 g · Whole bean", sku: "HLD-COL-250W", priceCents: 2100, inventoryQty: 40 },
        { title: "1 kg · Whole bean", sku: "HLD-COL-1KW", priceCents: 6800, inventoryQty: 12, weightGrams: 1100 },
      ],
    },
    {
      slug: "kenya-nyeri-aa",
      title: "Kenya Nyeri AA",
      description:
        "Blackcurrant, grapefruit and a long, sweet finish. A small lot, roasted until it runs out.",
      imageQuery: "kenya coffee beans",
      collections: ["single-origin"],
      weightGrams: 300,
      variants: [
        { title: "250 g · Whole bean", sku: "HLD-KEN-250W", priceCents: 2500, inventoryQty: 6 },
      ],
    },
    {
      slug: "guatemala-huehuetenango",
      title: "Guatemala Huehuetenango",
      description:
        "Grown in the highlands near the Mexican border. Milk chocolate, almond and orange peel, and forgiving however you brew it.",
      imageQuery: "guatemala coffee farm",
      collections: ["single-origin"],
      weightGrams: 300,
      variants: [
        { title: "250 g · Whole bean", sku: "HLD-GUA-250W", priceCents: 2100, inventoryQty: 22 },
      ],
    },
    {
      slug: "brazil-cerrado-natural",
      title: "Brazil Cerrado Natural",
      description:
        "Hazelnut, caramel and very little acidity. Heavy in the cup and very good with milk.",
      imageQuery: "brazil coffee plantation",
      collections: ["single-origin"],
      weightGrams: 300,
      variants: [
        { title: "250 g · Whole bean", sku: "HLD-BRA-250W", priceCents: 1900, inventoryQty: 28 },
        { title: "1 kg · Whole bean", sku: "HLD-BRA-1KW", priceCents: 6000, inventoryQty: 10, weightGrams: 1100 },
      ],
    },
    {
      slug: "fitzroy-house-blend",
      title: "Fitzroy House Blend",
      description:
        "Brazil and Colombia, roasted a shade darker for espresso. What we pour at the bar: it cuts through milk without tasting burnt.",
      imageQuery: "espresso coffee crema",
      collections: ["blends"],
      weightGrams: 300,
      variants: [
        { title: "250 g · Whole bean", sku: "HLD-FHB-250W", priceCents: 2000, inventoryQty: 50 },
        { title: "1 kg · Whole bean", sku: "HLD-FHB-1KW", priceCents: 6200, inventoryQty: 20, weightGrams: 1100 },
      ],
    },
    {
      slug: "night-shift-decaf",
      title: "Night Shift Decaf",
      description:
        "Decaffeinated in Colombia with sugarcane rather than solvents, so it still tastes like coffee. Brown sugar and red grape.",
      imageQuery: "cup of coffee evening",
      collections: ["blends"],
      weightGrams: 300,
      variants: [
        { title: "250 g · Whole bean", sku: "HLD-NSD-250W", priceCents: 2200, inventoryQty: 15 },
      ],
    },
    {
      slug: "gooseneck-pour-over-kettle",
      title: "Gooseneck Pour-Over Kettle",
      description:
        "One litre of brushed stainless steel with a spout that pours a steady, thin stream. Works on gas, electric and induction.",
      imageQuery: "gooseneck kettle pour over",
      collections: ["brew-gear"],
      weightGrams: 1200,
      variants: [
        {
          title: "One size",
          sku: "HLD-GNK-OS",
          priceCents: 12900,
          compareAtPriceCents: 14900,
          inventoryQty: 7,
        },
      ],
    },
    {
      slug: "burr-hand-grinder",
      title: "Burr Hand Grinder",
      description:
        "Steel conical burrs and forty clicks from espresso to French press. Grinds twenty grams in about thirty seconds.",
      imageQuery: "manual coffee grinder",
      collections: ["brew-gear"],
      weightGrams: 800,
      variants: [
        { title: "One size", sku: "HLD-BHG-OS", priceCents: 18900, inventoryQty: 5 },
      ],
    },
    {
      slug: "stainless-french-press",
      title: "Stainless French Press",
      description:
        "Double-walled, so the last cup is still hot. A fine mesh filter that leaves no grit at the bottom.",
      imageQuery: "french press coffee",
      collections: ["brew-gear"],
      weightGrams: 900,
      variants: [
        { title: "600 ml", sku: "HLD-SFP-600", priceCents: 6900, inventoryQty: 9 },
        { title: "1 L", sku: "HLD-SFP-1L", priceCents: 7900, inventoryQty: 6, weightGrams: 1100 },
      ],
    },
    {
      slug: "paper-filters",
      title: "Paper Filters, 100",
      description:
        "Unbleached cone filters in size 02. Rinse once with hot water and the papery taste goes.",
      imageQuery: "coffee paper filter",
      collections: ["brew-gear"],
      weightGrams: 150,
      variants: [
        { title: "Size 02", sku: "HLD-PPF-100", priceCents: 900, inventoryQty: 80 },
      ],
    },
    {
      slug: "brewing-scale",
      title: "Brewing Scale with Timer",
      description:
        "Reads to a tenth of a gram, times the pour and charges over USB-C. Water-resistant, because it will get wet.",
      imageQuery: "coffee scale digital",
      collections: ["brew-gear"],
      weightGrams: 450,
      variants: [
        { title: "One size", sku: "HLD-BSC-OS", priceCents: 6900, inventoryQty: 11 },
      ],
    },
    {
      slug: "glass-server",
      title: "Glass Server, 600 ml",
      description:
        "Heat-resistant borosilicate with a wooden collar, so you can pour without reaching for a cloth.",
      imageQuery: "glass coffee carafe",
      collections: ["brew-gear"],
      weightGrams: 500,
      variants: [
        { title: "600 ml", sku: "HLD-GLS-600", priceCents: 3900, inventoryQty: 14 },
      ],
    },
    {
      slug: "espresso-tamper",
      title: "58 mm Espresso Tamper",
      description:
        "Stainless base and a walnut handle, weighted so you press level without trying.",
      imageQuery: "espresso tamper",
      collections: ["brew-gear"],
      weightGrams: 600,
      variants: [
        { title: "58 mm", sku: "HLD-EST-58", priceCents: 6500, inventoryQty: 0 },
      ],
    },
  ],
  discounts: [
    {
      code: "FIRSTBREW",
      title: "15% off your first order",
      type: "PERCENTAGE",
      value: 1500,
      segments: ["FIRST_TIME"],
      perCustomerLimit: 1,
    },
    {
      code: "REGULAR10",
      title: "10% off for regulars",
      type: "PERCENTAGE",
      value: 1000,
      segments: ["LOYAL"],
    },
    {
      code: null,
      title: "Free shipping over $60",
      type: "FREE_SHIPPING",
      value: 0,
      minSubtotalCents: 6000,
      combinable: true,
    },
    {
      code: null,
      title: "10% off 3 or more bags of single origin",
      type: "PERCENTAGE",
      value: 1000,
      appliesTo: "COLLECTION",
      targetCollection: "single-origin",
      minQuantity: 3,
      combinable: true,
    },
    {
      code: "GEAR20",
      title: "$20 off brew gear over $150",
      type: "FIXED_AMOUNT",
      value: 2000,
      minSubtotalCents: 15000,
      appliesTo: "COLLECTION",
      targetCollection: "brew-gear",
    },
  ],
};

const marlowe: SeedStore = {
  slug: "marlowe-paper",
  name: "Marlowe Paper Co.",
  description:
    "Notebooks, fountain pens and desk things for people who still write by hand. Packed in a Mile End workshop in Montréal.",
  currency: "CAD",
  contactEmail: "bonjour@marlowe.example",
  // Offices order planners by the box; plenty of orders are gifts with a note.
  checkout: {
    phone: "HIDDEN",
    company: "OPTIONAL",
    firstName: "OPTIONAL",
    address2: "OPTIONAL",
    marketingOptIn: true,
    orderNote: true,
  },
  cod: {
    // A percentage, and a floor: collecting a few dollars isn't worth the trip.
    fee: { type: "PERCENTAGE", value: 300 },
    countries: ["CA"],
    minTotalCents: 2000,
    instructions: "Canada Post collects payment at the door — cash, debit or credit.",
  },
  zones: [
    {
      name: "Canada",
      countries: ["CA"],
      rates: [
        { name: "Canada Post Expedited", priceCents: 1100, days: [2, 6] },
        { name: "Xpresspost", priceCents: 1900, days: [1, 3] },
      ],
    },
    {
      name: "United States",
      countries: ["US"],
      rates: [
        { name: "Tracked Packet USA", priceCents: 1600, days: [4, 8], weightGrams: [null, 2000] },
        { name: "Expedited Parcel USA", priceCents: 2800, days: [3, 7], weightGrams: [2001, null] },
      ],
    },
    {
      name: "Rest of world",
      restOfWorld: true,
      countries: [],
      rates: [
        { name: "Tracked Packet International", priceCents: 2800, days: [7, 21], weightGrams: [null, 2000] },
        { name: "International Parcel", priceCents: 4900, days: [6, 14], weightGrams: [2001, null] },
      ],
    },
  ],
  accentColor: "#1f2f5c",
  bannerQuery: "fountain pen notebook desk",
  logoQuery: "fountain pen nib ink",
  commissionBps: 500,
  owner: { email: "marlowe@example.com", name: "Camille Tremblay" },
  collections: [
    {
      slug: "notebooks",
      title: "Notebooks & Paper",
      description: "Paper that takes fountain-pen ink without feathering or bleeding through.",
    },
    {
      slug: "writing",
      title: "Pens & Ink",
      description: "Fountain pens, pencils and the inks to fill them.",
    },
    {
      slug: "desk",
      title: "Desk",
      description: "Trays, mats and small objects for where the writing happens.",
    },
  ],
  products: [
    {
      slug: "a5-dot-grid-notebook",
      title: "A5 Dot Grid Notebook",
      description:
        "192 pages of 100gsm acid-free paper, thread-sewn so it lies flat from the first page. Takes fountain-pen ink with no ghosting.",
      imageQuery: "dot grid notebook open",
      collections: ["notebooks"],
      weightGrams: 380,
      variants: [
        { title: "Ink Blue", sku: "MRL-A5D-BL", priceCents: 2800, inventoryQty: 30 },
        { title: "Forest", sku: "MRL-A5D-FR", priceCents: 2800, inventoryQty: 18 },
        { title: "Oxblood", sku: "MRL-A5D-OX", priceCents: 2800, inventoryQty: 7 },
      ],
    },
    {
      slug: "pocket-notebooks",
      title: "Pocket Notebooks, Set of 3",
      description:
        "Kraft covers, 48 pages each, staple-bound to fit a back pocket. They look better the more beaten up they get.",
      imageQuery: "pocket notebook kraft",
      collections: ["notebooks"],
      weightGrams: 160,
      variants: [
        { title: "Ruled", sku: "MRL-PKT-RU", priceCents: 1800, inventoryQty: 24 },
        { title: "Plain", sku: "MRL-PKT-PL", priceCents: 1800, inventoryQty: 15 },
        { title: "Grid", sku: "MRL-PKT-GR", priceCents: 1800, inventoryQty: 20 },
      ],
    },
    {
      slug: "linen-bound-journal",
      title: "Linen-Bound Journal",
      description:
        "A hardback in Belgian linen with a ribbon and 240 blank pages. For the long things: a trip, a year, a garden.",
      imageQuery: "linen journal hardcover",
      collections: ["notebooks"],
      weightGrams: 620,
      variants: [
        { title: "One size", sku: "MRL-LBJ-OS", priceCents: 4800, inventoryQty: 12 },
      ],
    },
    {
      slug: "weekly-planner-2027",
      title: "2027 Weekly Planner",
      description:
        "A week across two pages, with room on the right for the lists that don't belong to a day. Starts Monday, 28 December.",
      imageQuery: "weekly planner diary",
      collections: ["notebooks"],
      weightGrams: 450,
      variants: [
        { title: "One size", sku: "MRL-WP27-OS", priceCents: 3600, inventoryQty: 40 },
      ],
    },
    {
      slug: "brass-fountain-pen",
      title: "Brass Fountain Pen",
      description:
        "Machined from solid brass, which darkens to a warm patina in the hand. Steel nib; takes standard international cartridges or a converter.",
      imageQuery: "brass fountain pen",
      collections: ["writing"],
      weightGrams: 120,
      variants: [
        { title: "Fine nib", sku: "MRL-BFP-F", priceCents: 8900, inventoryQty: 9 },
        { title: "Medium nib", sku: "MRL-BFP-M", priceCents: 8900, inventoryQty: 14 },
      ],
    },
    {
      slug: "bottled-ink",
      title: "Bottled Ink, 50 ml",
      description:
        "Mixed in small batches in Québec. Well-behaved on cheap paper, quick to dry and easy to rinse out of a pen.",
      imageQuery: "fountain pen ink bottle",
      collections: ["writing"],
      weightGrams: 200,
      variants: [
        { title: "Midnight", sku: "MRL-INK-MN", priceCents: 1900, inventoryQty: 25 },
        { title: "Sepia", sku: "MRL-INK-SP", priceCents: 1900, inventoryQty: 13 },
        { title: "Black", sku: "MRL-INK-BK", priceCents: 1900, inventoryQty: 31 },
      ],
    },
    {
      slug: "ink-cartridges",
      title: "Ink Cartridges, 12",
      description:
        "Standard international short cartridges in Midnight. They fit the Brass Fountain Pen and most others.",
      imageQuery: "fountain pen cartridges",
      collections: ["writing"],
      weightGrams: 40,
      variants: [
        { title: "Midnight", sku: "MRL-CTG-12", priceCents: 800, inventoryQty: 60 },
      ],
    },
    {
      slug: "brass-mechanical-pencil",
      title: "Brass Mechanical Pencil",
      description:
        "0.7 mm leads, a knurled grip and a pocket clip that doesn't snap off. Comes with twelve spare HB leads.",
      imageQuery: "mechanical pencil brass",
      collections: ["writing"],
      weightGrams: 80,
      variants: [
        { title: "0.7 mm", sku: "MRL-BMP-07", priceCents: 4200, inventoryQty: 16 },
      ],
    },
    {
      slug: "letterpress-cards",
      title: "Letterpress Cards, Set of 5",
      description:
        "Printed on a 1950s platen press in a studio down the street. Blank inside, with envelopes.",
      imageQuery: "letterpress greeting card",
      collections: ["notebooks"],
      weightGrams: 120,
      variants: [
        { title: "Set of 5", sku: "MRL-LPC-5", priceCents: 2400, inventoryQty: 22 },
      ],
    },
    {
      slug: "wax-seal-kit",
      title: "Wax Seal Kit",
      description:
        "A brass seal on a walnut handle, three sticks of wax and a small spoon for melting. For letters you want opened slowly.",
      imageQuery: "wax seal stamp letter",
      collections: ["desk"],
      weightGrams: 300,
      variants: [
        { title: "One size", sku: "MRL-WSK-OS", priceCents: 3800, inventoryQty: 10 },
      ],
    },
    {
      slug: "walnut-desk-tray",
      title: "Walnut Desk Tray",
      description:
        "Cut from a single piece of black walnut and finished with oil. Holds pens, a phone and the keys you keep losing.",
      imageQuery: "wooden desk tray walnut",
      collections: ["desk"],
      weightGrams: 700,
      variants: [
        { title: "One size", sku: "MRL-WDT-OS", priceCents: 6400, inventoryQty: 6 },
      ],
    },
    {
      slug: "leather-pen-roll",
      title: "Leather Pen Roll",
      description:
        "Vegetable-tanned leather with six slots and a tie. Rolls up small enough for a coat pocket.",
      imageQuery: "leather pen roll case",
      collections: ["desk", "writing"],
      weightGrams: 180,
      variants: [
        { title: "One size", sku: "MRL-LPR-OS", priceCents: 5500, inventoryQty: 8 },
      ],
    },
    {
      slug: "wool-felt-desk-mat",
      title: "Wool Felt Desk Mat",
      description:
        "Five millimetres of pressed wool felt, 80 × 30 cm. Quiet under a keyboard and soft under a fountain pen.",
      imageQuery: "felt desk mat keyboard",
      collections: ["desk"],
      weightGrams: 900,
      variants: [
        { title: "Charcoal", sku: "MRL-WFM-CH", priceCents: 5800, inventoryQty: 9 },
        { title: "Grey", sku: "MRL-WFM-GR", priceCents: 5800, inventoryQty: 4 },
      ],
    },
    {
      slug: "washi-tape-set",
      title: "Washi Tape, Set of 4",
      description:
        "Paper tape in four muted colours. Tears by hand, sticks to anything, and peels off without taking the page with it.",
      imageQuery: "washi tape rolls",
      collections: ["notebooks", "desk"],
      weightGrams: 80,
      variants: [
        { title: "Set of 4", sku: "MRL-WTS-4", priceCents: 1400, inventoryQty: 35 },
      ],
    },
  ],
  discounts: [
    {
      code: "BIENVENUE10",
      title: "10% off your first order",
      type: "PERCENTAGE",
      value: 1000,
      segments: ["FIRST_TIME"],
      perCustomerLimit: 1,
    },
    {
      code: "WRITE10",
      title: "$10 off orders over $100",
      type: "FIXED_AMOUNT",
      value: 1000,
      minSubtotalCents: 10000,
    },
    {
      code: null,
      title: "Free shipping over $75",
      type: "FREE_SHIPPING",
      value: 0,
      minSubtotalCents: 7500,
      combinable: true,
    },
    {
      code: null,
      title: "Notebooks: buy 2, get 1 half price",
      type: "BUY_X_GET_Y",
      value: 5000,
      appliesTo: "COLLECTION",
      targetCollection: "notebooks",
      buy: { quantity: 2, getQuantity: 1, fromCollection: "notebooks", maxUsesPerOrder: 1 },
      combinable: true,
    },
    {
      code: "RENTREE",
      title: "Back to school: 15% off",
      type: "PERCENTAGE",
      value: 1500,
      startsAt: "2026-08-15T00:00:00Z",
      endsAt: "2026-09-08T00:00:00Z",
    },
  ],
};

const bakar: SeedStore = {
  slug: "bakar-atelier",
  name: "Bakar Atelier",
  description:
    "Hand-hammered copper from a family workshop in Sarajevo's old bazaar. Coffee sets, trays and lanterns, made and engraved the way they have been for four generations.",
  currency: "BAM",
  contactEmail: "info@bakar.example",
  // Couriers ring before they deliver, and engraving requests come in the note.
  checkout: {
    phone: "REQUIRED",
    company: "HIDDEN",
    firstName: "REQUIRED",
    address2: "HIDDEN",
    marketingOptIn: false,
    orderNote: true,
  },
  cod: {
    // How most of Bosnia pays online — and Stripe takes no merchants here.
    fee: { type: "FIXED_AMOUNT", value: 500 },
    countries: ["BA"],
    maxTotalCents: 150000,
    instructions: "Pay the courier in cash (KM) when your parcel arrives. They'll ring before they come.",
  },
  zones: [
    {
      name: "Bosnia and Herzegovina",
      countries: ["BA"],
      rates: [{ name: "Express courier", priceCents: 800, days: [1, 2] }],
    },
    {
      name: "Western Balkans",
      countries: ["HR", "RS", "ME", "SI", "MK", "AL"],
      rates: [{ name: "Regional courier", priceCents: 2500, days: [3, 6] }],
    },
    {
      name: "Europe",
      countries: [
        "AT", "DE", "CH", "IT", "FR", "NL", "BE", "LU", "SE",
        "DK", "NO", "GB", "IE", "ES", "PT", "PL", "CZ",
      ],
      rates: [
        { name: "International priority", priceCents: 4500, days: [5, 10], weightGrams: [null, 5000] },
        { name: "International priority", priceCents: 7500, days: [5, 12], weightGrams: [5001, null] },
      ],
    },
    {
      name: "Rest of world",
      restOfWorld: true,
      countries: [],
      rates: [{ name: "International priority", priceCents: 8500, days: [8, 20] }],
    },
  ],
  accentColor: "#7d2230",
  bannerQuery: "sarajevo bascarsija",
  logoQuery: "hammered copper texture",
  commissionBps: 600,
  owner: { email: "bakar@example.com", name: "Adnan Kazazić" },
  collections: [
    {
      slug: "coffee",
      title: "Coffee Sets",
      description: "Džezvas, fildžans and everything for a proper Bosnian coffee.",
    },
    {
      slug: "serving",
      title: "Trays & Serving",
      description: "Engraved trays, jugs and dishes for the table.",
    },
    {
      slug: "home",
      title: "Lanterns & Home",
      description: "Pierced lanterns, lamps and pieces for the rest of the house.",
    },
  ],
  products: [
    {
      slug: "hand-hammered-dzezva",
      title: "Hand-Hammered Džezva",
      description:
        "The long-handled pot Bosnian coffee is boiled in. Tin-lined, hammered and polished by hand, with a wooden handle that stays cool.",
      imageQuery: "copper coffee pot cezve",
      collections: ["coffee"],
      weightGrams: 400,
      variants: [
        { title: "2 cups", sku: "BKR-DZV-2", priceCents: 4500, inventoryQty: 25 },
        { title: "4 cups", sku: "BKR-DZV-4", priceCents: 5500, inventoryQty: 18 },
        { title: "6 cups", sku: "BKR-DZV-6", priceCents: 6500, inventoryQty: 9, weightGrams: 550 },
      ],
    },
    {
      slug: "coffee-set-for-two",
      title: "Bosnian Coffee Set for Two",
      description:
        "A džezva, two porcelain fildžans in engraved copper holders, a lidded sugar bowl and the tray to carry it all. The set most of our customers start with.",
      imageQuery: "bosnian coffee set",
      collections: ["coffee"],
      weightGrams: 1600,
      variants: [
        {
          title: "One size",
          sku: "BKR-CST-2",
          priceCents: 16000,
          compareAtPriceCents: 18500,
          inventoryQty: 10,
        },
      ],
    },
    {
      slug: "fildzan-cups-pair",
      title: "Fildžan Cups with Zarf, Pair",
      description:
        "Small handle-less porcelain cups, each in an engraved copper zarf so you can hold it straight off the stove.",
      imageQuery: "turkish coffee cups copper",
      collections: ["coffee"],
      weightGrams: 450,
      variants: [
        { title: "Pair", sku: "BKR-FLD-2", priceCents: 4800, inventoryQty: 20 },
      ],
    },
    {
      slug: "secerluk-sugar-bowl",
      title: "Šećerluk Sugar Bowl",
      description:
        "A bowl for sugar cubes with a domed lid and a little finial to lift it by.",
      imageQuery: "copper sugar bowl lid",
      collections: ["coffee"],
      weightGrams: 350,
      variants: [
        { title: "One size", sku: "BKR-SCR-OS", priceCents: 3800, inventoryQty: 14 },
      ],
    },
    {
      slug: "brass-coffee-mill",
      title: "Brass Coffee Mill",
      description:
        "A tall cylinder mill that grinds as fine as flour, which is what Bosnian coffee wants. Steel burrs and a folding handle.",
      imageQuery: "brass coffee grinder mill",
      collections: ["coffee"],
      weightGrams: 650,
      variants: [
        { title: "One size", sku: "BKR-BCM-OS", priceCents: 7500, inventoryQty: 7 },
      ],
    },
    {
      slug: "bosnian-coffee-ground",
      title: "Bosnian Coffee, Ground 200 g",
      description:
        "Roasted dark and ground powder-fine by a roaster two streets from the workshop. Two heaped teaspoons per fildžan.",
      imageQuery: "ground coffee",
      collections: ["coffee"],
      weightGrams: 230,
      variants: [
        { title: "200 g", sku: "BKR-KAF-200", priceCents: 900, inventoryQty: 60 },
      ],
    },
    {
      slug: "engraved-round-tray",
      title: "Engraved Round Tray",
      description:
        "Chased by hand with tulips and vines, the way the old trays from the bazaar were. Each one takes about two days to engrave.",
      imageQuery: "engraved copper tray",
      collections: ["serving"],
      weightGrams: 900,
      variants: [
        { title: "30 cm", sku: "BKR-ERT-30", priceCents: 8500, inventoryQty: 9 },
        { title: "40 cm", sku: "BKR-ERT-40", priceCents: 12000, inventoryQty: 5, weightGrams: 1400 },
      ],
    },
    {
      slug: "ibrik-water-jug",
      title: "Ibrik Water Jug",
      description:
        "A tall, narrow-necked jug for water at the table, tin-lined so the water tastes of nothing.",
      imageQuery: "copper jug ibrik",
      collections: ["serving"],
      weightGrams: 1300,
      variants: [
        { title: "1.5 L", sku: "BKR-IBR-15", priceCents: 14000, inventoryQty: 4 },
      ],
    },
    {
      slug: "hammered-copper-mugs",
      title: "Hammered Copper Mugs, Pair",
      description:
        "Half a litre each, with brass handles riveted on. They keep a cold drink cold for a long time.",
      imageQuery: "hammered copper mug",
      collections: ["serving"],
      weightGrams: 700,
      variants: [
        { title: "Pair", sku: "BKR-HCM-2", priceCents: 6800, inventoryQty: 12 },
      ],
    },
    {
      slug: "lokum-dish",
      title: "Lokum Dish with Lid",
      description:
        "A footed dish for Turkish delight, dried figs, or whatever is offered with the coffee.",
      imageQuery: "copper dish lid ornate",
      collections: ["serving", "coffee"],
      weightGrams: 500,
      variants: [
        { title: "One size", sku: "BKR-LKD-OS", priceCents: 5200, inventoryQty: 8 },
      ],
    },
    {
      slug: "pierced-copper-lantern",
      title: "Pierced Copper Lantern",
      description:
        "Punched by hand with a pattern that throws stars across the walls. Takes a tealight or a small LED.",
      imageQuery: "copper lantern pierced",
      collections: ["home"],
      weightGrams: 700,
      variants: [
        { title: "Small", sku: "BKR-PCL-S", priceCents: 7000, inventoryQty: 11 },
        { title: "Large", sku: "BKR-PCL-L", priceCents: 11000, inventoryQty: 6, weightGrams: 1200 },
      ],
    },
    {
      slug: "hammered-pendant-lamp",
      title: "Hammered Pendant Lamp",
      description:
        "A 35 cm copper shade on a braided cloth cable, wired for a standard E27 bulb. Made to order in about two weeks.",
      imageQuery: "copper pendant lamp",
      collections: ["home"],
      weightGrams: 2400,
      variants: [
        { title: "35 cm", sku: "BKR-HPL-35", priceCents: 24000, inventoryQty: 3 },
      ],
    },
    {
      slug: "copper-planter",
      title: "Copper Planter",
      description:
        "Hammered copper around a sealed inner pot. Leave it outside to go green, or polish it once a year to keep it bright.",
      imageQuery: "copper planter pot",
      collections: ["home"],
      weightGrams: 900,
      variants: [
        { title: "One size", sku: "BKR-CPL-OS", priceCents: 5500, inventoryQty: 0 },
      ],
    },
  ],
  discounts: [
    {
      code: "DOBRODOSLI",
      title: "10% off your first order",
      type: "PERCENTAGE",
      value: 1000,
      segments: ["FIRST_TIME"],
      perCustomerLimit: 1,
    },
    {
      code: "HVALA15",
      title: "15% off for returning customers",
      type: "PERCENTAGE",
      value: 1500,
      segments: ["RETURNING"],
      perCustomerLimit: 1,
    },
    {
      code: null,
      title: "Free delivery over 150 KM",
      type: "FREE_SHIPPING",
      value: 0,
      minSubtotalCents: 15000,
      combinable: true,
    },
    {
      code: null,
      title: "10% off 3 or more coffee pieces",
      type: "PERCENTAGE",
      value: 1000,
      appliesTo: "COLLECTION",
      targetCollection: "coffee",
      minQuantity: 3,
      combinable: true,
    },
    {
      code: "BAJRAM2026",
      title: "Bajram: 20% off",
      type: "PERCENTAGE",
      value: 2000,
      startsAt: "2026-05-20T00:00:00Z",
      endsAt: "2026-06-03T00:00:00Z",
    },
  ],
};

const kehre: SeedStore = {
  slug: "kehre-velo",
  name: "Kehre Velo",
  description:
    "Cycling clothing and kit for long days in the mountains. Designed in Zürich and tested on every pass between here and the Stelvio.",
  currency: "CHF",
  contactEmail: "service@kehre.example",
  checkout: {
    phone: "OPTIONAL",
    company: "HIDDEN",
    firstName: "OPTIONAL",
    address2: "OPTIONAL",
    marketingOptIn: true,
    orderNote: false,
  },
  cod: {
    // Swiss Post's own cash-on-delivery service, at Swiss Post's price.
    fee: { type: "FIXED_AMOUNT", value: 500 },
    countries: ["CH", "LI"],
    instructions: "Swiss Post collects the amount when it delivers — cash or card at the door.",
  },
  zones: [
    {
      name: "Switzerland & Liechtenstein",
      countries: ["CH", "LI"],
      rates: [
        { name: "PostPac Economy", priceCents: 900, days: [2, 3] },
        { name: "PostPac Priority", priceCents: 1200, days: [1, 1] },
      ],
    },
    {
      name: "Europe",
      countries: [
        "DE", "AT", "FR", "IT", "NL", "BE", "LU", "DK", "SE",
        "NO", "ES", "PT", "GB", "IE", "CZ", "PL", "SI",
      ],
      rates: [
        { name: "Standard", priceCents: 1900, days: [3, 7], weightGrams: [null, 3000] },
        { name: "Standard (heavy)", priceCents: 2900, days: [4, 8], weightGrams: [3001, null] },
      ],
    },
    {
      name: "Rest of world",
      restOfWorld: true,
      countries: [],
      rates: [{ name: "International", priceCents: 3900, days: [6, 14] }],
    },
  ],
  accentColor: "#1d4ed8",
  bannerQuery: "cycling mountain pass road",
  logoQuery: "alpine road hairpin",
  commissionBps: 500,
  owner: { email: "kehre@example.com", name: "Lukas Brunner" },
  collections: [
    {
      slug: "clothing",
      title: "Clothing",
      description: "Merino and technical fabrics, cut for the riding position.",
    },
    {
      slug: "on-the-bike",
      title: "On the Bike",
      description: "Bags, bottles and lights.",
    },
    {
      slug: "workshop",
      title: "Workshop",
      description: "Tools and care for the bike itself.",
    },
  ],
  products: [
    {
      slug: "merino-long-sleeve-jersey",
      title: "Merino Long-Sleeve Jersey",
      description:
        "A merino-polyester knit that stays warm on the descent and dry on the climb. Three rear pockets and a zipped one for keys.",
      imageQuery: "cycling jersey merino",
      collections: ["clothing"],
      weightGrams: 280,
      variants: [
        { title: "S", sku: "KHR-MLJ-S", priceCents: 15900, inventoryQty: 6 },
        { title: "M", sku: "KHR-MLJ-M", priceCents: 15900, inventoryQty: 12 },
        { title: "L", sku: "KHR-MLJ-L", priceCents: 15900, inventoryQty: 9 },
        { title: "XL", sku: "KHR-MLJ-XL", priceCents: 15900, inventoryQty: 3 },
      ],
    },
    {
      slug: "pass-bib-shorts",
      title: "Pass Bib Shorts",
      description:
        "Compressive Italian fabric, a chamois made for six hours in the saddle, and wide raw-cut straps that don't dig in.",
      imageQuery: "cycling bib shorts",
      collections: ["clothing"],
      weightGrams: 220,
      variants: [
        { title: "S", sku: "KHR-PBS-S", priceCents: 18900, inventoryQty: 5 },
        { title: "M", sku: "KHR-PBS-M", priceCents: 18900, inventoryQty: 10 },
        { title: "L", sku: "KHR-PBS-L", priceCents: 18900, inventoryQty: 8 },
        { title: "XL", sku: "KHR-PBS-XL", priceCents: 18900, inventoryQty: 0 },
      ],
    },
    {
      slug: "wind-gilet",
      title: "Wind Gilet",
      description:
        "Windproof front, mesh back, and it packs into a jersey pocket. The thing you'll be gladdest you brought at the top of a pass.",
      imageQuery: "cycling gilet vest",
      collections: ["clothing"],
      weightGrams: 150,
      variants: [
        { title: "S", sku: "KHR-WGL-S", priceCents: 12900, inventoryQty: 7 },
        { title: "M", sku: "KHR-WGL-M", priceCents: 12900, inventoryQty: 11 },
        { title: "L", sku: "KHR-WGL-L", priceCents: 12900, inventoryQty: 6 },
      ],
    },
    {
      slug: "packable-rain-jacket",
      title: "Packable Rain Jacket",
      description:
        "A three-layer waterproof that rolls up to the size of a banana. Long tail, reflective trim and a two-way zip.",
      imageQuery: "cycling rain jacket",
      collections: ["clothing"],
      weightGrams: 260,
      variants: [
        { title: "S", sku: "KHR-PRJ-S", priceCents: 21900, compareAtPriceCents: 24900, inventoryQty: 4 },
        { title: "M", sku: "KHR-PRJ-M", priceCents: 21900, compareAtPriceCents: 24900, inventoryQty: 8 },
        { title: "L", sku: "KHR-PRJ-L", priceCents: 21900, compareAtPriceCents: 24900, inventoryQty: 5 },
      ],
    },
    {
      slug: "cotton-cycling-cap",
      title: "Cotton Cycling Cap",
      description:
        "A short brim that fits under a helmet and a sweatband that actually works. Made in Switzerland in runs of two hundred.",
      imageQuery: "cycling cap cotton",
      collections: ["clothing"],
      weightGrams: 70,
      variants: [
        { title: "Navy", sku: "KHR-CCC-NV", priceCents: 3200, inventoryQty: 22 },
        { title: "Chalk", sku: "KHR-CCC-CK", priceCents: 3200, inventoryQty: 14 },
      ],
    },
    {
      slug: "thermal-gloves",
      title: "Thermal Gloves",
      description:
        "Fleece-backed softshell with a silicone grip, warm down to about 5 °C, and fingertips that work a phone.",
      imageQuery: "cycling gloves winter",
      collections: ["clothing"],
      weightGrams: 120,
      variants: [
        { title: "S", sku: "KHR-TGL-S", priceCents: 5900, inventoryQty: 8 },
        { title: "M", sku: "KHR-TGL-M", priceCents: 5900, inventoryQty: 15 },
        { title: "L", sku: "KHR-TGL-L", priceCents: 5900, inventoryQty: 9 },
      ],
    },
    {
      slug: "merino-cycling-socks",
      title: "Merino Cycling Socks",
      description:
        "A 15 cm cuff, merino for warmth and nylon so they last. Sold in pairs.",
      imageQuery: "cycling socks",
      collections: ["clothing"],
      weightGrams: 60,
      variants: [
        { title: "39–42", sku: "KHR-MCS-39", priceCents: 2200, inventoryQty: 30 },
        { title: "43–46", sku: "KHR-MCS-43", priceCents: 2200, inventoryQty: 26 },
      ],
    },
    {
      slug: "frame-bag",
      title: "Frame Bag",
      description:
        "Fits inside the front triangle of most road and gravel frames. Waterproof zip, three straps, and room for a jacket and lunch.",
      imageQuery: "bikepacking frame bag",
      collections: ["on-the-bike"],
      weightGrams: 380,
      variants: [
        { title: "S", sku: "KHR-FRB-S", priceCents: 8900, inventoryQty: 6 },
        { title: "M", sku: "KHR-FRB-M", priceCents: 8900, inventoryQty: 10 },
      ],
    },
    {
      slug: "seat-pack",
      title: "Seat Pack, 10 L",
      description:
        "Big enough for a weekend's clothes, with a stiffened base and a valve to squeeze the air out so it doesn't sway.",
      imageQuery: "bikepacking saddle bag",
      collections: ["on-the-bike"],
      weightGrams: 520,
      variants: [
        { title: "10 L", sku: "KHR-STP-10", priceCents: 11900, inventoryQty: 7 },
      ],
    },
    {
      slug: "insulated-bottle",
      title: "Insulated Bottle, 600 ml",
      description:
        "Double-walled so it stays cool for two hours in July, with a valve that doesn't leak in a jersey pocket.",
      imageQuery: "cycling water bottle",
      collections: ["on-the-bike"],
      weightGrams: 140,
      variants: [
        { title: "Blue", sku: "KHR-INB-BL", priceCents: 2400, inventoryQty: 34 },
        { title: "Clear", sku: "KHR-INB-CL", priceCents: 2400, inventoryQty: 21 },
      ],
    },
    {
      slug: "usb-c-light-set",
      title: "USB-C Light Set",
      description:
        "An 800-lumen front and a 60-lumen rear, both charged off one cable. Six hours on the steady setting.",
      imageQuery: "bicycle light front",
      collections: ["on-the-bike"],
      weightGrams: 260,
      variants: [
        { title: "Front & rear", sku: "KHR-LTS-OS", priceCents: 7900, inventoryQty: 15 },
      ],
    },
    {
      slug: "steel-multi-tool",
      title: "Steel Multi-Tool",
      description:
        "Fifteen functions, a chain breaker and a T25 among them, in a body that won't bend when you lean on it.",
      imageQuery: "bike multi tool",
      collections: ["workshop"],
      weightGrams: 200,
      variants: [
        { title: "One size", sku: "KHR-SMT-OS", priceCents: 4500, inventoryQty: 20 },
      ],
    },
    {
      slug: "wax-chain-lube",
      title: "Wax Chain Lube",
      description:
        "Paraffin-based and drip-on, so the chain stays clean and so do your calves. About 300 km between top-ups.",
      imageQuery: "bicycle chain lube",
      collections: ["workshop"],
      weightGrams: 160,
      variants: [
        { title: "120 ml", sku: "KHR-WCL-120", priceCents: 1800, inventoryQty: 40 },
      ],
    },
    {
      slug: "mini-pump",
      title: "Mini Pump",
      description:
        "Aluminium barrel and a hose that threads onto Presta valves, so you never snap the core. Gets a road tyre to 6 bar.",
      imageQuery: "bicycle mini pump",
      collections: ["workshop", "on-the-bike"],
      weightGrams: 180,
      variants: [
        { title: "One size", sku: "KHR-MPM-OS", priceCents: 4900, inventoryQty: 13 },
      ],
    },
  ],
  discounts: [
    {
      code: "WILLKOMMEN",
      title: "10% off your first order",
      type: "PERCENTAGE",
      value: 1000,
      segments: ["FIRST_TIME"],
      perCustomerLimit: 1,
    },
    {
      code: "KIT30",
      title: "CHF 30 off clothing over CHF 250",
      type: "FIXED_AMOUNT",
      value: 3000,
      minSubtotalCents: 25000,
      appliesTo: "COLLECTION",
      targetCollection: "clothing",
    },
    {
      code: null,
      title: "Free shipping over CHF 100",
      type: "FREE_SHIPPING",
      value: 0,
      minSubtotalCents: 10000,
      combinable: true,
    },
    {
      code: null,
      title: "Workshop: buy 2, get the cheapest free",
      type: "BUY_X_GET_Y",
      value: 10000,
      appliesTo: "COLLECTION",
      targetCollection: "workshop",
      buy: { quantity: 2, getQuantity: 1, fromCollection: "workshop", maxUsesPerOrder: 1 },
      combinable: true,
    },
    {
      // Scheduled, not yet live.
      code: "BLACKFRIDAY",
      title: "Black Friday weekend: 20% off",
      type: "PERCENTAGE",
      value: 2000,
      startsAt: "2026-11-27T00:00:00Z",
      endsAt: "2026-12-01T00:00:00Z",
    },
  ],
};

export const SEED_STORES: SeedStore[] = [
  nordhavn,
  rosewater,
  wildmoor,
  halden,
  marlowe,
  bakar,
  kehre,
  ...SHOWCASE_STORES,
];
