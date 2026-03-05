function countByOp(changes) {
  return (Array.isArray(changes) ? changes : []).reduce(
    (acc, change) => {
      const op = change && change.op;
      if (op === 'add') {
        acc.add += 1;
      } else if (op === 'remove') {
        acc.remove += 1;
      } else {
        acc.replace += 1;
      }
      return acc;
    },
    { add: 0, remove: 0, replace: 0 }
  );
}

export function summarizeDiffResult(diffResult) {
  const changes = Array.isArray(diffResult && diffResult.changes) ? diffResult.changes : [];
  const byOp = countByOp(changes);

  return {
    equal: Boolean(diffResult && diffResult.equal),
    totalChanges: changes.length,
    byOp,
    truncated: Boolean(diffResult && diffResult.truncated),
  };
}

export function formatCompareSummary(summary) {
  if (!summary || summary.equal) {
    return 'No snapshot differences detected.';
  }

  const tail = summary.truncated ? ' (truncated)' : '';
  return `${summary.totalChanges} changes: +${summary.byOp.add} / -${summary.byOp.remove} / ~${summary.byOp.replace}${tail}`;
}
