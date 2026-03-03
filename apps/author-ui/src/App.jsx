import { useEffect, useMemo, useState } from 'react';

const DEFAULT_DEFINITION = `{
  "schemaVersion": "1.2.0",
  "meta": {
    "id": "demo.game",
    "name": "Demo Game"
  },
  "state": {
    "resources": {
      "gold": 0
    }
  },
  "systems": [],
  "layers": []
}`;

function downloadJson(filename, value) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(href);
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json();
}

export function App() {
  const [definitionText, setDefinitionText] = useState(DEFAULT_DEFINITION);
  const [validation, setValidation] = useState({ ok: true, diagnostics: [] });
  const [validationError, setValidationError] = useState('');
  const [ticks, setTicks] = useState(30);
  const [simulation, setSimulation] = useState(null);
  const [simulateError, setSimulateError] = useState('');
  const [isSimulating, setIsSimulating] = useState(false);

  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const result = await postJson('/api/validate', { definitionJson: definitionText });
        setValidation(result);
        setValidationError('');
      } catch (error) {
        setValidationError(error instanceof Error ? error.message : String(error));
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [definitionText]);

  const issueRows = useMemo(() => validation.diagnostics || [], [validation]);

  const onLoadJsonFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const text = await file.text();
    setDefinitionText(text);
  };

  const onSaveDefinition = () => {
    try {
      const parsed = JSON.parse(definitionText);
      downloadJson('game-definition.json', parsed);
    } catch {
      window.alert('Cannot export invalid JSON. Fix parser errors first.');
    }
  };

  const onSimulate = async () => {
    setIsSimulating(true);
    try {
      const result = await postJson('/api/simulate', {
        definitionJson: definitionText,
        scenario: { ticks: Number(ticks) || 1 },
      });
      setSimulation(result);
      setSimulateError('');
    } catch (error) {
      setSimulateError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSimulating(false);
    }
  };

  return (
    <main className="layout">
      <header>
        <h1>Author UI (Desktop Builder)</h1>
        <p>Load a GameDefinition, validate continuously, and run deterministic simulation reports.</p>
      </header>

      <section className="panel">
        <h2>GameDefinition JSON</h2>
        <div className="actions">
          <label className="button-like">
            Open JSON
            <input type="file" accept="application/json" onChange={onLoadJsonFile} hidden />
          </label>
          <button onClick={onSaveDefinition}>Save JSON</button>
        </div>
        <textarea
          value={definitionText}
          onChange={(event) => setDefinitionText(event.target.value)}
          spellCheck={false}
          rows={18}
        />
      </section>

      <section className="panel">
        <h2>Live Validation ({validation.ok ? 'ok' : 'issues'})</h2>
        {validationError ? <p className="error">Validation request failed: {validationError}</p> : null}
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Path</th>
              <th>Message</th>
            </tr>
          </thead>
          <tbody>
            {issueRows.length === 0 ? (
              <tr>
                <td colSpan={3}>No issues.</td>
              </tr>
            ) : (
              issueRows.map((issue, index) => (
                <tr key={`${issue.code}-${issue.path}-${index}`}>
                  <td>{issue.code}</td>
                  <td>{issue.path}</td>
                  <td>{issue.message}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <h2>Deterministic Simulation</h2>
        <div className="actions">
          <label>
            Ticks
            <input
              type="number"
              min={1}
              value={ticks}
              onChange={(event) => setTicks(event.target.value)}
            />
          </label>
          <button onClick={onSimulate} disabled={isSimulating}>
            {isSimulating ? 'Running...' : 'Run via AuthoringFacade.simulate'}
          </button>
          <button
            onClick={() => simulation && downloadJson('simulation-report.json', simulation.simulation?.report || simulation)}
            disabled={!simulation}
          >
            Export Report JSON
          </button>
        </div>
        {simulateError ? <p className="error">Simulation request failed: {simulateError}</p> : null}
        <pre>{simulation ? JSON.stringify(simulation, null, 2) : 'Run a simulation to view report output.'}</pre>
      </section>
    </main>
  );
}
