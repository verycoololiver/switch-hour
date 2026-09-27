# Switch Hour — submission notes

## The problem

Some electrical tasks can start later without changing when they need to finish. Grid emissions vary through the day, but people rarely have a quick way to turn that forecast into a practical start time.

## What we built

Switch Hour asks what task you need to run, when it must finish, and which grid region you use. It checks the current forecast, tests every eligible start window, and suggests a time. The result compares the first available start with the recommended start and can be saved as a calendar event.

It supports four California grid regions, Great Britain, and London. The task examples include EV charging, dishwashing, laundry, a washing machine, a clothes dryer, e-bike charging, and a pool pump. You can also enter your own run time and energy use.

## How it works

California uses the California Energy Commission's MIDAS / WattTime marginal emissions forecast through a small read-only AWS relay. Great Britain and London use NESO's public average carbon intensity forecasts. The app uses the right interval for each source and displays the selected region's local time. It recalculates from the moment the visitor arrives and automatically updates as time passes.

The algorithm checks the entire task duration and requires complete forecast coverage. The comparison assumes constant power and the same kWh at either start. For Great Britain, the result is an estimated difference in task emissions based on average grid intensity; it should not be interpreted as avoided marginal emissions. Forecast values are estimates.

## Challenges and decisions

The California data API does not allow direct browser requests, so we built a scoped forecast relay. The UK and California sources differ in resolution and meaning, so the scheduler accepts each source's interval and the result explains the metric. We also removed past bars and outdated demo advice so the page only suggests future starts using a current forecast.

## Demo

Open [Switch Hour](https://obstudio.org/tools/switch-hour/), select a task and region, and compare the first start with the recommendation. Switch to London to see its local time and regional forecast. Change the deadline to see how the available windows change.

Source: [Switch Hour repository](https://github.com/verycoololiver/switch-hour).
