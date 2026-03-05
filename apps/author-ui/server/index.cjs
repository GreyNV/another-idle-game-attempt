const express = require('express');
const cors = require('cors');
const { AuthoringFacade } = require('../../../engine');

const app = express();
const facade = new AuthoringFacade();
const PORT = process.env.AUTHOR_UI_SERVER_PORT || 8787;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/validate', (req, res) => {
  const result = facade.validate(req.body.definitionJson);
  res.json(result);
});

app.post('/api/simulate', (req, res) => {
  const { definitionJson, scenario, options } = req.body;
  const result = facade.simulate(definitionJson, scenario || {}, options || {});
  res.json(result);
});


app.post('/api/diffSnapshots', (req, res) => {
  const { snapshotA, snapshotB, options } = req.body || {};
  const result = facade.diffSnapshots(snapshotA, snapshotB, options || {});
  res.json(result);
});

app.post('/api/compile', (req, res) => {
  const result = facade.compile(req.body.definitionJson);
  res.json(result);
});

app.post('/api/preview/session', (req, res) => {
  const { definitionJson, options } = req.body || {};
  const result = facade.createSession(definitionJson, options || {});
  res.json(result);
});

app.post('/api/preview/session/:sessionId/step', (req, res) => {
  const result = facade.stepSession(req.params.sessionId, req.body || {});
  res.json(result);
});

app.get('/api/preview/session/:sessionId/snapshot', (req, res) => {
  const result = facade.snapshotSession(req.params.sessionId);
  res.json(result);
});

app.delete('/api/preview/session/:sessionId', (req, res) => {
  const result = facade.disposeSession(req.params.sessionId);
  res.json(result);
});

app.listen(PORT, () => {
  console.log(`Author UI API listening on http://localhost:${PORT}`);
});

