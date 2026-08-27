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

export type SeedVariant = {
  title: string;
  sku: string;
  priceCents: number;
  compareAtPriceCents?: number;
  inventoryQty: number;
};

export type SeedProduct = {
  slug: string;
  title: string;
  description: string;
  imageQuery: string;
  collections: string[];
  variants: SeedVariant[];
};

export type SeedDiscount = {
  code: string | null;
  title: string;
  type: "PERCENTAGE" | "FIXED_AMOUNT" | "FREE_SHIPPING";
  /** Basis points for PERCENTAGE, cents for FIXED_AMOUNT, ignored otherwise. */
  value: number;
  minSubtotalCents?: number;
  appliesTo?: "ALL" | "COLLECTION" | "PRODUCT";
  /** Collection slug when appliesTo = COLLECTION. */
  targetCollection?: string;
  usageLimit?: number;
  perCustomerLimit?: number;
  active?: boolean;
};

export type SeedStore = {
  slug: string;
  name: string;
  description: string;
  accentColor: string;
  bannerQuery: string;
  logoQuery: string;
  commissionBps: number;
  owner: { email: string; name: string };
  collections: { slug: string; title: string; description: string }[];
  products: SeedProduct[];
  discounts: SeedDiscount[];
};

export const SEED_PASSWORD = "kiosk-demo-2026";

export const PLATFORM_ADMIN = {
  email: "admin@example.com",
  name: "Platform Admin",
};

const nordhavn: SeedStore = {
  slug: "nordhavn-supply",
  name: "Nordhavn Supply",
  description:
    "Hard-wearing outdoor kit for cold, wet places. Made in small runs, built to be repaired rather than replaced.",
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
    },
  ],
};

const rosewater: SeedStore = {
  slug: "rosewater-ceramics",
  name: "Rosewater Ceramics",
  description:
    "Small-batch stoneware, thrown and glazed by hand in a Lisbon studio. No two pieces come out quite the same.",
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
      variants: [
        { title: "One size", sku: "RSW-SBK-OS", priceCents: 7400, inventoryQty: 6 },
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
      perCustomerLimit: 1,
    },
    {
      code: "SECONDS",
      title: "$5 off studio seconds",
      type: "FIXED_AMOUNT",
      value: 500,
      usageLimit: 50,
    },
    {
      code: "EXPIRED2025",
      title: "Expired holiday promotion",
      type: "PERCENTAGE",
      value: 2000,
      active: false,
    },
  ],
};

export const SEED_STORES: SeedStore[] = [nordhavn, rosewater];
