class ProgressLayer {
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
    // v1 MVP: no direct cross-layer interactions.
    // State writes stay scoped to this layer namespace through context.state.
  }

  onEvent(_event) {
    // Event handlers are optional for the MVP and should use context.eventBus interfaces only.
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
  ProgressLayer,
};
