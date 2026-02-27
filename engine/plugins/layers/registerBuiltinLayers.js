const { ProgressLayer } = require('./progress/ProgressLayer');

function registerBuiltinLayers(layerRegistry) {
  layerRegistry.register('progressLayer', ({ definition, context }) => new ProgressLayer({ definition, context }));
}

module.exports = {
  registerBuiltinLayers,
};
