import { useMemo, useState } from 'react';
import presets from './ScenarioPresets.json';
import { diffSnapshots, simulateDefinition } from './api.js';
import {
  buildSimulationPayload,
  controlsFromPreset,
  summarizeDiff,
} from './model.js';
import { CompareRunsPanel } from './components/CompareRunsPanel.jsx';
import { EventTimelineGraph } from './components/EventTimelineGraph.jsx';
import { ResourcesOverTimeGraph } from './components/ResourcesOverTimeGraph.jsx';
import { SimulationControls } from './components/SimulationControls.jsx';
import { SoftcapEngagementMarkers } from './components/SoftcapEngagementMarkers.jsx';
import { UnlockTransitionsGraph } from './components/UnlockTransitionsGraph.jsx';

export function SimulationWorkspace({ definitionJson }) {
  const [controls, setControls] = useState(() => controlsFromPreset(presets, 'early'));
  const [isRunning, setIsRunning] = useState(false);
  const [isComparing, setIsComparing] = useState(false);
  const [runError, setRunError] = useState('');
  const [currentSimulation, setCurrentSimulation] = useState(null);
  const [baselineSimulation, setBaselineSimulation] = useState(null);
  const [diffSummary, setDiffSummary] = useState(null);

  const simulationPayload = useMemo(() => buildSimulationPayload(definitionJson, controls), [definitionJson, controls]);

  const runSimulation = async () => {
    setIsRunning(true);
    setRunError('');
    try {
      const result = await simulateDefinition(simulationPayload);
      if (!result.ok) {
        const diagnostic = result.diagnostics && result.diagnostics[0];
        setRunError(diagnostic ? diagnostic.message : 'Simulation failed.');
        return;
      }

      setCurrentSimulation(result.simulation);
      if (!baselineSimulation) {
        setBaselineSimulation(result.simulation);
      }
    } catch (error) {
      setRunError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsRunning(false);
    }
  };

  const compareRuns = async () => {
    if (!baselineSimulation || !currentSimulation) {
      return;
    }

    setIsComparing(true);
    setRunError('');
    try {
      const result = await diffSnapshots({
        snapshotA: baselineSimulation.finalSnapshot,
        snapshotB: currentSimulation.finalSnapshot,
        options: { maxChanges: 400 },
      });
      setDiffSummary(summarizeDiff(result));
    } catch (error) {
      setRunError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsComparing(false);
    }
  };

  return (
    <section className="simulation-workspace">
      <SimulationControls
        presets={presets}
        controls={controls}
        onChange={setControls}
        onPresetChange={(presetKey) => setControls(controlsFromPreset(presets, presetKey))}
        onRun={runSimulation}
        isRunning={isRunning}
        error={runError}
      />

      <CompareRunsPanel
        baseline={baselineSimulation}
        current={currentSimulation}
        diffSummary={diffSummary}
        onCaptureBaseline={() => {
          setBaselineSimulation(currentSimulation);
          setDiffSummary(null);
        }}
        onCompare={compareRuns}
        isComparing={isComparing}
      />

      {currentSimulation ? (
        <div className="graph-grid">
          <ResourcesOverTimeGraph simulation={currentSimulation} />
          <UnlockTransitionsGraph simulation={currentSimulation} />
          <EventTimelineGraph simulation={currentSimulation} />
          <SoftcapEngagementMarkers simulation={currentSimulation} />
        </div>
      ) : (
        <section className="panel">
          <h3>Simulation Output</h3>
          <p className="muted">Run a simulation to view recording snapshots, unlock transitions, events, and softcap markers.</p>
        </section>
      )}
    </section>
  );
}
