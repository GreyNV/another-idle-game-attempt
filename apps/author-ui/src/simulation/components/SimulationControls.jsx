export function SimulationControls({ presets, controls, onChange, onPresetChange, onRun, isRunning, error }) {
  const presetEntries = Object.entries(presets);

  const updateField = (field, value) => {
    onChange({ ...controls, [field]: value });
  };

  const updateIntentRow = (rowId, patch) => {
    onChange({
      ...controls,
      intentRows: controls.intentRows.map((row) => (row.id === rowId ? { ...row, ...patch } : row)),
    });
  };

  const addIntentRow = () => {
    const nextId = `intent-${Date.now()}`;
    onChange({
      ...controls,
      intentRows: [
        ...controls.intentRows,
        { id: nextId, tick: 0, type: 'ROUTINE_START', payloadJson: '{}' },
      ],
    });
  };

  const removeIntentRow = (rowId) => {
    onChange({
      ...controls,
      intentRows: controls.intentRows.filter((row) => row.id !== rowId),
    });
  };

  return (
    <section className="panel simulation-controls">
      <h3>Simulation Controls</h3>
      <label className="field-row">
        <span>Preset</span>
        <select value={controls.presetKey} onChange={(event) => onPresetChange(event.target.value)}>
          {presetEntries.map(([key, preset]) => (
            <option key={key} value={key}>{preset.label}</option>
          ))}
        </select>
      </label>
      <p className="muted">{presets[controls.presetKey]?.description}</p>

      <label className="field-row">
        <span>Ticks</span>
        <input type="number" min={1} step={1} value={controls.ticks} onChange={(event) => updateField('ticks', Number(event.target.value))} />
      </label>
      <label className="field-row">
        <span>Horizon (sec)</span>
        <input type="number" min={1} step={1} value={controls.horizonSec} onChange={(event) => updateField('horizonSec', Number(event.target.value))} />
      </label>
      <label className="field-row">
        <span>dt (ms)</span>
        <input type="number" min={1} step={1} value={controls.dt} onChange={(event) => updateField('dt', Number(event.target.value))} />
      </label>
      <label className="field-row">
        <span>Snapshot interval (sec)</span>
        <input type="number" min={1} step={1} value={controls.snapshotIntervalSec} onChange={(event) => updateField('snapshotIntervalSec', Number(event.target.value))} />
      </label>

      <div className="actions">
        <button onClick={addIntentRow} type="button">Add intent row</button>
      </div>

      <table className="simple-table intents-table">
        <thead>
          <tr>
            <th>Tick</th>
            <th>Type</th>
            <th>Payload JSON</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {controls.intentRows.length === 0 ? (
            <tr>
              <td colSpan={4} className="muted">No scripted intents.</td>
            </tr>
          ) : controls.intentRows.map((row) => (
            <tr key={row.id}>
              <td>
                <input
                  type="number"
                  min={0}
                  value={row.tick}
                  onChange={(event) => updateIntentRow(row.id, { tick: Number(event.target.value) })}
                />
              </td>
              <td>
                <input
                  value={row.type}
                  onChange={(event) => updateIntentRow(row.id, { type: event.target.value })}
                />
              </td>
              <td>
                <textarea
                  rows={3}
                  value={row.payloadJson}
                  onChange={(event) => updateIntentRow(row.id, { payloadJson: event.target.value })}
                />
              </td>
              <td>
                <button onClick={() => removeIntentRow(row.id)} type="button">Remove</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="actions">
        <button onClick={onRun} disabled={isRunning} type="button">{isRunning ? 'Running...' : 'Run Simulation'}</button>
      </div>
      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
