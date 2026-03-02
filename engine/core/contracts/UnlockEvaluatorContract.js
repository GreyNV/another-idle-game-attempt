/**
 * @typedef {object} UnlockEvaluationResult
 * @property {string[]} unlockedRefs
 * @property {Record<string, boolean>} unlocked
 * @property {Record<string, { unlocked: boolean, progress: number, showPlaceholder: boolean }>} statusByRef
 * @property {string[]} transitions
 */

/**
 * @typedef {object} UnlockEvaluatorContract
 * @property {(options?: { phase?: string }) => UnlockEvaluationResult} evaluateAll
 * @property {() => Record<string, number>} evaluateProgressAll
 */

const UNLOCK_EVALUATOR_CONTRACT = Object.freeze({
  name: 'UnlockEvaluatorContract',
  requiredMethods: ['evaluateAll', 'evaluateProgressAll'],
});

module.exports = {
  UNLOCK_EVALUATOR_CONTRACT,
};
