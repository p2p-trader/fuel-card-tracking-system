# Fuel Card Tracking System — Requirements (Final)

**Company:** Kompass Pakistan Pvt Ltd
**Platform:** Google Apps Script web app, database = Google Sheets
**Status:** Requirements COMPLETE — confirmed by Syed Bakhtawar Shah, 2026-11-07 (Q1–Q53, final confirmation 22:35 PKT). Build starts only on his explicit go-ahead.

## 1. Purpose
Track fuel cards, vehicles and driver fuel fills. A driver fills fuel at a pump and shows the pump slip (date, time, price, Tracking ID, litres filled, remaining balance in card). Staff enter the slip into the system; the system controls card limits, vehicle tank balances and consumption.

## 2. Fuel Cards
- Card Number; PIN (the card "CODE" — secret, see §7); Card Company/Provider; Status Active/Inactive.
- Monthly Limit in **Litres**, **different for each card**, editable per card.
- Limit **resets on the 1st of every month** (calendar month). Used/Remaining are calculated per calendar month automatically.
- At registration, Admin enters the card's **current Active Remaining Balance (Litres)** from its latest slip, because cards are already in use. The system deducts new entries from that opening remaining for the rest of that month, then resets to the full limit on the 1st of the next month.
- Each card is primarily assigned to one vehicle, but any vehicle may use another card (see §4).

## 3. Vehicles
- Registration No.; Vehicle Name/Model; **Fixed Fuel Type** (auto-fills on entries).
- Assigned Fuel Card (number + PIN).
- Opening/Current Meter Reading (odometer km).
- **Standard Average (km/Litre)** — provided by Admin at registration; used for usage calculation.
- **Tank balance tracked LIVE:** Tank Balance = Previous Tank + Filled − Used, where Used Litres = Km Run ÷ Standard Average.
- Ownership: Company Own, or Third-Party on contract (contractor/owner name recorded).
- Status Active/Inactive.
- Counts of vehicles/cards/drivers/users are not fixed — the system must handle any number.

## 4. Fuel Entries (from pump slip)
**Compulsory:** Date; Time; Vehicle; Card Used (default = vehicle's own card; an alternate card can be selected and the entry is flagged as alternate-card use); Pump (selected from a managed Pump list, new pump can be added); Tracking ID; Litres Filled; Remaining in Card on Slip (Litres); Meter Reading.
**Optional (record only):** Rate per Litre (Rs/Ltr); Total Amount (Rs). Finance is NOT a focus — no finance reports, no money checking as a core feature.
**Auto-calculated:** Driver (the driver active for that vehicle on the slip date); Fuel Type; Km Run; Used Litres; Tank Balance After Fill; System Remaining of the card.
**No slip photo upload.**

## 5. Drivers
- Driver record = **Name only**.
- Drivers are NOT fixed to a vehicle. The system keeps a **vehicle–driver assignment history**: which driver started on a vehicle and from when. If no change is recorded, the last driver stays active automatically.
- Each fuel entry auto-shows the driver who was active on the **slip date** (drivers may share slip details days later).

## 6. Checking / Validation Rules
- **Tracking ID must be unique** — a duplicate Tracking ID is BLOCKED (prevents double entry of the same slip).
- **Slip Remaining ≠ System Remaining → WARN & FLAG** the entry, but ALLOW saving. Flagged entries stay visible for investigation.
- **Entry Litres > card's Remaining → BLOCK saving.**
- **Back-dated entries are allowed** for any permitted user; the system inserts them in date/time order and recalculates all affected later tank balances and card remaining figures.
- Meter reading is compulsory — no save without it.

## 7. Users, Login & Permissions
- Users: Admin (Syed Bakhtawar, 100% permission) + staff members.
- Login: **username & password created inside this system** (no Google/Gmail login needed). Passwords stored protected, not as plain readable text.
- New staff user = **duplicate of the Admin profile**, then Admin ticks/unticks permissions for that user.
- Final permission checklist — **22 ticks** (Q27 + Tank Audit tick Q33 + 5 ticks added Q43 + 2 trip ticks Q51, 2026-11-07): View Dashboard; View Fuel Entries; Add Fuel Entry; Edit Fuel Entry; Delete Fuel Entry; Add/Edit Vehicle; Add/Edit Fuel Card; Change Monthly Limit; **View Card PIN** (PIN visible only with this tick, masked/hidden otherwise); Add Driver / Change Vehicle Driver; View Reports; Export/Print Reports; View Change History; Manage Users & Permissions; Tank Audit / Adjustment; **Resolve Flagged Entries** (mark a flag checked, with a note); **Manage Settings** (company branding, low-card %, km-jump limit); **Month Lock / Unlock**; **Download Backup**; **Manage Pump List**; **View Trips**; **Manage Trips** (add/edit/delete trips).
- Coverage: cash and company-tank entries ride on Add Fuel Entry; card replace/close rides on Add/Edit Fuel Card; driver Active/Inactive rides on the driver tick; vehicle average/capacity changes ride on Add/Edit Vehicle.
- **Full audit history:** every create/edit/delete is logged — who, what, when.

## 8. Dashboard & Alerts (full layout confirmed Q42, 2026-11-07)
Alerts are dashboard-only — no email alerts. Low card = **20% or less** of its monthly limit remaining, shown RED.
1. **Top summary strip:** total litres this month (all sources); this month vs last month; active cards; active vehicles; entries today; flagged entries awaiting check.
2. **Cards panel:** every card with remaining bar + Used/Remaining in Litres; low cards red; clicking a card opens that card's entries. Each card also shows a **finish forecast** (added Q53): at its current daily usage pace, the projected date its remaining runs out.
3. **Needs Attention panel:** slip mismatches; tank audit differences; negative tanks; over-capacity tanks; meter jump warnings; cards expiring within 30 days; today's alternate-card uses; **unexplained-km flags** from the trip cross-check; **service due / overdue** vehicles; **trips open too long** (day limit adjustable in Settings) — the last three added Q52/Q53.
4. **Vehicle tank panel:** every vehicle's tank level against its capacity; near-empty, over-capacity and negative tanks flagged.
5. **Source split (this month):** litres by source — Card / Cash / Company Tank.
6. **Consumption chart:** daily litres, last 30 days.
7. **Recent activity:** latest 10 entries + latest audit-history changes.
8. **Quick actions + search:** Add Entry button; Tank Audit button; search by Tracking ID / Receipt No. / Voucher No. jumps to that entry.
9. **Vehicles Out Now** (added Q53): every vehicle on an open trip — vehicle, driver, destination, out since.
10. **Top 5 vehicles by consumption this month** (added Q53).
- Every user sees only the dashboard parts his permissions allow.

## 9. Reports (Excel download AND Print/PDF)
1. Monthly Card Report — per card: Limit, Used, Remaining.
2. Monthly Vehicle Report — per vehicle: Litres filled, Km run, Average, Tank balance.
3. Fuel Ledger — all entries, filters: date / vehicle / card / pump / driver.
4. Alternate Card Report — entries where a vehicle used another vehicle's card.
5. Flagged Entries Report — all mismatch/warning entries, Open and Resolved.
6. Source Report — monthly litres by source: Card / Cash / Company Tank (added Q48).
7. Driver Report — fuel and km per driver per month (added Q48).
8. Tank Audit Report — all tank adjustments with differences, reasons and auditors (added Q48).
9. Trip Report — trips per vehicle or per driver: from/to, purpose, km, dates (added Q51).

## 10. Devices
Used on **both mobile and computer** — fully responsive design.

## 12. Cash / Pocket Fills (added Q35, 2026-11-07)
If a fuel card is not working at the pump, the driver may pay cash from his own pocket.
- Every fuel entry has a **Payment Method: Card or Cash**.
- A **Cash** entry deducts nothing from any card — card limit and remaining are untouched — but the vehicle tank balance, meter, km run and average calculations work exactly as for a card fill.
- The entry records who paid and the reason (e.g. "Card not working").
- **No reimbursement tracking** — the system does not track Pending/Paid repayment to the driver.
- The pump's cash receipt has a **Receipt No. — compulsory and unique** on cash entries; a duplicate Receipt No. is blocked, same as Tracking ID on card entries. "Remaining in Card on Slip" does not apply to cash entries.
- Total Amount / Rate on cash entries: **optional**, same as card entries (record only).

## 13. Company Tank Issues (added Q38, 2026-11-07)
Fuel is sometimes issued to a vehicle directly from the company's own tank — no card, no pump.
- Fuel entries have **three sources: Card / Cash (pump) / Company Tank**. (The earlier "Payment Method" field is this source field.)
- A company-tank issue deducts nothing from any card; vehicle tank balance, meter, km and average work exactly as for other fills.
- **The company tank's own stock is NOT tracked** — no tank balance, no refill records, no audit for the company tank. It exists in the system only as an entry source.
- Company-tank entries carry an **Issue Slip / Voucher No. — compulsory and unique**; duplicates are blocked. (Pump field does not apply — the issue happens at the company premises.)
- Entry document numbers by source: Card → Tracking ID; Cash → Receipt No.; Company Tank → Issue Voucher No. All three are compulsory and unique.

## 14. Roadmap (added Q40, 2026-11-07)
- **Phase 1 (this build):** Kompass only, single company, Google Apps Script + Google Sheets, exactly as specified above.
- **Later:** he wants to offer this system to other companies. To keep that door open cheaply, Phase 1 must avoid Kompass-specific hard-coding: company name/branding will be editable in Settings, and lists (pumps, providers) stay generic data, not code.
- **Future client model:** each company gets its own separate deployment and its own Sheet — data fully separate between companies.
- A shared multi-company platform with a real database is a possible Phase 2 later — NOT part of this build, and the Phase 1 rules/design carry over unchanged.

## 15. Gap Additions (added Q41, 2026-11-07 — all approved)
1. **Vehicle Tank Capacity (Litres)** — new vehicle field. A calculated tank balance above capacity is flagged as impossible.
2. **Negative tank auto-flag** — if calculated usage pushes a vehicle's tank below zero, the entry is flagged (indicates a missing entry or a wrong standard average).
3. **Meter checks** — a meter reading lower than the vehicle's last reading is BLOCKED. An unusually large km jump on a single entry WARNS (threshold adjustable in Settings).
4. **Card lost / replaced + Expiry Date** — cards gain an Expiry Date field. Closing a lost/blocked card preserves its full history; a replacement card takes over the vehicle; the change is recorded in the audit history.
5. **Month-end lock** — a locked month's entries cannot be edited or deleted; only Admin can lock/unlock a month.
6. **Driver status** — drivers gain Active/Inactive status. An inactive driver cannot be newly assigned, but his assignment and entry history is kept.
7. **Backup** — Admin can download the complete system data in one click.
8. **Dashboard content** — all cards with remaining bars; low cards (≤20%) in red; today's entries; flagged-entries count; quick search by Tracking ID / document number.

## 16. Data Storage & First Launch (added Q44, 2026-11-07)
- **One Google Sheet = the database**, with 12 tabs, created automatically by the system on first run: Users; Vehicles; Cards; Drivers; DriverAssignments; Pumps; Entries; TankAudits; AuditLog; Settings; VehicleProblems; Trips. One row = one record. Staff never open the Sheet directly — they only use the app; the Sheet stays in the owner's Google account.
- **First-ever launch** (no users exist): a one-time **Startup Wizard** replaces the login screen; after setup it never appears again. Step 1 — Company: Name (compulsory), Logo as pasted SVG code (optional, Q50 — no file upload), Address/Phone (optional, printed on reports). Step 2 — Admin account: full name, username + password, and a **recovery email** (a password-reset link is emailed there — the only recovery route for in-system passwords). Step 3 — Defaults, pre-filled: low-card alert 20%, card-expiry warning 30 days, meter-jump warning limit (all adjustable later in Settings). Step 4 — Finish: Load Demo Data or Start Empty, then the dashboard opens. Vehicles/cards/drivers/pumps are added afterwards from their own screens, not in the wizard.
- **Demo data is NOT loaded automatically.** First launch starts empty. Settings (Manage Settings permission) provides a **Load Demo Data** button: 3 sample vehicles, 3 sample cards (DEMO-001 style numbers), 4 sample drivers, sample pumps, and sample entries covering a normal card fill, an alternate-card fill, a cash fill, a company-tank issue, one flagged mismatch and one tank audit.
- Demo rows are internally marked; a **Clear Demo Data** button removes only demo rows — real data can never be deleted by it.

## 17. Vehicle Problems (added Q46, 2026-11-07)
A vehicle with a mechanical problem (engine trouble, leakage, tuning) burns more fuel than its Standard Average.
- A **Vehicle Problem record** is opened on the vehicle: start date + problem note. While open, the vehicle shows a **Problem badge** on the dashboard, and fuel entries in the period are marked **Problem Period** — so extra consumption is never mistaken for theft or error.
- An optional **Temporary Average (km/L)** can be set on the problem record; Used-Litres calculations use it only while the problem is open, then the Standard Average resumes automatically when the problem closes.
- The problem is closed with an end date + repair note; the vehicle keeps a full problem history. A closing Tank Audit's difference can be linked to the problem record as its explanation.
- Stored in a new **VehicleProblems** Sheet tab (12 tabs total with Trips, Q51). Opening/closing a problem rides on the Add/Edit Vehicle permission.

## 18. Read-Only API (added Q47, 2026-11-07)
Other applications can read this system's data as JSON — they can never change it (no write API in Phase 1).
- Endpoints: `/api/vehicles` (with tank balances); `/api/cards` (limit/used/remaining — **PINs are never returned**); `/api/entries` (filters: date range, vehicle, card, pump, driver, source); `/api/dashboard` (summary numbers); `/api/reports/monthly`.
- Every request needs an **API key**. Keys are generated/revoked in Settings (Manage Settings permission). No key = no data.
- Every API call is logged in the audit history (which key, when, what was requested).
- Passwords and PINs are never included in any API response.

## 19. Round-2 Additions (added Q48, 2026-11-07 — all approved)
- **Flag workflow:** every flag is **Open → Resolved**. Resolving requires a note and records who resolved it and when (Resolve Flagged Entries permission). Resolved flags leave the Needs Attention panel but remain in the Flagged Entries Report permanently.
- **Company Tank fuel type:** set once in Settings. Issuing company-tank fuel to a vehicle whose fixed fuel type differs is BLOCKED.
- **Restore:** Admin can restore from a backup file (same Download Backup permission — it is the sensitive-data tick). Restore demands a strong confirmation, and the system automatically downloads the current data as a backup first, so restoring never silently destroys current data. Every restore is written to the audit history.
- **User account lifecycle:** a user can be deactivated (login stops; his name remains in history). Every user can change his own password; Admin can reset a staff member's password.
- **Bulk import:** vehicles, cards, drivers and pumps can be imported from an Excel/CSV file at setup, validated by the same rules as the on-screen forms (Manage Settings permission). Bad rows are reported by row number and skipped, never half-saved.
- **Auto-logout:** after 30 minutes of inactivity, the user is logged out automatically.

## 20. Themes & Branding (added Q49, 2026-11-07)
- **Light and Dark themes.** Each user picks his own with a toggle; the choice is remembered per user.
- **Brand color:** Admin picks the accent color from professional presets in Settings (Manage Settings permission). Company name + logo (from the setup wizard / Settings) appear on the login screen, top bar, and printed reports — so another company can make the system look like theirs without code changes.
- **Logo = pasted SVG code, no file upload (Q50):** the Admin pastes the logo's SVG code into a box in Settings (and in the wizard's Step 1). The code is stored as text in the Settings tab, validated and sanitized on save (scripts, event handlers and external references stripped, allowlist-based), and shown with a live preview. If no logo code is set, the company name shows as text instead.
- Design rule: professional and simple, big readable numbers for litres/remaining, red reserved for warnings (low cards, flags, blocks).

## 21. Vehicle Trips (added Q51, 2026-11-07)
- A **Trip** record: Vehicle; From; To; Purpose / Note; Start Date + Start Meter; Return Date + End Meter (Km auto-calculated); Driver — auto-filled from the driver assignment active on the trip date.
- **Open → Close flow (Q52):** a trip is started when the vehicle leaves (no end meter yet — status Open; the vehicle shows "Out on trip" on the dashboard) and closed when it returns with the end meter and return date. Trips can span multiple days.
- Validation: End Meter lower than Start Meter is BLOCKED; overlapping trips for the same vehicle WARN.
- **Cross-check:** the system compares total trip km against the meter movement shown by fuel entries. Unexplained km (meter moved more than the trips explain) is flagged — it appears in Needs Attention and the Flagged Entries Report, under the normal Open → Resolved flag workflow.
- **Trip Report** (report #9): trips per vehicle or per driver, Excel + Print/PDF like all reports.
- Trips live in their own **Trips** Sheet tab (12 tabs total). Permission checklist grows by 2 ticks: View Trips; Manage Trips (add/edit/delete) — 22 ticks total.

## 22. Round-3 Additions (added Q52, 2026-11-07 — all approved)
- **Year archiving:** Admin (Manage Settings permission) can archive a finished year — its entries, trips and audits move to an archive copy that stays downloadable; yearly totals remain available in reports; the live system stays fast.
- **Service-due reminders:** each vehicle carries a Service Interval (km) and a Last Service Meter; next service is due at Last + Interval. The dashboard's Needs Attention panel warns when a vehicle is near or past due (warning window adjustable in Settings). Recording a service updates the Last Service Meter and is logged in the audit history. Managed under the Add/Edit Vehicle permission.

## 11. Tank Audit / Adjustment (added Q33, 2026-11-07)
A physical audit may find the vehicle's actual tank fuel different from the system-calculated balance.
- A user with the **Tank Audit / Adjustment** permission tick (new checklist item; Admin has it by default) enters the physical tank figure, the audit date, and a reason note.
- The system records an **Adjustment Entry** for the difference (+/− Litres) — it never silently overwrites the balance. The adjustment shows the auditor's name, is part of the full audit history, and appears in reports.
- From the audit date forward, the tank balance restarts from the physical figure; earlier records stay untouched.
- **Every** difference is flagged for investigation — even 1 Litre (Q34). No tolerance window; his rule is strict.
