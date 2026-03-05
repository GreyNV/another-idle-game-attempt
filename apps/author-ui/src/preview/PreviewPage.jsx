import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const SPEED_OPTIONS = [0.5, 1, 2, 4];

function collectElements(summary, type) {
  const layers = summary && summary.ui && Array.isArray(summary.ui.layers) ? summary.ui.layers : [];
  const items = [];

  for (const layer of layers) {
    const sublayers = Array.isArray(layer.sublayers) ? layer.sublayers : [];
    for (const sublayer of sublayers) {
      const sections = Array.isArray(sublayer.sections) ? sublayer.sections : [];
      for (const section of sections) {
        const elements = Array.isArray(section.elements) ? section.elements : [];
        for (const element of elements) {
          if (element.type === type) {
            items.push({
              id: element.id,
              layerId: layer.id,
              sectionId: section.id,
              status: element.status || (element.active ? 'active' : 'idle'),
            });
          }
        }
      }
    }
  }

  return items;
}

function readResources(snapshot) {
  const resources = snapshot && snapshot.canonical && snapshot.canonical.resources;
  if (!resources || typeof resources !== 'object') {
    return [];
  }

  return Object.entries(resources)
    .map(([id, value]) => ({ id, value: Number.isFinite(value) ? value : 0 }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

async function apiRequest(url, method = 'GET', body) {
  const response = await fetch(url, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return response.json();
}

function PreviewList({ title, rows, emptyLabel }) {
  return (
    <section className="preview-panel panel">
      <h4>{title}</h4>
      {rows.length === 0 ? <p>{emptyLabel}</p> : (
        <ul>
          {rows.map((row) => (
            <li key={row.id}>
              <strong>{row.id}</strong>
              {' '}
              <span>{row.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function PreviewPage({ definition }) {
  const [sessionId, setSessionId] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [summary, setSummary] = useState(null);
  const [tick, setTick] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState('');
  const inFlightRef = useRef(false);

  const createSession = useCallback(async () => {
    setError('');
    if (sessionId) {
      await apiRequest(`/api/preview/session/${sessionId}`, 'DELETE');
    }

    const result = await apiRequest('/api/preview/session', 'POST', {
      definitionJson: definition,
      options: { defaultDt: 100 },
    });

    if (!result.ok) {
      setSessionId(null);
      setSnapshot(null);
      setSummary(null);
      setTick(0);
      setError(result.diagnostics?.[0]?.message || 'Failed to create preview session.');
      return;
    }

    setSessionId(result.session.id);
    setSnapshot(result.snapshot || null);
    setSummary(null);
    setTick(result.session.tick || 0);
  }, [definition, sessionId]);

  const step = useCallback(async (stepTicks = 1) => {
    if (!sessionId || inFlightRef.current) {
      return;
    }

    inFlightRef.current = true;
    setError('');

    try {
      const result = await apiRequest(`/api/preview/session/${sessionId}/step`, 'POST', {
        ticks: stepTicks,
        dt: 100 * speed,
        intents: [],
      });

      if (!result.ok) {
        setError(result.diagnostics?.[0]?.message || 'Preview step failed.');
        return;
      }

      setSnapshot(result.snapshot || null);
      setSummary(result.summary || null);
      setTick(result.session?.tick || 0);
    } finally {
      inFlightRef.current = false;
    }
  }, [sessionId, speed]);

  useEffect(() => {
    createSession();
    return () => {
      if (sessionId) {
        apiRequest(`/api/preview/session/${sessionId}`, 'DELETE').catch(() => {});
      }
    };
  }, [createSession]);

  useEffect(() => {
    if (!isPlaying || !sessionId) {
      return undefined;
    }

    const handle = setInterval(() => {
      step(1);
    }, 250);

    return () => clearInterval(handle);
  }, [isPlaying, sessionId, step]);

  const resources = useMemo(() => readResources(snapshot), [snapshot]);
  const routines = useMemo(() => collectElements(summary, 'routine'), [summary]);
  const buyables = useMemo(() => collectElements(summary, 'buyable'), [summary]);
  const upgrades = useMemo(() => collectElements(summary, 'upgrade'), [summary]);
  const hasInventoryLayer = useMemo(
    () => Array.isArray(definition?.layers) && definition.layers.some((layer) => layer.type === 'inventoryLayer'),
    [definition]
  );

  return (
    <section className="preview-root">
      <header className="preview-toolbar panel">
        <div className="actions">
          <button onClick={() => setIsPlaying((value) => !value)}>{isPlaying ? 'Pause' : 'Play'}</button>
          <button onClick={() => step(1)} disabled={!sessionId}>Step</button>
          <button onClick={createSession}>Reset</button>
          <label>
            Speed
            <select value={String(speed)} onChange={(event) => setSpeed(Number(event.target.value))}>
              {SPEED_OPTIONS.map((option) => (
                <option key={option} value={String(option)}>{option}x</option>
              ))}
            </select>
          </label>
        </div>
        <div className="preview-stats">
          <span>Session: {sessionId || 'none'}</span>
          <span>Tick: {tick}</span>
          <span>dt: {summary?.dt ?? (100 * speed)}</span>
        </div>
      </header>

      {error ? <p className="error">{error}</p> : null}

      <section className="preview-grid">
        <PreviewList
          title="Resources"
          emptyLabel="No resources in snapshot."
          rows={resources.map((resource) => ({ id: resource.id, detail: String(resource.value) }))}
        />
        <PreviewList
          title="Routines"
          emptyLabel="No routines visible."
          rows={routines.map((routine) => ({
            id: routine.id,
            detail: `${routine.layerId}/${routine.sectionId} - ${routine.status}`,
          }))}
        />
        <PreviewList
          title="Buyables"
          emptyLabel="No buyables visible."
          rows={buyables.map((buyable) => ({ id: buyable.id, detail: `${buyable.layerId}/${buyable.sectionId}` }))}
        />
        <PreviewList
          title="Upgrades"
          emptyLabel="No upgrades visible."
          rows={upgrades.map((upgrade) => ({ id: upgrade.id, detail: `${upgrade.layerId}/${upgrade.sectionId}` }))}
        />
        <section className="preview-panel panel">
          <h4>Inventory</h4>
          <p>{hasInventoryLayer ? 'Inventory layer attached (placeholder panel).' : 'No inventory layer in this definition.'}</p>
        </section>
        <section className="preview-panel panel">
          <h4>Telemetry Overlay</h4>
          <p>events: {summary?.dispatch?.eventsProcessed ?? 0}</p>
          <p>handlers: {summary?.dispatch?.deliveredHandlers ?? 0}</p>
          <p>modifiers: {JSON.stringify(summary?.multipliers || {})}</p>
        </section>
      </section>
    </section>
  );
}
