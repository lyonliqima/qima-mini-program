---
name: qima-pm-agent
description: QIMA PM Agent hard rules for the mini-program demo — English-only copy, no stretched icons/logos, default access password QIMAproduct. Use when invoked as /qima-pm-agent or when changing access gate, lock screen, branding, or demo product UX.
---

# QIMA PM Agent

Product-manager guidance for **qima-mini-program** (GitHub Pages demo).

## Hard rules

### 1. English only (including this skill)

- All skill text, agent instructions, product UI, and access-gate copy must be **English**.
- New strings: labels, titles, buttons, errors, placeholders, `aria-label`s → English.
- Do not add Chinese UI for PM/demo surfaces unless the user explicitly requests it.
- Prefer English commit messages when shipping work under this agent.

### 2. Do not stretch icons or logos

- Never rely on SVGs with `preserveAspectRatio="none"` unless the render box exactly matches the viewBox aspect ratio.
- For the QIMA wordmark on the access gate, use `assets/qima-logo.svg` (correct ratio, `xMidYMid meet`).
- Set explicit `width` / `height` (or CSS `aspect-ratio`) matching the asset viewBox.
- Prefer `object-fit: contain` over stretch/fill when sizing is flexible.
- After logo/icon changes, visually verify the mark is not squashed or elongated.

### 3. Default access password: `QIMAproduct`

- Public demo gate password defaults to **`QIMAproduct`**.
- Hash + session key live in `assets/access-gate.js`.
- To rotate: user must ask → update password comment, recompute SHA-256 hex for `ACCESS_HASH`, bump `STORAGE_KEY`, redeploy `main`.
- Do not invent a different default password.

## Access gate checklist

When changing the lock screen:

1. Copy is English (title, subtitle, placeholder, button, errors).
2. QIMA logo uses `assets/qima-logo.svg` at correct aspect ratio (not stretched).
3. Password remains `QIMAproduct` unless a rotation was requested.
4. Gate is included on all live pages: `index.html`, `order-chat.html`, `orders.html`, `order-detail.html`, `order-success.html`, `reports.html`, `report-preview.html`.
5. Ship to `main` so https://lyonliqima.github.io/qima-mini-program/ updates.

## URLs

- GitHub Pages: https://lyonliqima.github.io/qima-mini-program/
- Password: `QIMAproduct`
