const SUPPORTED_SOFTCAP_MODES = Object.freeze(['power']);

function normalizeSoftcapConfig(softcap) {
  const threshold = Number.isFinite(softcap.threshold) ? softcap.threshold : softcap.softcapAt;
  const power = Number.isFinite(softcap.power) ? softcap.power : 1;
  const multiplier = Number.isFinite(softcap.multiplier) ? softcap.multiplier : 1;

  return {
    ...softcap,
    threshold,
    power,
    multiplier,
  };
}

function applySoftcap(value, softcap) {
  if (!Number.isFinite(value)) {
    throw new Error('value must be a finite number');
  }
  if (!softcap || typeof softcap !== 'object') {
    throw new Error('softcap must be an object');
  }

  const normalized = normalizeSoftcapConfig(softcap);
  const mode = normalized.mode;

  if (!Number.isFinite(normalized.threshold) || normalized.threshold <= 0) {
    throw new Error('softcap.threshold (or softcapAt) must be a finite positive number');
  }
  if (!SUPPORTED_SOFTCAP_MODES.includes(mode)) {
    throw new Error(`Unsupported softcap mode "${mode}".`);
  }

  if (value <= normalized.threshold) {
    return value;
  }

  if (mode === 'power') {
    if (!Number.isFinite(normalized.power) || normalized.power <= 0 || normalized.power >= 1) {
      throw new Error('softcap.power must be a finite number in range (0, 1) for power mode.');
    }
    if (!Number.isFinite(normalized.multiplier) || normalized.multiplier <= 0) {
      throw new Error('softcap.multiplier must be a finite number > 0.');
    }

    const scaledOverage = Math.pow(value / normalized.threshold, normalized.power);
    return normalized.threshold * scaledOverage * normalized.multiplier;
  }

  return value;
}

module.exports = {
  SUPPORTED_SOFTCAP_MODES,
  applySoftcap,
};
