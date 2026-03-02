/**
 * @typedef {object} ModifierResolverContract
 * @property {(targetRef: string, key: string, baseValue: number) => number} resolve
 * @property {(targetRef: string, key: string, baseValue: number) => number} resolveSoftcapParam
 */

const MODIFIER_RESOLVER_CONTRACT = Object.freeze({
  name: 'ModifierResolverContract',
  requiredMethods: ['resolve', 'resolveSoftcapParam'],
});

module.exports = {
  MODIFIER_RESOLVER_CONTRACT,
};
