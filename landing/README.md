# Beyond Style UAE — Landing Page

Premium bilingual (Arabic-first / English) landing page that converts Instagram
and WhatsApp visitors into orders. Pure static HTML/CSS/JS — no build step, no
backend required: ordering flows through **WhatsApp** and the **Google order
form**, so the page can be hosted anywhere (GitHub Pages, Vercel, Netlify,
Cloudflare Pages) and loads fast on mobile.

> This page is self-contained: everything it needs lives inside `landing/`.
> Orders flow through WhatsApp and the Google order form, so it works without
> any other app in this repository.

## Structure

| Path | Purpose |
| --- | --- |
| `index.html` | The complete landing page (all sections, bilingual copy, JSON-LD SEO). Every icon is defined once in an inline SVG sprite at the top of `<body>` and reused with `<use href="#i-...">` — edit an icon in one place only |
| `css/style.css` | Luxury design system — ink black, warm gold, ivory, soft beige |
| `js/main.js` | Language toggle (AR ⇄ EN with RTL/LTR switch), prefilled WhatsApp links, scroll reveal. Links and WhatsApp messages are loaded from `config/site.config.json` — no duplicated strings in JS |
| `config/site.config.json` | **Single source of truth** for branding, links, WhatsApp messages, categories, gallery and compliance configuration |
| `assets/img/*.webp` | Optimized product photography (crops of the brand's Instagram creatives) |
| `assets/qr/*.svg` | Real scannable QR codes for Instagram and WhatsApp |
| `favicon.svg` | BS monogram favicon |

## Sections

1. Hero — bilingual headline, WhatsApp + order-form CTAs above the fold, Instagram/WhatsApp QR cards
2. Featured categories (8 cards: name bracelets, calligraphy necklaces, baby bracelets, MashaAllah, evil eye, car pendants, gift sets, custom orders)
3. Why Beyond Style UAE (4 trust cards)
4. How to Order (4 steps)
5. Custom order band → Google Form
6. Sticky WhatsApp FAB with a suggested prefilled message (language-aware)
7. Instagram-style gallery → follow CTA
8. Product information / compliance note (materials confirmed per item — no unverified claims)
9. FAQ (6 questions, `<details>` accordion, mirrored in FAQPage JSON-LD)
10. Footer

## Language behavior

- Default is **Arabic (RTL)**; the header toggle switches to English (LTR).
- Both languages are in the DOM (`.ar` / `.en` spans); CSS shows the active one
  based on `<html lang>`. The choice persists in `localStorage`.
- All WhatsApp links (`.js-wa`) get a prefilled message in the active language,
  sourced from `config/site.config.json`. If JS or the config fails to load,
  the static `wa.me` links still work — just without the prefilled text.

## Compliance rules (important)

Copy never claims 925 silver, real gold, waterproof, anti-tarnish, or warranty.
Material, color, size, availability and customization are confirmed on WhatsApp
per item before each order — this wording is baked into the Product Information
section and the FAQ. Keep it that way when editing copy (see
`config/site.config.json → compliance.note`).

## Preview locally

```bash
cd landing
python3 -m http.server 8080
# open http://localhost:8080
```

## Links

- WhatsApp: <https://wa.me/971551556991>
- Instagram: <https://www.instagram.com/beyond.style.uae>
- Order form: <https://forms.gle/wyHSJdYYGLJovAUBA>
