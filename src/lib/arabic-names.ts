// Arabic name accuracy module (spec §4).
// Principle: NEVER blindly transliterate. Only use an Arabic name when we have a
// confident mapping; otherwise fall back to a respectful title with no name.

export interface ArabicNameResult {
  // The verified Arabic spelling, or null when uncertain.
  arabic: string | null;
  // Confidence 0..1 in the mapping.
  confidence: number;
  // What the reply should actually address the customer as.
  safeAddress: string;
  // Human-readable explanation for the operator / name_check field.
  note: string;
}

// Known, owner-approved mappings. Keys are normalised (lowercase, trimmed).
// Multiple spellings can map to the same Arabic name.
const KNOWN_MAPPINGS: Record<string, string> = {
  rehab: "رحاب",
  reham: "ريهام",
  nourhan: "نورهان",
  norhan: "نورهان",
  mariam: "مريم",
  maryam: "مريم",
  fatma: "فاطمة",
  fatima: "فاطمة",
  aisha: "عائشة",
  huda: "هدى",
  mona: "منى",
  sara: "سارة",
  latifa: "لطيفة",
  shamma: "شمّا",
  maitha: "ميثاء",
  noora: "نورة",
  alya: "علياء",
  hind: "هند",
};

// Names the owner asked to keep as-is (Latin) unless the customer themselves
// writes the Arabic spelling.
const KEEP_AS_IS = new Set(["kay", "mumthaz"]);

const ARABIC_RANGE = /[؀-ۿ]/;

function normalise(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

// Pull the first token of a (possibly multi-part) display name.
function firstToken(name: string): string {
  return normalise(name).split(" ")[0] ?? "";
}

const TITLE_FEMALE = "أستاذة";
const TITLE_MALE = "أستاذ";

/**
 * Resolve how to address a customer in Arabic.
 * @param displayName  Name as shown on the platform profile.
 * @param customerWroteArabic  The customer's own Arabic spelling, if they typed it.
 * @param assumeFemale  Default UAE social-commerce audience skews female; the
 *                      neutral fallback title respects this without profiling.
 */
export function resolveArabicName(
  displayName: string | null | undefined,
  customerWroteArabic?: string | null,
  assumeFemale = true
): ArabicNameResult {
  const title = assumeFemale ? TITLE_FEMALE : TITLE_MALE;

  // 1. If the customer themselves wrote their name in Arabic, trust it.
  if (customerWroteArabic && ARABIC_RANGE.test(customerWroteArabic)) {
    const cleaned = customerWroteArabic.trim();
    return {
      arabic: cleaned,
      confidence: 1,
      safeAddress: cleaned,
      note: "Customer provided their own Arabic spelling — used verbatim.",
    };
  }

  if (!displayName || !displayName.trim()) {
    return {
      arabic: null,
      confidence: 0,
      safeAddress: title,
      note: "No name available — used respectful title only.",
    };
  }

  // If the display name is already Arabic script, use it directly.
  if (ARABIC_RANGE.test(displayName)) {
    return {
      arabic: displayName.trim(),
      confidence: 0.95,
      safeAddress: displayName.trim(),
      note: "Display name is already in Arabic script.",
    };
  }

  const token = firstToken(displayName);

  if (KEEP_AS_IS.has(token)) {
    return {
      arabic: null,
      confidence: 0,
      safeAddress: displayName.trim(),
      note: `"${displayName.trim()}" kept as-is per name policy (no confirmed Arabic spelling).`,
    };
  }

  const mapped = KNOWN_MAPPINGS[token];
  if (mapped) {
    return {
      arabic: mapped,
      confidence: 0.9,
      safeAddress: mapped,
      note: `Mapped "${token}" → ${mapped} via approved mapping.`,
    };
  }

  // Unknown name: do NOT transliterate. Fall back to title or profile name.
  return {
    arabic: null,
    confidence: 0,
    safeAddress: title,
    note: `No confirmed Arabic spelling for "${displayName.trim()}". Used title to avoid wrong transliteration.`,
  };
}

// Detect whether a drafted Arabic reply contains a transliterated name that we
// could NOT verify — used by the guardrail engine.
export function replyUsesUnverifiedArabicName(
  reply: string,
  result: ArabicNameResult
): boolean {
  if (!ARABIC_RANGE.test(reply)) return false;
  // If we have no verified name but the reply addresses someone by an
  // Arabic word right after a greeting/title slot, that's a risk we surface.
  // We can't fully parse Arabic, so we flag only when confidence is 0 AND the
  // reply does not contain the safe title.
  if (result.confidence === 0 && result.arabic === null) {
    const hasSafeTitle = reply.includes(TITLE_FEMALE) || reply.includes(TITLE_MALE);
    return !hasSafeTitle;
  }
  return false;
}
