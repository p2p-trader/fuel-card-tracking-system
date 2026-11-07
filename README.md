# Fuel Card Tracking System

**For:** Kompass Pakistan Pvt Ltd
**Platform:** Google Apps Script web app · Database: Google Sheets
**Status:** Phase 1 built (2026-11-07) — see [DEPLOY.md](DEPLOY.md) for the one-time activation steps

## What it does

Tracks fuel cards, vehicles, drivers and trips for a company fleet:

- Fuel cards with per-card monthly limits in **Litres** (reset on the 1st), opening balances for cards already in use, alternate-card use, expiry warnings and a lost/replaced-card flow
- Three fuel sources per entry — **Card / Cash / Company Tank** — each with its own compulsory, unique document number (Tracking ID / Receipt No. / Issue Voucher No.); duplicates are blocked
- Vehicles with live tank balances (usage = km run ÷ standard average), tank capacity, vehicle-problem records with temporary averages, and service-due reminders
- Drivers (name only) with vehicle-assignment history; every entry and trip auto-shows the driver active on that date
- Trips with an open → close flow and a **meter cross-check** that flags unexplained kilometres
- A checking engine: slip-vs-system mismatches flagged (never silently passed), over-limit entries blocked, meter rules, tank audits flagging even 1 Litre, month-end locking, and a full audit history of every change
- Users with in-system username/password login; Admin duplicates his profile and ticks from **22 permissions**; card PINs visible only with the View PIN permission
- A 10-panel dashboard (summary, cards with finish forecasts, Needs Attention, tanks, Vehicles Out Now, source split, 30-day chart, Top 5 consumers, recent activity, quick actions + document search)
- 9 reports (cards, vehicles, ledger, alternate-card, flagged, source, driver, tank audit, trips) as Excel download and Print/PDF
- Startup wizard, demo data by button only, bulk CSV/Excel import, backup + safe restore, year archiving, Light/Dark themes with brand color and pasted-SVG logo, and a **read-only JSON API** for other applications

## Documents

- [REQUIREMENTS.md](REQUIREMENTS.md) — the complete, confirmed specification (Q1–Q53, confirmed 2026-11-07)

## Roadmap

- **Phase 1:** Kompass only, single company, Apps Script + Google Sheets — nothing company-specific hard-coded, so the same system can be deployed per client later
- **Phase 2 (later):** multi-company platform with a real database, if/when offered to other companies

## Notes

- No real card numbers or PINs are stored in this repository — PINs live only inside the deployed system, visible only to users with the View PIN permission
- Companion working copy of the requirements also lives in the owner's files as `fuel-card-system-requirements.md`
