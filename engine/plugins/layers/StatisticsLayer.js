class StatisticsLayer {
  constructor(options = {}) {
    const definition = options.definition || {};
    this.id = definition.id;
    this.type = definition.type;
    this.definition = definition;
    this.context = null;
  }

  init(context) {
    this.context = context;
  }

  update(_dtMs) {
    // Placeholder plugin: statistics aggregation hooks will be added incrementally.
  }

  onEvent(_event) {
    // Reserved for telemetry/statistics events in future slices.
  }

  getViewModel() {
    return {
      id: this.id,
      type: this.type,
      title: this.definition.title || this.id,
    };
  }

  destroy() {
    this.context = null;
  }
}

module.exports = {
  StatisticsLayer,
};
