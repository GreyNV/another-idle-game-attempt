class InventoryLayer {
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
    // Placeholder plugin: inventory semantics are authored externally for now.
  }

  onEvent(_event) {
    // Reserved for inventory event intents in future slices.
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
  InventoryLayer,
};
