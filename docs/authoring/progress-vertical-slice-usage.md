# Progress Vertical Slice Sample (Author UI)

Sample file: `content/examples/progress-vertical-slice.json`.

## 1) Open the sample in Author UI

1. Run the Author UI app (`cd apps/author-ui && npm run dev`).
2. Open the **Advanced JSON** tab.
3. Paste/load `content/examples/progress-vertical-slice.json`.
4. Click **Apply JSON**.

The sample is generated from Author UI state flows and contains:
- resources: `gold`, `xp`
- routine: `Beg` (2s cadence, produces gold + xp)
- buyable: `Better Cup`
- upgrade: `Motivation`
- optional buyable: `Swift Hands` (duration multiplier)

## 2) Run simulation presets

Use the embedded `runtimePreview.gameDefinition` object in the sample with `AuthoringFacade.simulate(...)`.

Suggested presets:

- **Baseline production**
  - `dt: 100`, `ticks: 60`, `routineCompletionIntervalSec: 2`
  - enqueue `ROUTINE_START` for `beg` on tick 0.
- **After purchase step**
  - same as baseline, plus a purchase intent in your host integration (for example, a buy/upgrade handler in your simulation harness).

## 3) Inspect chart + event changes after purchases

After running baseline vs purchase scenarios:

- Compare `simulation.recording.snapshots[*].resources` for net-rate and curve differences.
- Compare `simulation.recording.events` for purchase + routine completion event timing.
- Compare `simulation.report.resourceKpis` (`start/end/min/max`) for `gold` and `xp`.

Tip: keep `snapshotIntervalSec` at `1` or `2` for a compact chart-friendly timeline.
