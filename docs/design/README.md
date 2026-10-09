# Handoff: Riverline Run — fun run website (5K → Full Marathon)

## Overview
Single-page charity race site: hero, interactive route maps (5K / 10K / Half / Full), race jersey + finisher shirts (Half & Full), finisher medals, charity description (Clearwater Collective), and a registration flow with **sandbox (test) payments**, success screen with race bib, and an HTML confirmation email.

## About the files
- `riverline-php/` — **working PHP 8 implementation** (high-fidelity, final look + behavior). Can be used as the starting codebase directly, or ported into an existing stack (Laravel, Next.js, etc.) keeping identical visuals, motion and pricing logic.
- `reference/Riverline Run.dc.html` — the original design prototype (visual reference only, same design).

Run locally: `cd riverline-php && php -S localhost:8000` → http://localhost:8000

## Fidelity
**High-fidelity.** Colors, type, spacing, animation timings and copy are final. Event name, charity, figures and route geometry are placeholder content. Shirts/medals are SVG/CSS mockups — swap for real artwork when available. The cause section has a photo placeholder.

## File map
- `data.php` — single source of truth: distances, **prices**, routes (SVG path), elevation, highlights, medal styling, sizes, donation options, `FEE_RATE`, test cards, `SEND_EMAIL`, `FROM_EMAIL`. Helpers `h()`, `elev_points()`, `order_totals()`.
- `index.php` — the page, server-rendered from `data.php`; injects `window.RL = {routes, feeRate}` for the client.
- `checkout.php` — POST endpoint → JSON. Validates, simulates gateway (~0.9s), approves/declines test cards, writes `orders/{CONF}.json` + `test-orders.log`, calls `send_confirmation()`.
- `mail.php` — `render_email($order)` (table-based inline-styled HTML email, mobile media query) + `send_confirmation()` via `mail()`.
- `email.php` — preview: `email.php?c=RL-TEST-XXXXXX`, or no param for sample order.
- `assets/style.css` — base styles + tokens. `assets/motion.css` — all animation. `assets/responsive.css` — breakpoints. `assets/app.js` — tabs, reveal, route drawing, form, checkout, menu.

## Pricing (data.php)
| Distance | Price | Includes | Start | Corral |
|---|---|---|---|---|
| 5K | $35 | Medal | 9:30 AM | D |
| 10K | $45 | Medal | 8:45 AM | C |
| Half 21.1K | $75 | Medal + finisher shirt | 7:30 AM | B |
| Full 42.2K | $95 | Medal + finisher shirt | 6:45 AM | A |

- Donation options: $0 / 10 / 25 / 50 / 100 (default $10).
- Fee = `round((price + donation) * 0.025, 2)`; Total = price + donation + fee.
- Computed **server-side** in `checkout.php` (client totals are display-only; never trust client price).
- Jersey sizes: XS–XXL (default M).

## Test payments
- `4242 4242 4242 4242` → approved. `4000 0000 0000 0002` → declined. Others → "Only test cards are accepted".
- Expiry `MM/YY`, CVC 3–4 digits. "Fill success/decline card" buttons autofill.
- To go live: replace the card check in `checkout.php` with a real gateway (e.g. Stripe PaymentIntents + Elements, test keys first). Never post raw card numbers to your own server in production.
- Validation errors returned as `{ok:false, errors:{name|email|card}}`; success `{ok:true, order:{confirmation,bib,name,firstName,email,distanceId,distance,full,km,start,corral,size,includes,last4,totals,created,emailSent}}`.

## Screens / sections
1. **Test banner** — orange full-width strip, mono 12px, lists test cards.
2. **Header** — logo mark + "RIVERLINE RUN" (Archivo 800, 125% width); nav: Routes, Shirts & Medals, The Cause, Register (navy pill). ≤860px: sticky blurred header, Register pill + hamburger → dropdown menu.
3. **Hero** — 2-col grid (min 460px). Date/location chips, H1 "Run the riverline." (Archivo 900, clamp 56–128px, line-height .86, uppercase, "river" in orange), body 19px, CTAs. Right: navy map card (radius 28) with full-marathon route.
4. **Routes** (navy bg) — tab pill group; map card (paper bg, 30px grid, river band, bridges, route line, start/finish); km display (clamp 64–104 orange), blurb, 4 stat cells (START / GAIN / AID STATIONS / CUTOFF), elevation profile, 3 highlights.
5. **Wear it. Earn it.** — 3 shirt cards (radius 24, pad 24): Race Jersey (sand `#E4DCCB`), Half finisher (orange), Full finisher (navy). Medals row: 4 cards, ribbon + disc sized 120/134/150/168px by distance, bronze/silver/gold/enamel.
6. **The Cause** (river blue `#9CC8D9`) — photo placeholder + "Every kilometer keeps a river running clean." + 3 impact stats ($20 / 14 km / 31).
7. **Register** — left: 01 distance cards, 02 size, 03 donation pills, 04 name/email, 05 card/exp/cvc. Right: sticky navy order summary + orange pay button "PAY $X (TEST)".
8. **Success** — navy card "You're in, {first}." + confirmation details + rotated bib card (big number, corral, start). Buttons: open email ↗, run another test.
9. **Email preview** — mock inbox (sender row, subject with TEST tag) + iframe of `email.php?c=…`, auto-sized.
10. **Footer** — navy.

## Animations (assets/motion.css + app.js)
Easing `--ease: cubic-bezier(.2,.7,.1,1)` throughout.
- **Hero load:** H1 lines slide up from 105% (1s, staggered .1s / .22s); chips, paragraph, CTAs, map fade up 24px (.9s, delays 0/.4/.52/.3s).
- **Hero route draw:** `pathLength="1"`, dasharray 1 → dashoffset 1→0, 3.2s `cubic-bezier(.6,.05,.3,1)`, delay .6s. Then a runner dot follows the path via SVG `<animateMotion>` (14s loop, begins 3.8s).
- **Scroll reveal (lazy fade-in):** `[data-reveal]` opacity 0 + translateY(32px) → visible on IntersectionObserver (threshold .18, rootMargin bottom −40px), .9s. `[data-stagger]` children reveal with 90ms × index delay.
- **Route map:** draws when scrolled into view and redraws on every tab change (2.2s); dotted overlay + runner dot (9s loop) fade in after draw. Elevation line draws 1.6s (delay .3s), area fades to .22 opacity. Stats/blurb/highlights "swap" in (.5s fade+10px).
- **Medals:** pendulum swing on reveal (1.4s, 120ms stagger); hover rotate −8° scale 1.04.
- **Shirts:** hover lift −6px, rotate −.6°, shadow `0 24px 48px rgba(16,35,58,.18)`, svg scale 1.04.
- **Impact numbers:** count up over 1.4s, ease-out cubic.
- **Buttons:** hover −2px lift; active scale .97. Pay button shimmer gradient while processing.
- **Errors:** card error box shakes (.4s). **Success:** card rises; bib flies in from rotate 6°/scale .9 to rotate −2°. Inbox rises after .6s. Page smooth-scrolls to #register.
- **Scroll progress bar:** 3px orange, fixed top, scaleX = scroll %.
- `prefers-reduced-motion`: all animations disabled, content shown immediately.

## Responsive (assets/responsive.css)
- **≤860px:** 20px gutters; sticky header + hamburger menu; hero map tags hidden; route tabs 4-col grid; stats 2×2; medals 2-col (disc max 34vw); distance options 2-col; order summary static (not sticky) below form; success buttons stacked.
- **≤520px:** H2 44px; H1 clamp 48–72px; name/email full width, card number full width with exp/cvc halved; donation/size buttons flex 3 per row; impact stats stack as rows; footer stacks.
- **Email:** ≤620px media query — padding 18px, headline 34px, bib 72px, detail cells 2-col.

## Design tokens
Colors:
- Paper `#F3EFE6` · Ink/Navy `#10233A` · Navy 2 `#1A3552` · Line `#33506F` · Map river dark `#1E4466`
- Accent orange `#FF5A1F` · River blue `#9CC8D9` · Sand `#E4DCCB` · Medal border `#D6CDB9` · Map grid `#E0D8C7`
- Input bg `#FBF9F4` · Error `#C2330A` on `#FBE3D9` · Full shirt black `#0A0F16`
- Medals: bronze `#E3A774→#9C5B2E`, silver `#F1F3F5→#9AA4AE`, gold `#FFE08A→#C08A1E`

Type (Google Fonts):
- Display: **Archivo** (wdth 62–125, wght 400–900), mostly 900 @ font-stretch 125%, letter-spacing −.03em
- Body: **Instrument Sans** 400/500/600
- Labels/data: **JetBrains Mono** 600, 11–13px, letter-spacing .06–.08em
- Email uses Helvetica/Arial + Menlo fallbacks (email-safe).

Radii: pill 999px · cards 24px · hero map 28px · inputs/size buttons 12px · option cards 16px · tags 4–6px.
Shadows: medal `inset 0 0 0 6px rgba(255,255,255,.28), inset 0 0 0 9px rgba(0,0,0,.15), 0 10px 24px rgba(16,35,58,.22)`; bib `0 20px 40px rgba(0,0,0,.3)`.
Spacing: section padding 72–80px desktop / 56px mobile; gutters 28px / 20px; max-width 1240px.

## Email
Sent on successful test payment when `SEND_EMAIL = true` (data.php) and server `mail()` is configured. For production use a transactional provider (Postmark, SES, Resend). Subject: `You're in — Bib #{bib} · Riverline Run 2027 [TEST]`. Sections: test banner, navy hero, bib card, 4 detail cells, receipt, what's next (3 steps; finisher shirt line only for Half/Full), donation thank-you, footer.

## Assets
No external images. All shirts, medals, maps are inline SVG/CSS. Needed from client: logo, real shirt/medal artwork, cause photo, real GPX routes (convert to SVG paths or render with a map library).

## Suggested next steps for Claude Code
1. Run locally and verify flows (approve, decline, validation, email preview, mobile).
2. Replace sandbox card check with a real payment gateway in test mode.
3. Move orders from JSON files to a database; add CSRF token + rate limiting on `checkout.php`.
4. Swap placeholder content/artwork.
