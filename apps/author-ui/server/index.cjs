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

app.post('/api/compile', (req, res) => {
  const result = facade.compile(req.body.definitionJson);
  res.json(result);
});

app.listen(PORT, () => {
  console.log(`Author UI API listening on http://localhost:${PORT}`);
});
