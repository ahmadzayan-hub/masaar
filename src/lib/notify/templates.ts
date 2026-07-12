// Bilingual (AR/EN) thank-you templates sent the moment a customer submits the
// Quick Delivery Form. The message acknowledges receipt and tells the customer
// whether their details passed validation, so Beyond Style can proceed with
// order preparation. Tone matches the existing front-end sales agent.

import type { ValidationResult } from "@/lib/intake/validate";

export interface ThankYouContent {
  whatsappText: string;
  emailSubject: string;
  emailHtml: string;
  emailText: string;
}

function fieldLabel(field: string): string {
  switch (field) {
    case "fullName":
      return "Full name / الاسم الكامل";
    case "mobileNumber":
      return "Mobile number / رقم الجوال";
    case "whatsappNumber":
      return "WhatsApp number / رقم الواتساب";
    case "email":
      return "Email / البريد الإلكتروني";
    case "emirate":
      return "Emirate / الإمارة";
    case "fullAddress":
      return "Delivery address / عنوان التوصيل";
    default:
      return field;
  }
}

export function buildThankYou(name: string, validation: ValidationResult): ThankYouContent {
  const firstName = (name || "").split(/\s+/)[0] || "";
  const errors = validation.issues.filter((i) => i.severity === "error");

  if (validation.valid) {
    const whatsappText =
      `🤍 شكراً لك${firstName ? " " + firstName : ""} من بيوند ستايل الإمارات!\n` +
      `استلمنا بياناتك بنجاح ✅ وجاري تجهيز طلبك للشحن عبر هلال لوجستيك.\n` +
      `رسوم التوصيل داخل الإمارات 25 درهم. سنتواصل معك لتأكيد موعد التسليم.\n\n` +
      `Thank you${firstName ? " " + firstName : ""} from Beyond Style UAE! ✅\n` +
      `We've received and validated your details — your order is now being prepared ` +
      `for dispatch via Halan Logistics. Standard UAE delivery fee is 25 AED. ` +
      `We'll contact you to confirm the delivery time. 🤍`;

    const emailSubject = "Beyond Style UAE — order received & being prepared 🤍";
    const emailText =
      `Thank you${firstName ? " " + firstName : ""} from Beyond Style UAE!\n\n` +
      `We've received and validated your delivery details. Your order is now being ` +
      `prepared for dispatch via Halan Logistics.\n\n` +
      `Standard UAE delivery fee: 25 AED. We'll be in touch to confirm your delivery time.\n\n` +
      `شكراً لك! استلمنا بياناتك بنجاح وجاري تجهيز طلبك للشحن.`;
    const emailHtml =
      `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:560px;margin:auto;color:#111">` +
      `<h2 style="color:#0a7">🤍 Beyond Style UAE</h2>` +
      `<p>Thank you${firstName ? " " + escapeHtml(firstName) : ""}! We've <strong>received and validated</strong> ` +
      `your delivery details. Your order is now being prepared for dispatch via <strong>Halan Logistics</strong>.</p>` +
      `<p>Standard UAE delivery fee: <strong>25 AED</strong>. We'll contact you to confirm your delivery time.</p>` +
      `<hr style="border:none;border-top:1px solid #eee"/>` +
      `<p dir="rtl" style="color:#555">شكراً لك! استلمنا بياناتك بنجاح ✅ وجاري تجهيز طلبك للشحن عبر هلال لوجستيك. ` +
      `رسوم التوصيل داخل الإمارات 25 درهم.</p>` +
      `</div>`;

    return { whatsappText, emailSubject, emailHtml, emailText };
  }

  // Validation failed — ask the customer to correct the flagged fields.
  const enList = errors.map((e) => `• ${fieldLabel(e.field)}: ${e.message}`).join("\n");

  const whatsappText =
    `🤍 شكراً لتواصلك مع بيوند ستايل الإمارات!\n` +
    `استلمنا طلبك، لكن نحتاج لتصحيح بعض البيانات قبل تجهيز الشحنة:\n${enList}\n\n` +
    `Thank you from Beyond Style UAE! We received your form, but we need to fix a ` +
    `few details before we can prepare your order:\n${enList}\n\n` +
    `يرجى الرد بالبيانات الصحيحة / Please reply with the corrected details. 🤍`;

  const emailSubject = "Beyond Style UAE — please confirm your delivery details";
  const emailText =
    `Thank you for your order with Beyond Style UAE.\n\n` +
    `Before we can prepare your shipment, please correct the following:\n${enList}\n\n` +
    `Reply to this email or message us on WhatsApp with the corrected details.`;
  const emailHtml =
    `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:560px;margin:auto;color:#111">` +
    `<h2 style="color:#0a7">🤍 Beyond Style UAE</h2>` +
    `<p>Thank you for your order! Before we can prepare your shipment, please correct the following:</p>` +
    `<ul>${errors.map((e) => `<li><strong>${escapeHtml(fieldLabel(e.field))}</strong>: ${escapeHtml(e.message)}</li>`).join("")}</ul>` +
    `<p>Reply to this email or message us on WhatsApp with the corrected details. 🤍</p>` +
    `</div>`;

  return { whatsappText, emailSubject, emailHtml, emailText };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
