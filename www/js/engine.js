// Timestamp-based timer engine. Never counts ticks: time is always derived from Date.now(),
// so it stays exact when the tab is throttled, backgrounded or the phone was locked.

export class Engine {
  constructor(program, on = {}) {
    this.p = program;
    this.segs = program.segments;
    this.on = on; // { segment(seg, idx, {silent}), count(n), halfway(seg), done(), tick() }
    this.idx = 0;
    this.acc = 0; // ms elapsed in current segment before runningSince
    this.runningSince = null;
    this.activeAcc = 0; // total running ms (for stats)
    this.started = false;
    this.finished = false;
    this.lastCount = null;
    this.halfDone = false;
    this.rounds = 0; // manual counter (AMRAP / For Time)
    this.roundSplits = [];
    this.laps = [];
    this._raf = null;
    this._iv = null;
    this._loop = this._loop.bind(this);
  }

  get seg() {
    return this.segs[this.idx];
  }
  get running() {
    return this.runningSince !== null;
  }

  now() {
    return Date.now();
  }

  segElapsed() {
    return this.acc + (this.running ? this.now() - this.runningSince : 0);
  }

  totalElapsed() {
    return this.activeAcc + (this.running ? this.now() - this.runningSince : 0);
  }

  // Scheduled total time already covered (completed segments + elapsed of current)
  scheduledElapsed() {
    let sum = 0;
    for (let i = 0; i < this.idx; i++) sum += this.segs[i].dur === Infinity ? 0 : this.segs[i].dur;
    return sum + Math.min(this.segElapsed(), this.seg ? this.seg.dur : 0);
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.runningSince = this.now();
    this._emitSegment(false);
    this._startLoop();
    this.on.change?.();
  }

  pause() {
    if (!this.running) return;
    const d = this.now() - this.runningSince;
    this.acc += d;
    this.activeAcc += d;
    this.runningSince = null;
    this.on.tick?.();
    this.on.change?.();
  }

  resume() {
    if (this.running || this.finished) return;
    this.runningSince = this.now();
    this.on.tick?.();
    this.on.change?.();
  }

  toggle() {
    if (!this.started) return this.start();
    this.running ? this.pause() : this.resume();
  }

  _commit() {
    if (this.running) {
      const now = this.now();
      const d = now - this.runningSince;
      this.acc += d;
      this.activeAcc += d;
      this.runningSince = now;
    }
  }

  next() {
    if (this.finished) return;
    this._commit();
    this._goto(this.idx + 1, 0, false);
    this.on.change?.();
  }

  prev() {
    if (this.finished) return;
    this._commit();
    // within the first 2 s go to previous segment, otherwise restart current
    if (this.acc < 2000 && this.idx > 0) this._goto(this.idx - 1, 0, false);
    else this._goto(this.idx, 0, false);
    this.on.change?.();
  }

  finish() {
    if (this.finished) return;
    this._commit();
    this.finished = true;
    if (this.running) this.runningSince = null;
    this._stopLoop();
    this.on.done?.();
  }

  addRound() {
    const t = this.totalElapsed();
    this.rounds++;
    this.roundSplits.push(t);
    this.on.tick?.();
  }

  lap() {
    const t = this.totalElapsed();
    const prev = this.laps.length ? this.laps[this.laps.length - 1].at : 0;
    this.laps.push({ at: t, split: t - prev });
    this.on.tick?.();
  }

  _goto(i, carry, silent) {
    if (i >= this.segs.length) {
      this.acc = this.seg && this.seg.dur !== Infinity ? this.seg.dur : this.acc;
      return this.finish();
    }
    this.idx = i;
    this.acc = carry;
    if (this.running) this.runningSince = this.now();
    this.lastCount = null;
    this.halfDone = false;
    this._emitSegment(silent);
  }

  _emitSegment(silent) {
    this.on.segment?.(this.seg, this.idx, { silent });
    this.on.tick?.();
  }

  _check() {
    if (!this.started || this.finished || !this.running) return;
    let el = this.segElapsed();
    let hops = 0;
    // catch up across any number of finished segments (e.g. after the phone was asleep)
    while (this.seg && this.seg.dur !== Infinity && el >= this.seg.dur) {
      const carry = el - this.seg.dur;
      hops++;
      const now = this.now();
      this.activeAcc += now - this.runningSince;
      this.runningSince = now;
      const nextIdx = this.idx + 1;
      if (nextIdx >= this.segs.length) {
        this.acc = this.seg.dur;
        this.activeAcc -= carry;
        this.endedNaturally = true; // the scheduled end — its sound was already planned
        return this.finish();
      }
      // only announce the segment we land on
      const landing = carry < this.segs[nextIdx].dur || this.segs[nextIdx].dur === Infinity;
      this._gotoQuiet(nextIdx, carry, !landing || hops > 1);
      el = this.segElapsed();
    }
    const s = this.seg;
    if (s.dur !== Infinity) {
      const remain = s.dur - el;
      const sec = Math.ceil(remain / 1000);
      if (sec <= 3 && sec >= 1 && sec !== this.lastCount && s.dur >= 5000) {
        this.lastCount = sec;
        if (remain > sec * 1000 - 400) this.on.count?.(sec, s);
      }
      if (!this.halfDone && s.dur >= 20000 && el >= s.dur / 2) {
        this.halfDone = true;
        if (el - s.dur / 2 < 1500) this.on.halfway?.(s);
      }
    }
  }

  _gotoQuiet(i, carry, silent) {
    this.idx = i;
    this.acc = carry;
    this.lastCount = null;
    this.halfDone = false;
    this._emitSegment(silent);
  }

  _loop() {
    this._check();
    this.on.tick?.();
    this._raf = requestAnimationFrame(this._loop);
  }

  _startLoop() {
    this._stopLoop();
    this._raf = requestAnimationFrame(this._loop);
    // rAF stops when hidden; this keeps beeps/segment changes going in the background
    this._iv = setInterval(() => this._check(), 200);
  }

  _stopLoop() {
    if (this._raf) cancelAnimationFrame(this._raf);
    if (this._iv) clearInterval(this._iv);
    this._raf = this._iv = null;
  }

  destroy() {
    this._stopLoop();
    this.on = {};
  }
}
