// Beyond Style UAE — brand voice & consumer-compliance constants (agent spec).
// Centralizes the approved material wording and the mandatory care notice so
// customer-facing copy stays within UAE Consumer Protection Law.

// Products are described ONLY as fashion jewellery / accessories.
export const PRODUCT_DESCRIPTOR_EN = "Fashion Jewellery";
export const PRODUCT_DESCRIPTOR_AR = "إكسسوارات أزياء";

// The only approved material descriptions (use exactly; never "real gold",
// "waterproof", "lifetime colour", etc. without certified proof).
export const APPROVED_MATERIALS = [
  "316L Surgical Stainless Steel (PVD Vacuum Plated)",
  "Solid 925 Sterling Silver",
] as const;

// Mandatory care notice returned on any material query (bilingual).
export const CARE_NOTICE_EN =
  "Keep away from direct water, concentrated perfume, alcohol sanitizers, and high friction.";
export const CARE_NOTICE_AR =
  "يُحفظ بعيداً عن الماء المباشر، والعطور المركزة، والمعقمات الكحولية، والاحتكاك الشديد.";

// Reassuring closing line every customer reply should end with (spec Tone).
export const CLOSING_LINE_EN = "We're right here for you every step of the way 🤍";
export const CLOSING_LINE_AR = "نحن دايماً بخدمتك خطوة بخطوة 🤍";
