# Switch Hour

**Tagline:** Give your electricity a better hour.

**Track:** Hackathon (Technical Track)

**Live Demo:** https://obstudio.org/tools/switch-hour/

**Project Repository:** https://github.com/verycoololiver/switch-hour

---

## Inspiration

Most sustainability advice asks us to stop doing things or spend hundreds of dollars on new hardware. We wanted to explore a smaller, zero-cost change: doing the exact same task at a cleaner time. 

In regions like California and the Pacific Northwest, grid carbon fluctuates dramatically across the day: afternoons have excess clean solar, while evening peaker plants burn fossil gas to meet demand spikes. An EV charger, laundry cycle, or dishwasher often has a completion deadline, but it rarely needs to start immediately.

---

## What it does

Switch Hour finds the lowest-emission window to run a flexible electrical task before your deadline.
1. Enter what needs doing (appliance presets or custom duration/energy in kWh).
2. Set when it must finish (e.g. within 6, 12, 24, or 36 hours).
3. The app scans California Energy Commission (CEC) MIDAS 5-minute marginal emission forecasts, calculates the lowest-carbon window, and shows an interactive emissions chart with the baseline comparison.
4. With one click, users can export the suggested start time directly to their phone or desktop calendar (.ics).
5. For resilience, judges can explore the complete application using live regional grid signals or an instant, dated real-data sample.

---

## Design Process & The Pugh Chart (Decision Matrix)

Following the principles from the **Lake Oswego Hacks Design Lecture**, we emphasized *"Show 'Why I did this' not 'Here is what I did'"*. Prior to development, three distinct technical solutions were benchmarked:

| Evaluation Criteria | Weight | Solution 1: Smart Plug Hardware Relay | Solution 2: Grocery Barcode Auditor | **Solution 3: Zero-Hardware Grid Scheduler (Switch Hour)** |
| :--- | :---: | :---: | :---: | :---: |
| **Cost to User** | High (35%) | ❌ High ($30-$80 purchase per plug) | 🟢 $0 | **🟢 $0 (free web application)** |
| **Data Accuracy** | High (30%) | 🟡 Measures power, not grid carbon | ❌ Category averages (same CO2 for all spreads) | **🟢 Official California Energy Commission 5-min MOER** |
| **Usability & Speed** | Medium (20%) | ❌ Pairing, WiFi setup, login | 🟡 Scanning physical barcodes at market | **🟢 Zero login, instant 3-second result** |
| **Failure Mitigation** | Medium (15%) | ❌ Hardware disconnection, relay burnout | ❌ Missing database barcodes (frequent drops) | **🟢 Offline verified snapshot + strict boundary validation** |
| **Final Decision** | 100% | *Rank 3* | *Rank 2* | **🥇 Rank 1 (Selected Solution)** |

---

## Mitigation of Failure (Safeguards)

As highlighted in the event's design reviews, engineering depth requires showing how a system handles edge cases and failures:
1. **API Availability:** If upstream grid APIs are unreachable or blocked, Switch Hour automatically degrades gracefully to an immutable, dated PG&E snapshot without breaking the UI.
2. **Data Continuity:** The sliding-window scheduler enforces strict 5-minute data continuity. If any timestamp interval is missing, overlapping candidate windows are discarded.
3. **Transparent Baseline:** If starting immediately is already the cleanest forecast window, Switch Hour honestly reports **0% savings** and recommends *"Start now"*, rather than generating deceptive savings.
4. **Timezone Handling:** All arithmetic operates on UTC epoch milliseconds, with UI conversions explicitly mapped to Pacific Time (`America/Los_Angeles`).

---

## How we built it

- **Frontend:** Built with vanilla HTML5, CSS3, and JavaScript, designed with high-contrast accessibility (`Space Grotesk` & `DM Sans`), keyboard navigation, and responsive layouts.
- **Algorithm:** Pure functional sliding-window module (`scheduler.js`) evaluated against 6 automated unit tests (`switch-hour.test.cjs`).
- **Data Pipeline:** California Energy Commission MIDAS v2 API delivering WattTime SGIP marginal operating emissions rate (MOER) in `g CO2/kWh`.
- **Relay:** Lightweight Node.js 22 AWS Lambda Function URL with in-memory caching to respect rate limits.

---

## Challenges we ran into

- Translating raw marginal operating emissions rates (MOER) into a concrete, human decision without misleading users about guaranteed bill savings vs emissions impacts.
- Enforcing midnight-crossing deadlines across multi-day horizons without timezone jitter.
- Handling upstream CORS constraints while keeping infrastructure costs at exactly $0.00.

---

## Accomplishments that we're proud of

- Successfully deployed a zero-friction tool that turns complex grid forecast data into an actionable calendar reminder in under 5 seconds.
- 100% test pass rate across boundary conditions, missing intervals, and real-world snapshot scenarios.
- Completely free, privacy-first tool requiring no accounts or personal data.

---

## What we learned

Demand flexibility is one of the most cost-effective tools for grid decarbonization. Timing matters just as much as conservation, but software in this space must be honest about forecast assumptions and data boundaries.

---

## Short Demo Video Script (< 3 Minutes)

1. **Problem (0:00 - 0:35):** "Hi! When we talk about climate action, people usually tell us to stop using electricity or buy expensive smart gadgets. But what if we could cut emissions simply by shifting *when* we run existing tasks?"
2. **Design Rationale & Pugh Chart (0:35 - 1:05):** "Following the Lake Oswego design guidelines, we evaluated three approaches using a Pugh decision matrix. We chose a zero-hardware, forecast-driven scheduler because it costs $0, requires no hardware, and uses official 5-minute grid emissions data from the California Energy Commission."
3. **Live Demonstration (1:05 - 1:55):** "Let's test it: select 'Charge the car' (3 hours, 21 kWh), set a deadline of 24 hours. The chart immediately displays the 5-minute emissions curve. Starting now uses dirty peaker gas, but Switch Hour finds a window at 2:00 AM with clean solar/wind, saving 16% CO2. We can export this directly to our phone's calendar."
4. **Failure Mitigation & Rigor (1:55 - 2:30):** "We also engineered failure mitigation: if the live API drops, an offline snapshot ensures the app never crashes. Missing intervals are automatically rejected, and if starting now is already optimal, it truthfully reports 0% savings."
5. **Conclusion (2:30 - 2:45):** "Switch Hour is live right now at obstudio.org/tools/switch-hour/. Thank you!"
