/**
 * Demo catalogue for the two seeded stores.
 *
 * Two stores, not one: multi-tenancy is the point of this project, and a single
 * demo store proves nothing. They are deliberately styled as different
 * businesses — different palette, different photography, different voice.
 *
 * `imageQuery` is used by `scripts/fetch-seed-images.ts` to pull real,
 * openly-licensed photography into `prisma/seed-images.json`. The seed reads
 * that file rather than hitting the network, so seeding is deterministic and
 * works offline.
 */

import { US_STATES } from "../src/lib/address/regions";

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

export const SEED_STORES: SeedStore[] = [nordhavn, rosewater];
