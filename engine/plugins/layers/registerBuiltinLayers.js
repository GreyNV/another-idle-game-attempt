const { ProgressLayer } = require('./progress/ProgressLayer');
const { InventoryLayer } = require('./InventoryLayer');
const { StatisticsLayer } = require('./StatisticsLayer');

function registerBuiltinLayers(layerRegistry) {
  layerRegistry.register('progressLayer', ({ definition, context }) => new ProgressLayer({ definition, context }));
  layerRegistry.register('inventoryLayer', ({ definition, context }) => new InventoryLayer({ definition, context }));
  layerRegistry.register('statisticsLayer', ({ definition, context }) => new StatisticsLayer({ definition, context }));
}

module.exports = {
  registerBuiltinLayers,
};
