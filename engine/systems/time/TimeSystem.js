class TimeSystem {
  constructor(options = {}) {
    this.tickRate = Number.isFinite(options.tickRate) && options.tickRate > 0 ? options.tickRate : 60;
    this.tickDurationMs = 1000 / this.tickRate;
    this.now = typeof options.now === 'function' ? options.now : () => Date.now();
    this.lastNow = null;
  }

  getDeltaTime() {
    const current = this.now();

    if (this.lastNow === null) {
      this.lastNow = current;
      return this.tickDurationMs;
    }

    const elapsed = current - this.lastNow;
    this.lastNow = current;

    if (!Number.isFinite(elapsed) || elapsed < 0) {
      return this.tickDurationMs;
    }

    return elapsed;
  }
}

module.exports = {
  TimeSystem,
};
