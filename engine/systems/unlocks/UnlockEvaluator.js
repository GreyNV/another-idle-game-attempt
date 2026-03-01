const { formatNodeRef } = require('./nodeRef');
const { parseUnlockCondition, evaluateUnlockProgress, evaluateUnlockTransition } = require('./unlockCondition');

class UnlockEvaluator {
  constructor(options = {}) {
    this.definition = options.definition || { layers: [] };
    this.stateStore = options.stateStore;
    this.eventBus = options.eventBus;
    this.targets = this.#collectTargets(this.definition);
    this.unlockedByRef = new Map(this.targets.map((target) => [target.ref, false]));
  }

  evaluateAll(options = {}) {
    const phase = options.phase || 'end-of-tick';
    const state = this.stateStore.snapshot().canonical;
    const unlockedRefs = [];
    const unlocked = {};
    const transitions = [];

    for (const target of this.targets) {
      const transition = evaluateUnlockTransition({
        wasUnlocked: this.unlockedByRef.get(target.ref) === true,
        ast: target.ast,
        state,
        phase,
      });

      this.unlockedByRef.set(target.ref, transition.unlocked);
      unlocked[target.ref] = transition.unlocked;

      if (transition.unlocked) {
        unlockedRefs.push(target.ref);
      }

      if (transition.transitioned) {
        transitions.push(target.ref);
        this.eventBus.publish({
          type: 'UNLOCKED',
          source: 'UnlockEvaluator',
          payload: {
            targetRef: target.ref,
          },
        });
      }
    }

    return {
      unlockedRefs,
      unlocked,
      transitions,
    };
  }

  /**
   * Canonical unlock-progress snapshot for UI placeholders.
   *
   * UI composition must consume these values (which delegate to
   * `evaluateUnlockProgress`) instead of layer-specific heuristics.
   *
   * @returns {Record<string, number>}
   */
  evaluateProgressAll() {
    const state = this.stateStore.snapshot().canonical;
    const progressByRef = {};

    for (const target of this.targets) {
      progressByRef[target.ref] = evaluateUnlockProgress(target.ast, state);
    }

    return progressByRef;
  }

  #collectTargets(definition) {
    const targets = [];
    const layers = Array.isArray(definition.layers) ? definition.layers : [];

    for (const layer of layers) {
      const layerRef = formatNodeRef({ layer: layer.id });
      targets.push(this.#buildTarget(layerRef, layer.unlock));

      const sublayers = Array.isArray(layer.sublayers) ? layer.sublayers : [];
      for (const sublayer of sublayers) {
        const sublayerRef = formatNodeRef({ layer: layer.id, sublayer: sublayer.id });
        targets.push(this.#buildTarget(sublayerRef, sublayer.unlock));

        const sections = Array.isArray(sublayer.sections) ? sublayer.sections : [];
        for (const section of sections) {
          const sectionRef = formatNodeRef({ layer: layer.id, sublayer: sublayer.id, section: section.id });
          targets.push(this.#buildTarget(sectionRef, section.unlock));

          const elements = Array.isArray(section.elements) ? section.elements : [];
          for (const element of elements) {
            const elementRef = formatNodeRef({
              layer: layer.id,
              sublayer: sublayer.id,
              section: section.id,
              element: element.id,
            });
            targets.push(this.#buildTarget(elementRef, element.unlock));
          }
        }
      }
    }

    return targets;
  }

  #buildTarget(ref, unlockCondition) {
    const parsed = parseUnlockCondition(unlockCondition || { always: true });
    if (!parsed.ok) {
      throw new Error(`Invalid unlock condition at ${ref}: ${parsed.message}`);
    }

    return {
      ref,
      ast: parsed.value,
    };
  }
}

module.exports = {
  UnlockEvaluator,
};
