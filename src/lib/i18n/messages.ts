import { INTL_LOCALES, type Locale } from "./locales";

/**
 * Storefront copy in every supported language.
 *
 * Plain data, no functions, so a slice of it can be handed to a Client
 * Component as a prop. Placeholders are `{name}` and are filled by `format()`;
 * counts go through `plural()`, which asks `Intl.PluralRules` for the category
 * rather than assuming English's one/other split — Bosnian needs a third form
 * ("2 proizvoda", "21 proizvod").
 */

export type Plural = { one: string; few?: string; many?: string; other: string };

const en = {
  nav: {
    home: "Home",
    catalog: "Catalog",
    contact: "Contact",
    menu: "Menu",
    closeMenu: "Close menu",
  },
  header: {
    search: "Search",
    cart: "Cart",
    language: "Language",
  },
  search: {
    title: "Search",
    placeholder: "Search products…",
    submit: "Search",
    resultsFor: "Results for “{query}”",
    noResults: "No results",
    noResultsHint: "Try another word, or browse the catalog.",
    prompt: "Type the name of a product.",
  },
  catalog: {
    title: "Catalog",
    all: "All",
    sort: "Sort",
    featured: "Featured",
    newest: "Newest",
    priceAsc: "Price: low to high",
    priceDesc: "Price: high to low",
    titleAsc: "Name: A–Z",
    productCount: { one: "{count} product", other: "{count} products" } as Plural,
    empty: "No products yet",
    emptyHint: "{store} hasn’t published any products. Check back soon.",
  },
  home: {
    shopAll: "Shop all products",
    newArrivals: "New arrivals",
    collections: "Collections",
    viewAll: "View all",
  },
  collection: {
    empty: "There’s nothing in this collection yet.",
  },
  product: {
    addToCart: "Add to cart",
    adding: "Adding…",
    soldOut: "Sold out",
    option: "Option",
    quantity: "Quantity",
    inStock: "In stock",
    lowStock: "Only {count} left",
    sale: "Sale",
    description: "Description",
    inCollections: "Collections",
    related: "You may also like",
    added: "Added to cart",
    noPhoto: "No photo",
    from: "From {price}",
    notFound: "This product isn’t available",
    notFoundHint: "It may have sold out for good, or the link may be mistyped.",
  },
  cart: {
    title: "Cart",
    empty: "Your cart is empty",
    emptyHint: "Add something from the catalog.",
    continueShopping: "Continue shopping",
    subtotal: "Subtotal",
    checkout: "Check out",
    checkoutUnavailable: "Checkout isn’t available yet",
    shippingNote: "Shipping and discounts are calculated at checkout.",
    remove: "Remove",
    increase: "Increase quantity",
    decrease: "Decrease quantity",
    viewCart: "View cart",
    close: "Close",
    itemCount: { one: "{count} item", other: "{count} items" } as Plural,
    unavailable: "No longer available",
    error: "Something went wrong. Please try again.",
  },
  contact: {
    title: "Contact",
    intro: "Have a question about an order or a product? Get in touch with {store}.",
    emailUs: "Send an email",
    browse: "Browse the catalog",
    about: "About {store}",
  },
  banner: {
    checkoutDisabled:
      "This store isn’t taking orders yet — you can browse, but checkout is disabled.",
  },
  footer: {
    poweredBy: "Powered by",
  },
};

export type Messages = typeof en;

const bs: Messages = {
  nav: {
    home: "Početna",
    catalog: "Katalog",
    contact: "Kontakt",
    menu: "Meni",
    closeMenu: "Zatvori meni",
  },
  header: {
    search: "Pretraga",
    cart: "Korpa",
    language: "Jezik",
  },
  search: {
    title: "Pretraga",
    placeholder: "Pretraži proizvode…",
    submit: "Traži",
    resultsFor: "Rezultati za „{query}“",
    noResults: "Nema rezultata",
    noResultsHint: "Pokušajte s drugom riječi ili pregledajte katalog.",
    prompt: "Upišite naziv proizvoda.",
  },
  catalog: {
    title: "Katalog",
    all: "Sve",
    sort: "Sortiraj",
    featured: "Istaknuto",
    newest: "Najnovije",
    priceAsc: "Cijena: od najniže",
    priceDesc: "Cijena: od najviše",
    titleAsc: "Naziv: A–Ž",
    productCount: {
      one: "{count} proizvod",
      few: "{count} proizvoda",
      other: "{count} proizvoda",
    },
    empty: "Još nema proizvoda",
    emptyHint: "{store} još nema objavljenih proizvoda. Navratite uskoro.",
  },
  home: {
    shopAll: "Pogledaj sve proizvode",
    newArrivals: "Novo u ponudi",
    collections: "Kolekcije",
    viewAll: "Pogledaj sve",
  },
  collection: {
    empty: "U ovoj kolekciji još nema proizvoda.",
  },
  product: {
    addToCart: "Dodaj u korpu",
    adding: "Dodavanje…",
    soldOut: "Rasprodano",
    option: "Opcija",
    quantity: "Količina",
    inStock: "Na stanju",
    lowStock: "Još samo {count} na stanju",
    sale: "Akcija",
    description: "Opis",
    inCollections: "Kolekcije",
    related: "Možda će vam se svidjeti",
    added: "Dodano u korpu",
    noPhoto: "Nema fotografije",
    from: "Od {price}",
    notFound: "Ovaj proizvod nije dostupan",
    notFoundHint: "Možda je trajno rasprodan ili je link pogrešno upisan.",
  },
  cart: {
    title: "Korpa",
    empty: "Vaša korpa je prazna",
    emptyHint: "Dodajte nešto iz kataloga.",
    continueShopping: "Nastavi kupovinu",
    subtotal: "Međuzbir",
    checkout: "Na plaćanje",
    checkoutUnavailable: "Plaćanje još nije dostupno",
    shippingNote: "Dostava i popusti obračunavaju se pri plaćanju.",
    remove: "Ukloni",
    increase: "Povećaj količinu",
    decrease: "Smanji količinu",
    viewCart: "Pogledaj korpu",
    close: "Zatvori",
    itemCount: {
      one: "{count} artikal",
      few: "{count} artikla",
      other: "{count} artikala",
    },
    unavailable: "Više nije dostupno",
    error: "Nešto nije u redu. Pokušajte ponovo.",
  },
  contact: {
    title: "Kontakt",
    intro: "Imate pitanje o narudžbi ili proizvodu? Javite se trgovini {store}.",
    emailUs: "Pošaljite e-mail",
    browse: "Pregledaj katalog",
    about: "O trgovini {store}",
  },
  banner: {
    checkoutDisabled:
      "Ova trgovina još ne prima narudžbe — možete pregledati ponudu, ali plaćanje je onemogućeno.",
  },
  footer: {
    poweredBy: "Pokreće",
  },
};

const es: Messages = {
  nav: {
    home: "Inicio",
    catalog: "Catálogo",
    contact: "Contacto",
    menu: "Menú",
    closeMenu: "Cerrar menú",
  },
  header: {
    search: "Buscar",
    cart: "Carrito",
    language: "Idioma",
  },
  search: {
    title: "Buscar",
    placeholder: "Buscar productos…",
    submit: "Buscar",
    resultsFor: "Resultados para «{query}»",
    noResults: "Sin resultados",
    noResultsHint: "Prueba con otra palabra o explora el catálogo.",
    prompt: "Escribe el nombre de un producto.",
  },
  catalog: {
    title: "Catálogo",
    all: "Todo",
    sort: "Ordenar",
    featured: "Destacados",
    newest: "Más recientes",
    priceAsc: "Precio: de menor a mayor",
    priceDesc: "Precio: de mayor a menor",
    titleAsc: "Nombre: A–Z",
    productCount: { one: "{count} producto", other: "{count} productos" },
    empty: "Aún no hay productos",
    emptyHint: "{store} todavía no ha publicado productos. Vuelve pronto.",
  },
  home: {
    shopAll: "Ver todos los productos",
    newArrivals: "Novedades",
    collections: "Colecciones",
    viewAll: "Ver todo",
  },
  collection: {
    empty: "Esta colección todavía no tiene productos.",
  },
  product: {
    addToCart: "Añadir al carrito",
    adding: "Añadiendo…",
    soldOut: "Agotado",
    option: "Opción",
    quantity: "Cantidad",
    inStock: "En stock",
    lowStock: "Solo quedan {count}",
    sale: "Oferta",
    description: "Descripción",
    inCollections: "Colecciones",
    related: "También te puede gustar",
    added: "Añadido al carrito",
    noPhoto: "Sin foto",
    from: "Desde {price}",
    notFound: "Este producto no está disponible",
    notFoundHint: "Puede que se haya agotado o que el enlace sea incorrecto.",
  },
  cart: {
    title: "Carrito",
    empty: "Tu carrito está vacío",
    emptyHint: "Añade algo desde el catálogo.",
    continueShopping: "Seguir comprando",
    subtotal: "Subtotal",
    checkout: "Finalizar compra",
    checkoutUnavailable: "El pago aún no está disponible",
    shippingNote: "El envío y los descuentos se calculan al finalizar la compra.",
    remove: "Eliminar",
    increase: "Aumentar cantidad",
    decrease: "Reducir cantidad",
    viewCart: "Ver carrito",
    close: "Cerrar",
    itemCount: { one: "{count} artículo", other: "{count} artículos" },
    unavailable: "Ya no está disponible",
    error: "Algo salió mal. Inténtalo de nuevo.",
  },
  contact: {
    title: "Contacto",
    intro:
      "¿Tienes alguna pregunta sobre un pedido o un producto? Ponte en contacto con {store}.",
    emailUs: "Enviar un correo",
    browse: "Explorar el catálogo",
    about: "Sobre {store}",
  },
  banner: {
    checkoutDisabled:
      "Esta tienda aún no acepta pedidos: puedes explorar, pero el pago está desactivado.",
  },
  footer: {
    poweredBy: "Con la tecnología de",
  },
};

const it: Messages = {
  nav: {
    home: "Home",
    catalog: "Catalogo",
    contact: "Contatti",
    menu: "Menu",
    closeMenu: "Chiudi menu",
  },
  header: {
    search: "Cerca",
    cart: "Carrello",
    language: "Lingua",
  },
  search: {
    title: "Cerca",
    placeholder: "Cerca prodotti…",
    submit: "Cerca",
    resultsFor: "Risultati per «{query}»",
    noResults: "Nessun risultato",
    noResultsHint: "Prova con un’altra parola o sfoglia il catalogo.",
    prompt: "Scrivi il nome di un prodotto.",
  },
  catalog: {
    title: "Catalogo",
    all: "Tutti",
    sort: "Ordina",
    featured: "In evidenza",
    newest: "Più recenti",
    priceAsc: "Prezzo: crescente",
    priceDesc: "Prezzo: decrescente",
    titleAsc: "Nome: A–Z",
    productCount: { one: "{count} prodotto", other: "{count} prodotti" },
    empty: "Ancora nessun prodotto",
    emptyHint: "{store} non ha ancora pubblicato prodotti. Torna presto.",
  },
  home: {
    shopAll: "Scopri tutti i prodotti",
    newArrivals: "Novità",
    collections: "Collezioni",
    viewAll: "Vedi tutto",
  },
  collection: {
    empty: "Questa collezione non ha ancora prodotti.",
  },
  product: {
    addToCart: "Aggiungi al carrello",
    adding: "Aggiunta in corso…",
    soldOut: "Esaurito",
    option: "Opzione",
    quantity: "Quantità",
    inStock: "Disponibile",
    lowStock: "Ne restano solo {count}",
    sale: "In offerta",
    description: "Descrizione",
    inCollections: "Collezioni",
    related: "Potrebbe piacerti anche",
    added: "Aggiunto al carrello",
    noPhoto: "Nessuna foto",
    from: "Da {price}",
    notFound: "Questo prodotto non è disponibile",
    notFoundHint: "Potrebbe essere esaurito o il link potrebbe essere errato.",
  },
  cart: {
    title: "Carrello",
    empty: "Il tuo carrello è vuoto",
    emptyHint: "Aggiungi qualcosa dal catalogo.",
    continueShopping: "Continua lo shopping",
    subtotal: "Subtotale",
    checkout: "Procedi al pagamento",
    checkoutUnavailable: "Il pagamento non è ancora disponibile",
    shippingNote: "Spedizione e sconti vengono calcolati al pagamento.",
    remove: "Rimuovi",
    increase: "Aumenta quantità",
    decrease: "Diminuisci quantità",
    viewCart: "Vedi carrello",
    close: "Chiudi",
    itemCount: { one: "{count} articolo", other: "{count} articoli" },
    unavailable: "Non più disponibile",
    error: "Qualcosa è andato storto. Riprova.",
  },
  contact: {
    title: "Contatti",
    intro: "Hai una domanda su un ordine o un prodotto? Contatta {store}.",
    emailUs: "Invia un’email",
    browse: "Sfoglia il catalogo",
    about: "Informazioni su {store}",
  },
  banner: {
    checkoutDisabled:
      "Questo negozio non accetta ancora ordini: puoi sfogliare il catalogo, ma il pagamento è disattivato.",
  },
  footer: {
    poweredBy: "Realizzato con",
  },
};

const de: Messages = {
  nav: {
    home: "Startseite",
    catalog: "Katalog",
    contact: "Kontakt",
    menu: "Menü",
    closeMenu: "Menü schließen",
  },
  header: {
    search: "Suche",
    cart: "Warenkorb",
    language: "Sprache",
  },
  search: {
    title: "Suche",
    placeholder: "Produkte suchen…",
    submit: "Suchen",
    resultsFor: "Ergebnisse für „{query}“",
    noResults: "Keine Ergebnisse",
    noResultsHint: "Versuche es mit einem anderen Begriff oder stöbere im Katalog.",
    prompt: "Gib einen Produktnamen ein.",
  },
  catalog: {
    title: "Katalog",
    all: "Alle",
    sort: "Sortieren",
    featured: "Empfohlen",
    newest: "Neueste",
    priceAsc: "Preis: aufsteigend",
    priceDesc: "Preis: absteigend",
    titleAsc: "Name: A–Z",
    productCount: { one: "{count} Produkt", other: "{count} Produkte" },
    empty: "Noch keine Produkte",
    emptyHint:
      "{store} hat noch keine Produkte veröffentlicht. Schau bald wieder vorbei.",
  },
  home: {
    shopAll: "Alle Produkte ansehen",
    newArrivals: "Neuheiten",
    collections: "Kollektionen",
    viewAll: "Alle ansehen",
  },
  collection: {
    empty: "In dieser Kollektion gibt es noch keine Produkte.",
  },
  product: {
    addToCart: "In den Warenkorb",
    adding: "Wird hinzugefügt…",
    soldOut: "Ausverkauft",
    option: "Variante",
    quantity: "Menge",
    inStock: "Auf Lager",
    lowStock: "Nur noch {count} verfügbar",
    sale: "Sale",
    description: "Beschreibung",
    inCollections: "Kollektionen",
    related: "Das könnte dir auch gefallen",
    added: "Zum Warenkorb hinzugefügt",
    noPhoto: "Kein Foto",
    from: "Ab {price}",
    notFound: "Dieses Produkt ist nicht verfügbar",
    notFoundHint:
      "Es ist vielleicht dauerhaft ausverkauft, oder der Link ist fehlerhaft.",
  },
  cart: {
    title: "Warenkorb",
    empty: "Dein Warenkorb ist leer",
    emptyHint: "Füge etwas aus dem Katalog hinzu.",
    continueShopping: "Weiter einkaufen",
    subtotal: "Zwischensumme",
    checkout: "Zur Kasse",
    checkoutUnavailable: "Die Kasse ist noch nicht verfügbar",
    shippingNote: "Versand und Rabatte werden an der Kasse berechnet.",
    remove: "Entfernen",
    increase: "Menge erhöhen",
    decrease: "Menge verringern",
    viewCart: "Warenkorb ansehen",
    close: "Schließen",
    itemCount: { one: "{count} Artikel", other: "{count} Artikel" },
    unavailable: "Nicht mehr verfügbar",
    error: "Etwas ist schiefgelaufen. Bitte versuche es erneut.",
  },
  contact: {
    title: "Kontakt",
    intro:
      "Fragen zu einer Bestellung oder einem Produkt? Melde dich bei {store}.",
    emailUs: "E-Mail senden",
    browse: "Katalog durchstöbern",
    about: "Über {store}",
  },
  banner: {
    checkoutDisabled:
      "Dieser Shop nimmt noch keine Bestellungen an – du kannst stöbern, aber die Kasse ist deaktiviert.",
  },
  footer: {
    poweredBy: "Betrieben mit",
  },
};

export const MESSAGES: Record<Locale, Messages> = { en, bs, es, it, de };

/** Fills `{name}` placeholders. Unknown names are left as written. */
export function format(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
}

/** Picks the plural form `Intl` says this count takes, then fills `{count}`. */
export function plural(locale: Locale, count: number, forms: Plural): string {
  const category = new Intl.PluralRules(INTL_LOCALES[locale]).select(count);
  const template =
    (category === "one" || category === "few" || category === "many"
      ? forms[category]
      : undefined) ?? forms.other;

  return format(template, {
    count: new Intl.NumberFormat(INTL_LOCALES[locale]).format(count),
  });
}
