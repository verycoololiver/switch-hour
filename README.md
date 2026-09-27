# Switch Hour

> **Give your electricity a better hour.**  
> A zero-hardware, forecast-driven demand flexibility scheduler built for **Lake Oswego Hacks 2026** (Theme: *Technology for Planet / Sustainability*).

- **Live URL:** https://obstudio.org/tools/switch-hour/
- **GitHub Repository:** https://github.com/verycoololiver/switch-hour
- **Devpost Submission Draft:** [SUBMISSION.md](./SUBMISSION.md)

---

## 1. Design Lecture Alignment ("Why We Did This")

In alignment with the **Lake Oswego Hacks 2026 Design Lecture** (*Reid R. & Eucaly W.*), this project prioritizes **"Show 'Why I did this' not 'Here is what I did'"**, explicit specification constraints, concept selection via a **Pugh Matrix**, and rigorous **Mitigation of Failure**.

### Problem Specification & Constraints
- **Problem:** Electrical tasks (EV charging, dishwashing, laundry) often run immediately during peak hours when dirtier peaker plants burn fossil fuels, despite having flexible finish deadlines.
- **Goal:** Shift the 5-minute operating window to the cleanest marginal emission forecast before the user's hard deadline, without requiring new hardware or lifestyle reduction.
- **Constraints:**
  - Run duration: 0.5 to 8 hours (in 30-minute steps).
  - Total energy: 0.1 to 100 kWh.
  - Hard completion deadline: 6, 12, 24, or 36 hours.
  - Data resolution: Contiguous 5-minute forecast intervals (g CO₂/kWh).

### Concept Selection: The Pugh Chart (Decision Matrix)
Before writing code, three distinct sustainability approaches were evaluated against four weighted criteria:

| Criteria | Weight | Solution 1: Smart Plug Hardware Relay | Solution 2: Grocery Barcode Auditor | **Solution 3: Zero-Hardware Grid Scheduler (Switch Hour)** |
| :--- | :---: | :---: | :---: | :---: |
| **Cost to User** | High (35%) | ❌ High ($30-$80 hardware purchase) | 🟢 $0 (free app) | **🟢 $0 (completely free web app)** |
| **Data Accuracy & Rigor** | High (30%) | 🟡 Device wattage only | ❌ Category averages (Nutella = 9.11 kg CO₂) | **🟢 Official California Energy Commission 5-min MOER** |
| **User Friction & Usability** | Medium (20%) | ❌ WiFi pairing, app install, login | 🟡 Scanning physical barcodes at market | **🟢 No login, 1-click test, 3-second result** |
| **Failure Risk & Resilience** | Medium (15%) | ❌ Hardware disconnect, relay failure | ❌ Barcode missing in DB (high failure rate) | **🟢 Offline real snapshot fallback + strict data checks** |
| **Weighted Result** | 100% | *Rank 3 (Discarded)* | *Rank 2 (Discarded)* | **🥇 Rank 1 (Selected Solution)** |

---

## 2. Mitigation of Failure

Slide 34 of the Lake Oswego Design Lecture emphasizes **"Show mitigation of failure"**. Switch Hour implements robust safeguards against common points of failure:

1. **Upstream API Outage or Rate Limiting:**
   - *Failure Mode:* The external grid API is temporarily unreachable or blocked by CORS.
   - *Mitigation:* The app bundles an immutable, verified 24-hour real data snapshot (`sample.json`, captured from PG&E on Sept 27, 2026 UTC). If live data fails, it seamlessly falls back to the dated snapshot with an explicit notice to judges and users.
2. **Missing or Non-Contiguous Forecast Windows:**
   - *Failure Mode:* An upstream network drop produces gaps in 5-minute data.
   - *Mitigation:* The scheduler algorithm strictly requires 100% complete, contiguous 5-minute intervals covering the entire duration. Any window crossing missing data is discarded.
3. **Earliest Start is Already Lowest Emission:**
   - *Failure Mode:* Marketing temptation to invent "savings" when starting now is already optimal.
   - *Mitigation:* The algorithm keeps the earliest start on ties and honestly reports **0% savings**, advising the user: *"Start now — this is already the cleanest window."*
4. **Timezone Discrepancies:**
   - *Failure Mode:* UTC vs Pacific Daylight Time causing off-by-hours errors.
   - *Mitigation:* All internal timestamps use UTC epoch milliseconds, and the UI formatters explicitly bind to `America/Los_Angeles` (Pacific Time).

---

## 3. What Works

- **Live Regional Grid Signals:** Connects to the California Energy Commission MIDAS forecast covering 4 major utility areas: PG&E, Southern California Edison, San Diego Gas & Electric, and SMUD.
- **Sliding-Window Optimization Algorithm:** Pure functional module (`scheduler.js`) scanning every possible 5-minute start time before the deadline to find the global minimum marginal CO₂.
- **Interactive Visual Emissions Chart:** Real-time dynamic bar chart highlighting the earliest start (baseline in orange) vs the optimal start (recommended in green).
- **Practical Calendar Export (.ics):** 1-click download of an `.ics` event so the user's phone or desktop reminds them when to hit start.
- **Privacy & Accessibility First:** No user accounts, zero telemetry, keyboard accessible, and prefers-reduced-motion compatible.

---

## 4. Architecture & Technical Implementation

```
[ California Energy Commission (MIDAS v2 API) ]
                      │ (WattTime SGIP 5-min MOER forecast)
                      ▼
[ Lightweight AWS Lambda Relay (Node.js 22.x) ]  <-- Caches for 5 min in-memory
                      │ (CORS restricted to obstudio.org & localhost)
                      ▼
[ Browser Static Client (Vanilla JS + HTML5 + CSS3) ]
     ├── scheduler.js  (Sliding-window evaluation algorithm)
     ├── app.js        (State management, chart rendering, calendar generation)
     └── sample.json   (Offline fallback snapshot)
```

- **Frontend:** Standalone HTML/CSS/JS served directly via Next.js static export at `https://obstudio.org/tools/switch-hour/`.
- **Relay Backend:** AWS Lambda Function URL (`infra/lambda/switch-hour.ts`) acting as a read-only relay with 5-minute in-memory caching to protect upstream APIs.

---

## 5. Verification & Tests

Run unit tests and verification from the project root:

```sh
node --test tests/switch-hour.test.cjs
npm run build
```

**Test Coverage (6 passing tests):**
- ✔ Integrates full task duration and stops strictly at the deadline.
- ✔ Rejects any candidate start that would overrun the user's deadline.
- ✔ Invalidates windows crossing any missing 5-minute interval.
- ✔ Flat-signal handling: preserves earliest start and accurately reports 0% savings.
- ✔ Correct UTC boundary crossing across midnight.
- ✔ Real snapshot validation reproducing verifiable test results.

---

## 6. Sources & References

- [California Energy Commission MIDAS Documentation](https://github.com/california-energy-commission/MIDAS)
- [MIDAS SGIP MOER Signal Definitions & Mapping](https://github.com/california-energy-commission/MIDAS/blob/main/appendix-f.md)
- [WattTime SGIP Initiative](https://sgipsignal.com/)
- [IEA: The Value of Demand Flexibility in Clean Energy Transitions](https://www.iea.org/reports/the-value-of-demand-flexibility)
