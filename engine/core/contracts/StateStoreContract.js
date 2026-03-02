/**
 * @typedef {object} StateSnapshot
 * @property {Record<string, unknown>} canonical
 * @property {Record<string, unknown>} derived
 */

/**
 * @typedef {object} StateStoreContract
 * @property {(path: string) => unknown} get
 * @property {(path: string, value: unknown) => void} set
 * @property {(path: string, partial: Record<string, unknown>) => void} patch
 * @property {(nextState: Record<string, unknown>) => void} replaceCanonical
 * @property {(path: string, value: unknown) => void} setDerived
 * @property {() => StateSnapshot} snapshot
 */

const STATE_STORE_CONTRACT = Object.freeze({
  name: 'StateStoreContract',
  requiredMethods: ['get', 'set', 'patch', 'replaceCanonical', 'setDerived', 'snapshot'],
});

module.exports = {
  STATE_STORE_CONTRACT,
};
