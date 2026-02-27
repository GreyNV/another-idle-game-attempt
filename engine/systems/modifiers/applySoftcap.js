const SUPPORTED_SOFTCAP_MODES = Object.freeze(['power']);

function applySoftcap(value, softcap) {
  if (!Number.isFinite(value)) {
    throw new Error('value must be a finite number');
  }
  if (!softcap || typeof softcap !== 'object') {
    throw new Error('softcap must be an object');
  }

  const softcapAt = softcap.softcapAt;
  const mode = softcap.mode;

  if (!Number.isFinite(softcapAt) || softcapAt <= 0) {
    throw new Error('softcap.softcapAt must be a finite positive number');
  }
  if (!SUPPORTED_SOFTCAP_MODES.includes(mode)) {
    throw new Error(`Unsupported softcap mode "${mode}".`);
  }

  if (value <= softcapAt) {
    return value;
  }

  if (mode === 'power') {
    const power = softcap.power;
    if (!Number.isFinite(power) || power <= 0 || power >= 1) {
      throw new Error('softcap.power must be a finite number in range (0, 1) for power mode.');
    }

    const scaledOverage = Math.pow(value / softcapAt, power);
    return softcapAt * scaledOverage;
  }

  return value;
}

module.exports = {
  SUPPORTED_SOFTCAP_MODES,
  applySoftcap,
};
