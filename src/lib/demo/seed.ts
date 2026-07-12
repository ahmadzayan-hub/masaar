// Deterministic, in-memory demo dataset that powers the console when Supabase
// is not configured. Anchored to "now" so dashboards always look fresh.
// The shape of every row matches the Supabase schema (supabase/migrations/0001).

const DAY = 86_400_000;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}
function pickWeighted<T>(rng: () => number, arr: readonly [T, number][]): T {
  const total = arr.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [v, w] of arr) {
    r -= w;
    if (r <= 0) return v;
  }
  return arr[arr.length - 1][0];
}
function uid(prefix: string, i: number) {
  return `${prefix}-${String(i).padStart(4, "0")}`;
}
function isoAt(daysAgo: number, hour = 11, minute = 0) {
  const d = new Date(Date.now() - daysAgo * DAY);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

// ----------------------------- canonical lists ------------------------------

const PRODUCT_CATALOGUE = [
  { id: uid("prd", 1), name: "Custom Name Necklace — Classic", category: "custom_name_necklace", default_price: 220, description: "Personalised Arabic / English name pendant on a delicate chain.", claim_notes: "Fashion accessory, gold-tone plated. Subject to availability.", active: true },
  { id: uid("prd", 2), name: "Fashion Bracelet — Crescent", category: "fashion_bracelet", default_price: 140, description: "Crescent charm bracelet with adjustable clasp.", claim_notes: "Fashion accessory, gold-tone plated.", active: true },
  { id: uid("prd", 3), name: "Car Hanger — Name Charm", category: "car_hanger", default_price: 95, description: "Hanging name charm for car rear-view mirror.", claim_notes: "Decorative gift item.", active: true },
  { id: uid("prd", 4), name: "Graduation Charm Set", category: "graduation_charm", default_price: 180, description: "Cap-and-scroll graduation charm with custom date.", claim_notes: "Seasonal item, fashion accessory.", active: true },
  { id: uid("prd", 5), name: "Gift Box — Pearl Edition", category: "gift_box", default_price: 260, description: "Curated gift box: bracelet + necklace + ribbon-wrapped box.", claim_notes: "Plated fashion accessories.", active: true },
  { id: uid("prd", 6), name: "Ring — Minimalist Band", category: "ring", default_price: 110, description: "Slim band ring with adjustable sizing.", claim_notes: "Fashion accessory.", active: true },
  { id: uid("prd", 7), name: "Anklet — Star Drop", category: "anklet", default_price: 95, description: "Delicate anklet with hanging star charm.", claim_notes: "Fashion accessory.", active: true },
  { id: uid("prd", 8), name: "Custom Name Necklace — Bold", category: "custom_name_necklace", default_price: 280, description: "Heavier weight Arabic name pendant for statement look.", claim_notes: "Fashion accessory, gold-tone plated.", active: true },
];

const COLOURS = ["gold-tone", "silver-tone", "rose-gold-tone", "two-tone"] as const;
const FINISHES = ["gold_tone", "silver_tone", "other"] as const;

const EMIRATES: [string, number][] = [
  ["Dubai", 0.42],
  ["Sharjah", 0.18],
  ["Abu Dhabi", 0.16],
  ["Ajman", 0.08],
  ["Ras Al Khaimah", 0.06],
  ["Al Ain", 0.05],
  ["Fujairah", 0.03],
  ["Umm Al Quwain", 0.02],
];

const CITY_BY_EMIRATE: Record<string, string[]> = {
  Dubai: ["Dubai Marina", "Business Bay", "Jumeirah", "Deira", "Al Barsha"],
  Sharjah: ["Al Majaz", "Al Khan", "Al Qasimia"],
  "Abu Dhabi": ["Al Reem", "Khalifa City", "Yas Island"],
  Ajman: ["Al Nuaimiya", "Al Rashidiya"],
  "Ras Al Khaimah": ["Al Hamra", "Al Nakheel"],
  "Al Ain": ["Al Jimi", "Al Mutawaa"],
  Fujairah: ["Madhab", "Sakamkam"],
  "Umm Al Quwain": ["Old Town", "Al Salama"],
};

const NAME_PAIRS = [
  ["Mariam", "مريم"], ["Fatima", "فاطمة"], ["Aisha", "عائشة"], ["Huda", "هدى"],
  ["Mona", "منى"], ["Sara", "سارة"], ["Nourhan", "نورهان"], ["Rehab", "رحاب"],
  ["Reham", "ريهام"], ["Layla", "ليلى"], ["Salma", "سلمى"], ["Hessa", "حصة"],
  ["Shamma", "شما"], ["Noura", "نورة"], ["Latifa", "لطيفة"], ["Maitha", "ميثة"],
  ["Ahmed", "أحمد"], ["Khalid", "خالد"], ["Saif", "سيف"], ["Omar", "عمر"],
  ["Yousef", "يوسف"], ["Hamad", "حمد"], ["Rashid", "راشد"], ["Mohammed", "محمد"],
];

const ENGLISH_ONLY_NAMES = ["Anna", "Sophia", "Liam", "Emma", "Lucas", "Isabella", "Mia"];

const PLATFORMS: [string, number][] = [
  ["instagram", 0.55],
  ["whatsapp", 0.28],
  ["tiktok", 0.10],
  ["meta_ads", 0.05],
  ["comment", 0.02],
];

const SEGMENTS = ["new", "repeat", "vip", "lost", "supplier_lead"] as const;
const CONSENT = ["none", "soft", "explicit", "purchased"] as const;

const STAGES: [string, number][] = [
  ["cold_lead", 0.18],
  ["information_lead", 0.10],
  ["price_lead", 0.18],
  ["warm_lead", 0.14],
  ["hot_lead", 0.10],
  ["payment_stage", 0.08],
  ["delivery_stage", 0.07],
  ["after_sale_stage", 0.06],
  ["complaint_stage", 0.03],
  ["lost_lead", 0.06],
];

const PERSONAS: [string, number][] = [
  ["personal_buyer", 0.35],
  ["gift_buyer", 0.18],
  ["customization_buyer", 0.14],
  ["price_sensitive_buyer", 0.12],
  ["urgent_buyer", 0.06],
  ["hot_lead", 0.05],
  ["repeat_buyer", 0.05],
  ["vip_buyer", 0.02],
  ["hesitant_buyer", 0.03],
];

const TEMPERATURE_BY_STAGE: Record<string, "cold" | "warm" | "hot"> = {
  cold_lead: "cold", information_lead: "cold", price_lead: "warm", warm_lead: "warm",
  hot_lead: "hot", payment_stage: "hot", delivery_stage: "hot", after_sale_stage: "warm",
  complaint_stage: "warm", lost_lead: "cold",
};

const RISK_BY_STAGE: Record<string, "low" | "medium" | "high"> = {
  cold_lead: "low", information_lead: "low", price_lead: "low", warm_lead: "low",
  hot_lead: "medium", payment_stage: "high", delivery_stage: "high",
  after_sale_stage: "low", complaint_stage: "high", lost_lead: "low",
};

const SAMPLE_MESSAGES_EN = [
  "Hi! I saw the name necklace on Instagram — how much for Arabic with the name?",
  "How long for delivery to Sharjah?",
  "Is the silver-tone still available?",
  "Hello, can I get this gift wrapped? It's for my sister's birthday.",
  "Can you do same-day delivery to Marina?",
  "Is the gold real?",
  "Can I pay on delivery?",
  "I bought from you last month — do you have new designs?",
  "The bracelet I received looks different from the photo 😕",
  "Hello, do you ship to Al Ain?",
];

const SAMPLE_MESSAGES_AR = [
  "السلام عليكم، كم سعر السلسلة بالاسم؟",
  "متى يوصل الطلب لأبوظبي؟",
  "هل اللون الذهبي متوفر؟",
  "أبي هدية لأختي 🤍 ممكن غلاف هدية؟",
  "ممكن توصيل اليوم؟",
  "الذهب أصلي؟",
  "ممكن أدفع عند الاستلام؟",
  "أنا اشتريت قبل، عندكم تصاميم جديدة؟",
  "السلسلة وصلت مختلفة عن الصورة 😢",
  "توصلون لرأس الخيمة؟",
];

const INTENTS = [
  "Asks about price for custom name necklace",
  "Asks about delivery time and emirate coverage",
  "Asks if a specific colour / finish is in stock",
  "Wants a gift box wrap for a birthday",
  "Wants same-day delivery (urgent)",
  "Asks about material authenticity (gold / silver)",
  "Asks about cash-on-delivery option",
  "Returning customer looking at new designs",
  "Complaint — received item different from photo",
  "Asks for emirate delivery feasibility",
];

const COURIERS = [
  { id: uid("crr", 1), name: "Aramex", contact: "+971 4 211 1111", service_type: "express", default_cost: 25, vat_included: true, notes: "Express across all emirates." },
  { id: uid("crr", 2), name: "Quiqup", contact: "+971 4 553 0000", service_type: "same_day_dubai", default_cost: 35, vat_included: true, notes: "Same-day delivery within Dubai only." },
  { id: uid("crr", 3), name: "Fetchr", contact: "+971 4 800 0000", service_type: "standard", default_cost: 20, vat_included: false, notes: "Cash-on-delivery supported." },
  { id: uid("crr", 4), name: "Talabat Express", contact: "+971 4 252 0000", service_type: "rider", default_cost: 30, vat_included: true, notes: "Dubai + Sharjah only." },
  { id: uid("crr", 5), name: "Owner Drop-off", contact: "owner", service_type: "personal", default_cost: 0, vat_included: false, notes: "Personal delivery for VIP customers only." },
];

const SUPPLIERS = [
  { id: uid("sup", 1), name: "Yiwu Jewellery Co.", country: "China", contact: "wechat: yj_co_2026", platform: "Alibaba", catalogue_status: "received", real_video_received: true, material_proof: "gold-tone plating spec", sample_status: "approved", sample_approved: true, moq: 50, unit_cost: 18, shipping_cost: 320, production_time: "10-14 days", wrong_item_policy: "Replacement at supplier cost", damage_policy: "Photo + video evidence within 48h", payment_method: "30% deposit, 70% on shipment", risk_score: 0.25, notes: "Reliable for name necklaces." },
  { id: uid("sup", 2), name: "Dubai Plated Goods FZ", country: "UAE", contact: "+971 4 200 0001", platform: "Direct", catalogue_status: "received", real_video_received: true, material_proof: "lab certificate", sample_status: "approved", sample_approved: true, moq: 20, unit_cost: 32, shipping_cost: 0, production_time: "3-5 days", wrong_item_policy: "Free replacement", damage_policy: "Photo evidence", payment_method: "Net 30", risk_score: 0.10, notes: "Local — fastest restock." },
  { id: uid("sup", 3), name: "Istanbul Charms Atelier", country: "Türkiye", contact: "+90 212 555 0123", platform: "Email", catalogue_status: "received", real_video_received: false, material_proof: "pending", sample_status: "shipped", sample_approved: false, moq: 30, unit_cost: 24, shipping_cost: 180, production_time: "14-21 days", wrong_item_policy: "Replacement excl. shipping", damage_policy: "Within 7 days", payment_method: "50/50", risk_score: 0.55, notes: "Hold — no video yet. Do not bulk buy." },
  { id: uid("sup", 4), name: "Guangzhou Trade Plus", country: "China", contact: "alibaba.com/gz-trade-plus", platform: "Alibaba", catalogue_status: "received", real_video_received: true, material_proof: "received", sample_status: "approved", sample_approved: true, moq: 100, unit_cost: 12, shipping_cost: 450, production_time: "12-16 days", wrong_item_policy: "Replacement", damage_policy: "Within 7 days", payment_method: "Letter of credit", risk_score: 0.35, notes: "Best for high-volume basics." },
  { id: uid("sup", 5), name: "Cairo Goldsmiths Ltd", country: "Egypt", contact: "+20 2 555 0123", platform: "WhatsApp", catalogue_status: "in_review", real_video_received: false, material_proof: "missing", sample_status: "not_sent", sample_approved: false, moq: 25, unit_cost: 22, shipping_cost: 140, production_time: "21-28 days", wrong_item_policy: "Unclear", damage_policy: "Unclear", payment_method: "Wire", risk_score: 0.75, notes: "High risk — incomplete docs." },
  { id: uid("sup", 6), name: "Sharjah Gift Box Co.", country: "UAE", contact: "+971 6 555 0001", platform: "Direct", catalogue_status: "received", real_video_received: true, material_proof: "n/a (packaging)", sample_status: "approved", sample_approved: true, moq: 10, unit_cost: 8, shipping_cost: 0, production_time: "2-3 days", wrong_item_policy: "Replacement", damage_policy: "Photo evidence", payment_method: "Cash on delivery", risk_score: 0.05, notes: "Packaging only — fast and cheap." },
];

const OFFERS = [
  { id: uid("ofr", 1), name: "Free Dubai delivery weekend", description: "Free delivery within Dubai for orders > AED 200", products_included: ["custom_name_necklace", "fashion_bracelet"], price: 220, delivery_rule: "free_dubai", emirates_covered: ["Dubai"], vat_rule: "inclusive", start_at: isoAt(2), end_at: isoAt(-5), terms: "Dubai only, minimum AED 200.", active: true },
  { id: uid("ofr", 2), name: "Gift box bundle", description: "Necklace + bracelet + gift box at AED 380", products_included: ["custom_name_necklace", "fashion_bracelet", "gift_box"], price: 380, delivery_rule: "courier_confirm", emirates_covered: [], vat_rule: "inclusive", start_at: isoAt(5), end_at: isoAt(-12), terms: "Subject to courier confirmation outside Dubai.", active: true },
  { id: uid("ofr", 3), name: "Graduation season set", description: "Graduation charm + custom date AED 199", products_included: ["graduation_charm"], price: 199, delivery_rule: "courier_confirm", emirates_covered: [], vat_rule: "inclusive", start_at: isoAt(10), end_at: isoAt(-30), terms: "While stocks last.", active: true },
  { id: uid("ofr", 4), name: "Expired ad promo", description: "Old promo — no longer valid", products_included: ["ring"], price: 80, delivery_rule: "flat", emirates_covered: [], vat_rule: "inclusive", start_at: isoAt(60), end_at: isoAt(10), terms: "Expired.", active: false },
];

// ------------------------------- generators ---------------------------------

function generateCustomers(rng: () => number) {
  const out: Record<string, unknown>[] = [];
  for (let i = 0; i < 28; i++) {
    const useArabic = rng() < 0.7;
    const name = useArabic ? pick(rng, NAME_PAIRS) : [pick(rng, ENGLISH_ONLY_NAMES), null];
    const segment = pickWeighted(rng, SEGMENTS.map((s, idx) => [s, [0.35, 0.30, 0.12, 0.20, 0.03][idx]] as [typeof s, number]));
    const purchaseCount = segment === "vip" ? 3 + Math.floor(rng() * 4) : segment === "repeat" ? 2 : segment === "new" ? (rng() < 0.4 ? 1 : 0) : 0;
    const language = rng() < 0.55 ? "ar" : rng() < 0.85 ? "mixed" : "en";
    out.push({
      id: uid("cus", i + 1),
      name_display: name[0],
      name_arabic_verified: name[1] ?? null,
      name_confidence: name[1] ? 0.95 : 0.0,
      platform: pickWeighted(rng, PLATFORMS),
      phone: `+9715${Math.floor(10000000 + rng() * 89999999)}`,
      instagram_handle: useArabic ? null : `@${name[0]?.toLowerCase()}_${Math.floor(rng() * 999)}`,
      language,
      consent_status: pick(rng, CONSENT),
      segment,
      vip: segment === "vip",
      purchase_count: purchaseCount,
      notes: segment === "vip" ? "Top customer — owner deliveries." : segment === "lost" ? "Did not respond to last 2 follow-ups." : null,
      created_at: isoAt(60 - Math.floor(rng() * 60)),
    });
  }
  return out;
}

function generateConversations(rng: () => number, customers: Record<string, unknown>[]) {
  const out: Record<string, unknown>[] = [];
  for (let i = 0; i < 64; i++) {
    const customer = customers[i % customers.length];
    const stage = pickWeighted(rng, STAGES);
    const persona = pickWeighted(rng, PERSONAS);
    const useArabic = (customer.language === "ar" || customer.language === "mixed") && rng() < 0.7;
    const messageIdx = Math.floor(rng() * SAMPLE_MESSAGES_EN.length);
    const message = useArabic ? SAMPLE_MESSAGES_AR[messageIdx] : SAMPLE_MESSAGES_EN[messageIdx];
    const intent = INTENTS[messageIdx];
    const daysAgo = i < 8 ? 0 : i < 18 ? 1 : Math.floor(rng() * 14);
    const hour = 9 + Math.floor(rng() * 12);
    const minute = Math.floor(rng() * 60);
    out.push({
      id: uid("conv", i + 1),
      customer_id: customer.id,
      customer_name: customer.name_display,
      platform: customer.platform,
      message_text: message,
      message_language: useArabic ? "ar" : "en",
      intent,
      stage,
      lead_temperature: TEMPERATURE_BY_STAGE[stage],
      persona,
      risk_level: RISK_BY_STAGE[stage],
      created_at: isoAt(daysAgo, hour, minute),
    });
  }
  return out.sort((a, b) => (b.created_at as string).localeCompare(a.created_at as string));
}

function generateInventory(rng: () => number) {
  const out: Record<string, unknown>[] = [];
  let id = 1;
  for (const product of PRODUCT_CATALOGUE) {
    for (let c = 0; c < 3; c++) {
      const colour = COLOURS[c];
      const finish = FINISHES[Math.min(c, 2)];
      const qty = Math.floor(rng() * 60);
      const daily = 0.4 + rng() * 2.6;
      out.push({
        id: uid("inv", id++),
        product_id: product.id,
        product_name: product.name,
        colour,
        finish,
        quantity_available: qty,
        quantity_reserved: Math.floor(rng() * 5),
        quantity_paid: Math.floor(rng() * 8),
        quantity_dispatched: Math.floor(rng() * 6),
        quantity_delivered: Math.floor(rng() * 30),
        daily_sales_rate: Number(daily.toFixed(2)),
        reorder_lead_days: 7,
        photo_url: null,
        supplier_source: pick(rng, SUPPLIERS.slice(0, 4)).name,
        last_updated: isoAt(Math.floor(rng() * 6)),
      });
    }
  }
  return out;
}

function generateOrders(rng: () => number, customers: Record<string, unknown>[]) {
  const out: Record<string, unknown>[] = [];
  const statusFlow = [
    ["draft", "none", "none"],
    ["awaiting_payment", "link_sent", "none"],
    ["awaiting_payment", "needs_verification", "none"],
    ["paid", "confirmed", "none"],
    ["paid", "confirmed", "awaiting_confirmation"],
    ["qc", "confirmed", "confirmed"],
    ["dispatched", "confirmed", "in_transit"],
    ["delivered", "confirmed", "delivered"],
    ["delivered", "confirmed", "delivered"],
    ["delivered", "confirmed", "delivered"],
    ["complaint", "confirmed", "delivered"],
    ["cancelled", "none", "none"],
  ] as const;
  for (let i = 0; i < 42; i++) {
    const cust = customers[i % customers.length];
    const product = PRODUCT_CATALOGUE[i % PRODUCT_CATALOGUE.length];
    const qty = 1 + Math.floor(rng() * 3);
    const productPrice = (product.default_price as number) * qty;
    const emirate = pickWeighted(rng, EMIRATES);
    const isDubai = emirate === "Dubai";
    const deliveryCost = isDubai ? (rng() < 0.5 ? 0 : 20) : 25 + Math.floor(rng() * 15);
    const flow = statusFlow[Math.floor(rng() * statusFlow.length)];
    const vatAmount = Math.round(productPrice * 0.05);
    const total = productPrice + deliveryCost + vatAmount;
    const daysAgo = Math.floor(rng() * 30);
    const cityArr = CITY_BY_EMIRATE[emirate] ?? [emirate];
    out.push({
      id: uid("ord", i + 1),
      customer_id: cust.id,
      customer_name: cust.name_display,
      order_status: flow[0],
      product_summary: `${product.name} ×${qty} (${pick(rng, COLOURS)})`,
      product_id: product.id,
      product_name: product.name,
      product_category: product.category,
      quantity: qty,
      colours: pick(rng, COLOURS),
      product_price: productPrice,
      delivery_cost: deliveryCost,
      vat_amount: vatAmount,
      total_amount: total,
      payment_status: flow[1],
      courier_status: flow[2],
      delivery_city: pick(rng, cityArr),
      delivery_area: emirate,
      delivery_address: "[redacted in demo]",
      phone: cust.phone,
      expected_delivery_date: new Date(Date.now() + (isDubai ? 1 : 2) * DAY).toISOString().slice(0, 10),
      actual_received_date: flow[2] === "delivered" ? new Date(Date.now() - Math.max(0, daysAgo - 1) * DAY).toISOString().slice(0, 10) : null,
      receiver_name: flow[2] === "delivered" ? cust.name_display : null,
      staff_number: "N/A",
      locked_by_dispute: flow[0] === "complaint",
      qc: flow[0] === "qc" ? { passed: false, last_check: isoAt(daysAgo) } : null,
      notes: flow[0] === "complaint" ? "Customer reported wrong colour received." : null,
      created_at: isoAt(daysAgo, 10 + Math.floor(rng() * 8), Math.floor(rng() * 60)),
    });
  }
  return out.sort((a, b) => (b.created_at as string).localeCompare(a.created_at as string));
}

function generatePayments(rng: () => number, orders: Record<string, unknown>[]) {
  return orders
    .filter((o) => o.payment_status !== "none")
    .map((o, i) => ({
      id: uid("pay", i + 1),
      order_id: o.id,
      order_summary: o.product_summary,
      customer_name: o.customer_name,
      payment_method: pick(rng, ["bank_transfer", "stripe_link", "cash_on_delivery", "tabby"]),
      payment_link: `https://pay.beyondstyle.ae/${o.id}`,
      amount_expected: o.total_amount,
      amount_received: o.payment_status === "confirmed" ? o.total_amount : 0,
      vat_amount: o.vat_amount,
      delivery_amount: o.delivery_cost,
      reference: `BS-${(o.id as string).slice(-4).toUpperCase()}-${Math.floor(rng() * 9000 + 1000)}`,
      screenshot_url: null,
      status: o.payment_status,
      confirmed_by: o.payment_status === "confirmed" ? "owner@beyondstyle.ae" : null,
      order_activated: o.payment_status === "confirmed",
      created_at: o.created_at,
    }));
}

function generateDeliveries(rng: () => number, orders: Record<string, unknown>[]) {
  return orders
    .filter((o) => o.courier_status !== "none")
    .map((o, i) => ({
      id: uid("dlv", i + 1),
      order_id: o.id,
      courier_id: pick(rng, COURIERS).id,
      courier_name: pick(rng, COURIERS).name,
      pickup_time: o.courier_status === "in_transit" || o.courier_status === "delivered" ? isoAt(1, 9, 0) : null,
      expected_delivery_date: o.expected_delivery_date,
      actual_delivery_time: o.courier_status === "delivered" ? isoAt(0, 14, 30) : null,
      proof_dispatch_url: null,
      proof_delivery_url: null,
      receiver_name: o.receiver_name ?? null,
      actual_received_date: o.actual_received_date,
      staff_number: "N/A",
      failed_attempts: o.courier_status === "delivered" && rng() < 0.1 ? 1 : 0,
      delivery_status: o.courier_status,
      notes: null,
    }));
}

function generateReviews(rng: () => number, customers: Record<string, unknown>[], orders: Record<string, unknown>[]) {
  const delivered = orders.filter((o) => o.order_status === "delivered");
  const sampleFeedback = [
    "Beautiful piece — exactly as the photo! Will reorder 🤍",
    "Quality is amazing for the price. Highly recommend.",
    "Fast delivery to Dubai. Lovely packaging.",
    "Gift was a hit at my sister's birthday. Thank you!",
    "Colour is slightly different from screen but still lovely.",
    "Took 4 days to Sharjah but everything arrived safe.",
    "Loved it. Already ordered another for my mum.",
    "Best gift box I've received. Will order again for Eid.",
    "Charm is delicate but feels well made.",
    "Customer service was lovely throughout 🤍",
  ];
  return delivered.slice(0, 22).map((o, i) => ({
    id: uid("rev", i + 1),
    customer_id: o.customer_id,
    customer_name: o.customer_name,
    order_id: o.id,
    rating: 4 + Math.round(rng() * 1),
    feedback: sampleFeedback[i % sampleFeedback.length],
    permission_to_share: rng() < 0.7,
    story_mention: rng() < 0.3,
    created_at: isoAt(Math.floor(rng() * 14)),
  }));
}

function generateDisputes(rng: () => number, orders: Record<string, unknown>[]) {
  const reasons = ["damaged", "wrong_item", "delivery_delay", "material_claim", "courier_failure"] as const;
  const candidates = orders.filter((o) => o.order_status === "complaint" || (o.order_status === "delivered" && rng() < 0.04));
  return candidates.slice(0, 6).map((o, i) => {
    const reason = reasons[i % reasons.length];
    const isOpen = i < 2;
    return {
      id: uid("dsp", i + 1),
      order_id: o.id,
      customer_id: o.customer_id,
      customer_name: o.customer_name,
      reason,
      status: isOpen ? "open" : i === 2 ? "in_review" : i === 3 ? "resolved" : "rejected",
      description:
        reason === "damaged" ? "Customer reports clasp arrived bent."
        : reason === "wrong_item" ? "Customer says colour received differs from order."
        : reason === "delivery_delay" ? "Delivery 3 days late vs promised window."
        : reason === "material_claim" ? "Customer asked if plating is real gold."
        : "Courier left package at concierge without notice.",
      evidence_url: null,
      resolution_note: isOpen ? null : "Replacement dispatched at no cost. Apology sent.",
      locks_order: isOpen,
      created_at: isoAt(i + 1),
      resolved_at: isOpen || i === 2 ? null : isoAt(0),
    };
  });
}

function generateFollowups(rng: () => number, customers: Record<string, unknown>[]) {
  const types = ["price_reminder", "stock_back", "after_sale_review", "vip_thank_you", "abandoned_payment"] as const;
  return Array.from({ length: 18 }).map((_, i) => {
    const cust = customers[i % customers.length];
    const type = types[i % types.length];
    return {
      id: uid("flw", i + 1),
      customer_id: cust.id,
      customer_name: cust.name_display,
      order_id: null,
      type,
      message:
        type === "price_reminder" ? "Soft price-window reminder."
        : type === "stock_back" ? "Notify customer the colour is back in stock."
        : type === "after_sale_review" ? "Ask for review + permission to share."
        : type === "vip_thank_you" ? "Hand-written VIP thank-you note."
        : "Gentle nudge — abandoned payment link.",
      scheduled_at: isoAt(-Math.floor(rng() * 3) - 1, 10, 0),
      status: i < 4 ? "sent" : "pending",
      created_at: isoAt(Math.floor(rng() * 4)),
    };
  });
}

function generateAuditLogs(rng: () => number, orders: Record<string, unknown>[]) {
  const actions = [
    ["payment_confirmed", "payments"],
    ["order_dispatched", "orders"],
    ["dispute_opened", "disputes"],
    ["dispute_resolved", "disputes"],
    ["prompt_updated", "prompts"],
    ["price_quoted", "conversations"],
    ["owner_approval", "ai_outputs"],
    ["inventory_reorder", "inventory"],
  ] as const;
  return Array.from({ length: 30 }).map((_, i) => {
    const [action, entity] = actions[i % actions.length];
    const order = orders[i % orders.length];
    return {
      id: uid("aud", i + 1),
      user_id: "owner@beyondstyle.ae",
      action,
      entity,
      entity_id: order.id,
      old_value: null,
      new_value: { ref: order.id },
      created_at: isoAt(Math.floor(i / 6), 9 + (i % 8), (i * 7) % 60),
    };
  }).sort((a, b) => b.created_at.localeCompare(a.created_at));
}

function generateAiOutputs(rng: () => number, conversations: Record<string, unknown>[]) {
  return conversations.slice(0, 18).map((c, i) => ({
    id: uid("aio", i + 1),
    conversation_id: c.id,
    analysis_json: {
      customer_intent: c.intent,
      lead_temperature: c.lead_temperature,
      customer_persona: c.persona,
      confidence_score: 0.7 + ((i * 13) % 30) / 100,
    },
    guardrails_json: { worstStatus: i % 5 === 0 ? "warn" : "pass" },
    reply_draft:
      c.message_language === "ar"
        ? "أهلاً 🤍 سعر السلسلة بالاسم AED 220 شامل الضريبة. تحبين أزرق ذهبي أو فضي؟"
        : "Hello 🤍 The custom name necklace is AED 220 incl. VAT. Would you like gold-tone or silver-tone?",
    confidence_score: 0.7 + (i % 3) * 0.1,
    approved: i % 3 !== 0,
    approved_by: i % 3 !== 0 ? "owner@beyondstyle.ae" : null,
    created_at: c.created_at,
  }));
}

function generateSettings(): Record<string, unknown>[] {
  return [
    { key: "default_currency", value: "AED", updated_at: isoAt(0) },
    { key: "vat_rate_percent", value: 5, updated_at: isoAt(0) },
    { key: "reservation_window_hours", value: 12, updated_at: isoAt(0) },
    { key: "owner_email", value: "owner@beyondstyle.ae", updated_at: isoAt(0) },
    { key: "support_phone", value: "+971 50 000 0000", updated_at: isoAt(0) },
    { key: "company_legal_name", value: "BEYOND CONNECT GENERAL TRADING L.L.C.", updated_at: isoAt(0) },
    { key: "free_dubai_delivery_threshold_aed", value: 200, updated_at: isoAt(0) },
    { key: "min_review_rating_to_share", value: 4, updated_at: isoAt(0) },
  ];
}

// ----------------------- top-level deterministic build -----------------------

export interface DemoUniverse {
  products: Record<string, unknown>[];
  customers: Record<string, unknown>[];
  conversations: Record<string, unknown>[];
  inventory: Record<string, unknown>[];
  offers: Record<string, unknown>[];
  orders: Record<string, unknown>[];
  payments: Record<string, unknown>[];
  couriers: Record<string, unknown>[];
  deliveries: Record<string, unknown>[];
  suppliers: Record<string, unknown>[];
  reviews: Record<string, unknown>[];
  disputes: Record<string, unknown>[];
  followups: Record<string, unknown>[];
  ai_outputs: Record<string, unknown>[];
  audit_logs: Record<string, unknown>[];
  prompts: Record<string, unknown>[];
  settings: Record<string, unknown>[];
  media_assets: Record<string, unknown>[];
}

let cache: { day: string; data: DemoUniverse } | null = null;

export function buildDemoUniverse(): DemoUniverse {
  // Cache per UTC day so timestamps slide forward without churning each request.
  const day = new Date().toISOString().slice(0, 10);
  if (cache && cache.day === day) return cache.data;

  const rng = mulberry32(20260529);
  const customers = generateCustomers(rng);
  const conversations = generateConversations(rng, customers);
  const inventory = generateInventory(rng);
  const orders = generateOrders(rng, customers);
  const payments = generatePayments(rng, orders);
  const deliveries = generateDeliveries(rng, orders);
  const reviews = generateReviews(rng, customers, orders);
  const disputes = generateDisputes(rng, orders);
  const followups = generateFollowups(rng, customers);
  const audit_logs = generateAuditLogs(rng, orders);
  const ai_outputs = generateAiOutputs(rng, conversations);

  const data: DemoUniverse = {
    products: PRODUCT_CATALOGUE.map((p) => ({ ...p })),
    customers,
    conversations,
    inventory,
    offers: OFFERS.map((o) => ({ ...o })),
    orders,
    payments,
    couriers: COURIERS.map((c) => ({ ...c })),
    deliveries,
    suppliers: SUPPLIERS.map((s) => ({ ...s })),
    reviews,
    disputes,
    followups,
    ai_outputs,
    audit_logs,
    prompts: [], // The Prompts page falls back to DEFAULT_PROMPTS already.
    settings: generateSettings(),
    media_assets: [],
  };
  cache = { day, data };
  return data;
}

export function getDemoTable(table: string): Record<string, unknown>[] {
  const u = buildDemoUniverse() as unknown as Record<string, Record<string, unknown>[]>;
  return u[table] ?? [];
}
