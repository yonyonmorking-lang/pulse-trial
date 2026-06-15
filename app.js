if (window.location.protocol === "file:") {
  const localPage = window.location.pathname.split("/").pop() || "index.html";
  window.location.replace(`http://127.0.0.1:4174/${localPage}${window.location.search}${window.location.hash}`);
}

const ROUND_MS = 3000;
const LISTEN_MS = 5400;
const COUNTDOWN_STEP_MS = 50;

const patterns = [
  {
    name: "Broken Pulse",
    taps: [
      [0, 0.9],
      [184, 0.48],
      [790, 0.72],
      [1298, 0.54],
      [2074, 0.96],
      [2836, 0.62]
    ]
  },
  {
    name: "Staggered Echo",
    taps: [
      [0, 0.5],
      [520, 0.86],
      [704, 0.45],
      [1518, 0.92],
      [2248, 0.58],
      [2440, 0.78]
    ]
  },
  {
    name: "Off Grid",
    taps: [
      [0, 0.76],
      [342, 0.52],
      [1216, 0.94],
      [1588, 0.46],
      [1934, 0.82],
      [2894, 0.64]
    ]
  },
  {
    name: "Narrow Steps",
    taps: [
      [0, 0.58],
      [248, 0.72],
      [492, 0.88],
      [1680, 0.5],
      [2308, 0.94],
      [2596, 0.56]
    ]
  },
  {
    name: "Late Accent",
    taps: [
      [0, 0.44],
      [688, 0.62],
      [1116, 0.78],
      [1842, 0.54],
      [2686, 0.98],
      [2928, 0.7]
    ]
  }
];

const seededLeaders = [];
const pageName = window.location.pathname.split("/").pop() || "index.html";
const urlParams = new URLSearchParams(window.location.search);

const el = {
  intro: document.querySelector("#intro"),
  introButton: document.querySelector("#introButton"),
  firstTimeScreen: document.querySelector("#firstTimeScreen"),
  firstTimeYes: document.querySelector("#firstTimeYes"),
  firstTimeNo: document.querySelector("#firstTimeNo"),
  tutorialScreen: document.querySelector("#tutorialScreen"),
  tutorialContinue: document.querySelector("#tutorialContinue"),
  setup: document.querySelector("#setup"),
  playerForm: document.querySelector("#playerForm"),
  playerName: document.querySelector("#playerName"),
  identityPanel: document.querySelector("#identityPanel"),
  micPanel: document.querySelector("#micPanel"),
  micButton: document.querySelector("#micButton"),
  roundScreen: document.querySelector("#roundScreen"),
  roundResult: document.querySelector("#roundResult"),
  finalScreen: document.querySelector("#finalScreen"),
  roundLabel: document.querySelector("#roundLabel"),
  roundTitle: document.querySelector("#roundTitle"),
  roundPageTitle: document.querySelector("#roundPageTitle"),
  phaseBanner: document.querySelector("#phaseBanner"),
  statusPill: document.querySelector("#statusPill"),
  levelBar: document.querySelector("#levelBar"),
  thresholdBar: document.querySelector("#thresholdBar"),
  timeline: document.querySelector("#timeline"),
  tapRows: document.querySelector("#tapRows"),
  startRoundButton: document.querySelector("#startRoundButton"),
  recalibrateButton: document.querySelector("#recalibrateButton"),
  screenModeButton: document.querySelector("#screenModeButton"),
  micModeButton: document.querySelector("#micModeButton"),
  tapCount: document.querySelector("#tapCount"),
  timeLeft: document.querySelector("#timeLeft"),
  lastScore: document.querySelector("#lastScore"),
  resultEyebrow: document.querySelector("#resultEyebrow"),
  resultTitle: document.querySelector("#resultTitle"),
  stageScore: document.querySelector("#stageScore"),
  stageScoreText: document.querySelector("#stageScoreText"),
  nextRoundButton: document.querySelector("#nextRoundButton"),
  averageScore: document.querySelector("#averageScore"),
  summaryText: document.querySelector("#summaryText"),
  progressText: document.querySelector("#progressText"),
  roundScores: document.querySelector("#roundScores"),
  finalRoundScores: document.querySelector("#finalRoundScores"),
  playAgainButton: document.querySelector("#playAgainButton"),
  leaderboardSection: document.querySelector("#leaderboard"),
  leaderboardList: document.querySelector("#leaderboardList"),
  leaderboardMeta: document.querySelector("#leaderboardMeta"),
  leaderTemplate: document.querySelector("#leaderTemplate")
};

let playerName = "";
let audioContext;
let analyser;
let mediaStream;
let sourceNode;
let tapDetector;
let animationFrame = 0;
let roundIndex = 0;
let roundScores = [];
let listening = false;
let listenStartedAt = 0;
let detectedTaps = [];
let noiseFloor = 0.018;
let detectionThreshold = 0.09;
let smoothedLevel = 0;
let roundTimer = 0;
let lastManualTapAt = -Infinity;
let inputMode = readInputMode();

function isTouchDevice() {
  return navigator.maxTouchPoints > 0 || window.matchMedia("(pointer: coarse)").matches;
}

function readInputMode() {
  const savedMode = sessionStorage.getItem("pulseTrialInputMode");
  if (savedMode === "mic" || savedMode === "screen") return savedMode;
  return isTouchDevice() ? "screen" : "mic";
}

function saveInputMode(mode) {
  inputMode = mode === "mic" ? "mic" : "screen";
  sessionStorage.setItem("pulseTrialInputMode", inputMode);
  updateInputModeButtons();
}

function updateInputModeButtons() {
  if (!el.screenModeButton || !el.micModeButton) return;
  const screenActive = inputMode === "screen";
  el.screenModeButton.classList.toggle("active", screenActive);
  el.micModeButton.classList.toggle("active", !screenActive);
  el.screenModeButton.setAttribute("aria-pressed", String(screenActive));
  el.micModeButton.setAttribute("aria-pressed", String(!screenActive));
  if (el.recalibrateButton) {
    el.recalibrateButton.hidden = screenActive;
    el.recalibrateButton.classList.toggle("hidden-control", screenActive);
  }
}

function readSavedScores() {
  try {
    const scores = JSON.parse(sessionStorage.getItem("pulseTrialScores") || "[]");
    return Array.isArray(scores) ? scores.map(Number).filter((score) => Number.isFinite(score)) : [];
  } catch (_error) {
    return [];
  }
}

function saveScores(scores) {
  sessionStorage.setItem("pulseTrialScores", JSON.stringify(scores.map((score) => Number(score.toFixed(3)))));
}

function savePlayerName(name) {
  sessionStorage.setItem("pulseTrialPlayer", sanitizeName(name));
}

function resetGameProgress() {
  saveScores([]);
  Object.keys(sessionStorage)
    .filter((key) => key.startsWith("pulseTrialSubmitted:"))
    .forEach((key) => sessionStorage.removeItem(key));
}

function readPlayerName() {
  return sessionStorage.getItem("pulseTrialPlayer") || "";
}

function goToPage(path) {
  window.location.href = path;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatScore(score) {
  return Number(score).toFixed(3);
}

function sanitizeName(name) {
  return name.trim().replace(/\s+/g, " ").slice(0, 18) || "Player";
}

function setStatus(text, mode = "") {
  el.statusPill.textContent = text;
  el.statusPill.dataset.mode = mode;
}

function setControls(disabled) {
  el.startRoundButton.disabled = disabled;
  if (el.recalibrateButton) el.recalibrateButton.disabled = disabled;
}

function showPhase(text, mode = "") {
  el.phaseBanner.textContent = text;
  el.phaseBanner.dataset.mode = mode;
  el.phaseBanner.hidden = false;
}

function hidePhase() {
  el.phaseBanner.hidden = true;
  el.phaseBanner.textContent = "";
  el.phaseBanner.dataset.mode = "";
}

async function runRoundCountdown() {
  setStatus("Countdown", "play");
  el.roundTitle.textContent = "Get ready";
  el.tapCount.textContent = "Wait for TAP NOW";
  el.timeLeft.textContent = "00:00";
  renderTimeline(patterns[roundIndex]);

  for (const value of ["3", "2", "1"]) {
    showPhase(value, "countdown");
    await sleep(720);
  }

  showPhase("GO", "go");
  await sleep(560);
  hidePhase();
}

function createAudioContext() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!audioContext) audioContext = new Ctx();
  return audioContext;
}

function showView(view, hash) {
  [el.intro, el.firstTimeScreen, el.tutorialScreen, el.setup, el.roundScreen, el.roundResult, el.finalScreen].forEach((section) => {
    if (section) section.hidden = section !== view;
  });
  if (hash && window.location.hash !== hash) {
    history.pushState(null, "", hash);
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showPageView(view) {
  [el.intro, el.firstTimeScreen, el.tutorialScreen, el.setup, el.roundScreen, el.roundResult, el.finalScreen].forEach((section) => {
    if (section) section.hidden = section !== view;
  });
  window.scrollTo({ top: 0, behavior: "auto" });
}

function setLeaderboardVisible(visible) {
  if (el.leaderboardSection) el.leaderboardSection.hidden = !visible;
}

class TapInputDetector {
  constructor(analyserNode, options = {}) {
    this.analyser = analyserNode;
    this.buffer = new Float32Array(this.analyser.fftSize);
    this.onTap = options.onTap || (() => {});
    this.onMeter = options.onMeter || (() => {});
    this.noiseFloor = 0.018;
    this.noiseCeiling = 0.055;
    this.threshold = 0.085;
    this.releaseThreshold = 0.044;
    this.fastEnvelope = 0;
    this.slowEnvelope = 0;
    this.previousEnvelope = 0;
    this.previousPeak = 0;
    this.previousAcceptedAt = -Infinity;
    this.armed = true;
    this.listeningStartedAt = 0;
    this.framesSinceAttack = 0;
    this.peakHold = 0;
    this.noiseSamples = [];
    this.recentLevels = [];
    this.recentAttacks = [];
    this.minimumGapMs = 76;
    this.maximumHeldFrames = 9;
    this.meterLevel = 0;
  }

  resetState() {
    this.fastEnvelope = 0;
    this.slowEnvelope = 0;
    this.previousEnvelope = 0;
    this.previousPeak = 0;
    this.previousAcceptedAt = -Infinity;
    this.armed = true;
    this.framesSinceAttack = 0;
    this.peakHold = 0;
    this.recentLevels = [];
    this.recentAttacks = [];
  }

  beginListening(startedAt) {
    this.listeningStartedAt = startedAt;
    this.resetState();
  }

  stopListening() {
    this.armed = false;
    this.peakHold = 0;
  }

  sampleFrame() {
    this.analyser.getFloatTimeDomainData(this.buffer);
    let sum = 0;
    let peak = 0;
    let zeroCrossings = 0;
    let previousSign = this.buffer[0] >= 0;

    for (let index = 0; index < this.buffer.length; index += 1) {
      const sample = this.buffer[index];
      const abs = Math.abs(sample);
      sum += sample * sample;
      if (abs > peak) peak = abs;
      const sign = sample >= 0;
      if (sign !== previousSign) zeroCrossings += 1;
      previousSign = sign;
    }

    const rms = Math.sqrt(sum / this.buffer.length);
    const level = rms * 0.66 + peak * 0.34;
    const crest = peak / Math.max(rms, 0.0001);
    const zcr = zeroCrossings / this.buffer.length;
    return { rms, peak, level, crest, zcr };
  }

  updateEnvelopes(level) {
    const fastRise = 0.72;
    const fastFall = 0.28;
    const slowRise = 0.11;
    const slowFall = 0.035;
    const fastAmount = level > this.fastEnvelope ? fastRise : fastFall;
    const slowAmount = level > this.slowEnvelope ? slowRise : slowFall;
    this.fastEnvelope += (level - this.fastEnvelope) * fastAmount;
    this.slowEnvelope += (level - this.slowEnvelope) * slowAmount;
    const attack = this.fastEnvelope - this.previousEnvelope;
    const contrast = this.fastEnvelope - this.slowEnvelope;
    this.previousEnvelope = this.fastEnvelope;
    return { attack, contrast };
  }

  rememberRecent(metrics, attack) {
    this.recentLevels.push(metrics.level);
    this.recentAttacks.push(Math.max(0, attack));
    if (this.recentLevels.length > 40) this.recentLevels.shift();
    if (this.recentAttacks.length > 40) this.recentAttacks.shift();
  }

  percentile(values, ratio) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = clamp(Math.floor(sorted.length * ratio), 0, sorted.length - 1);
    return sorted[index];
  }

  updateAdaptiveNoise(metrics, attack, isListening) {
    const quietFrame =
      metrics.level < this.threshold * 0.82 &&
      metrics.peak < this.threshold * 1.25 &&
      attack < Math.max(0.012, this.threshold * 0.28);

    if (!isListening || quietFrame) {
      this.noiseSamples.push(metrics.level);
      if (this.noiseSamples.length > 180) this.noiseSamples.shift();
    }

    if (this.noiseSamples.length >= 12) {
      const median = this.percentile(this.noiseSamples, 0.5);
      const high = this.percentile(this.noiseSamples, 0.92);
      this.noiseFloor = clamp(this.noiseFloor * 0.92 + median * 0.08, 0.004, 0.12);
      this.noiseCeiling = clamp(this.noiseCeiling * 0.88 + high * 0.12, this.noiseFloor + 0.012, 0.26);
      const recentAttack = this.percentile(this.recentAttacks, 0.82);
      const levelGate = Math.max(this.noiseCeiling * 1.42, this.noiseFloor + 0.035, 0.038);
      const attackGate = Math.max(recentAttack * 1.22, this.noiseFloor * 0.7 + 0.015, 0.018);
      this.threshold = clamp(levelGate + attackGate * 0.34, 0.04, 0.32);
      this.releaseThreshold = clamp(Math.max(this.noiseCeiling * 0.9, this.threshold * 0.48), 0.022, 0.2);
    }
  }

  async calibrate(durationMs = 1800) {
    this.noiseSamples = [];
    this.resetState();
    const started = performance.now();

    while (performance.now() - started < durationMs) {
      const metrics = this.sampleFrame();
      const { attack } = this.updateEnvelopes(metrics.level);
      this.noiseSamples.push(metrics.level);
      this.rememberRecent(metrics, attack);
      this.onMeter(this.publicState(metrics));
      await sleep(24);
    }

    const median = this.percentile(this.noiseSamples, 0.5) || 0.018;
    const high = this.percentile(this.noiseSamples, 0.94) || median;
    this.noiseFloor = clamp(median, 0.004, 0.1);
    this.noiseCeiling = clamp(high, this.noiseFloor + 0.012, 0.24);
    this.threshold = clamp(Math.max(high * 1.72, median + 0.04, 0.045), 0.045, 0.32);
    this.releaseThreshold = clamp(Math.max(this.noiseCeiling * 0.86, this.threshold * 0.46), 0.022, 0.2);
    this.resetState();
    return this.publicState({ level: this.noiseFloor, peak: this.noiseCeiling, rms: this.noiseFloor, crest: 1, zcr: 0 });
  }

  publicState(metrics) {
    return {
      level: metrics.level,
      peak: metrics.peak,
      threshold: this.threshold,
      releaseThreshold: this.releaseThreshold,
      noiseFloor: this.noiseFloor,
      noiseCeiling: this.noiseCeiling,
      meterLevel: this.meterLevel
    };
  }

  estimateStrength(metrics, attack, contrast) {
    const levelPower = (metrics.level - this.noiseFloor) / Math.max(this.threshold - this.noiseFloor, 0.02);
    const peakPower = (metrics.peak - this.noiseCeiling) / Math.max(this.threshold, 0.04);
    const attackPower = attack / Math.max(this.threshold * 0.7, 0.028);
    const contrastPower = contrast / Math.max(this.threshold * 0.8, 0.03);
    return clamp(levelPower * 0.42 + peakPower * 0.2 + attackPower * 0.24 + contrastPower * 0.14, 0, 1);
  }

  shouldAcceptTap(metrics, attack, contrast, now) {
    const gapOk = now - this.previousAcceptedAt >= this.minimumGapMs;
    const sharpEnough = attack > Math.max(0.014, this.threshold * 0.2);
    const loudEnough = metrics.level > this.threshold || metrics.peak > this.threshold * 1.22;
    const contrastEnough = contrast > Math.max(0.012, this.threshold * 0.18);
    const transientShape = metrics.crest > 2.2 || metrics.peak > this.previousPeak * 1.28;
    const notHighFizz = metrics.zcr < 0.42 || metrics.peak > this.threshold * 1.7;
    return this.armed && gapOk && loudEnough && sharpEnough && contrastEnough && transientShape && notHighFizz;
  }

  updateArming(metrics, attack) {
    this.framesSinceAttack += 1;
    if (metrics.level < this.releaseThreshold && attack < this.threshold * 0.11) {
      this.armed = true;
      this.framesSinceAttack = 0;
    }
    if (this.framesSinceAttack > this.maximumHeldFrames && metrics.level < this.threshold * 0.78) {
      this.armed = true;
      this.framesSinceAttack = 0;
    }
  }

  processFrame(now, isListening) {
    const metrics = this.sampleFrame();
    const { attack, contrast } = this.updateEnvelopes(metrics.level);
    this.rememberRecent(metrics, attack);
    this.updateAdaptiveNoise(metrics, attack, isListening);
    this.meterLevel = this.meterLevel * 0.55 + metrics.level * 0.45;
    this.onMeter(this.publicState(metrics));

    if (isListening && this.shouldAcceptTap(metrics, attack, contrast, now)) {
      const time = now - this.listeningStartedAt;
      const strength = this.estimateStrength(metrics, attack, contrast);
      this.previousAcceptedAt = now;
      this.armed = false;
      this.framesSinceAttack = 0;
      this.peakHold = metrics.peak;
      this.onTap({ time, strength, level: metrics.level, peak: metrics.peak });
    }

    this.previousPeak = metrics.peak;
    this.updateArming(metrics, attack);
  }
}

function playWoodKnock(strength = 0.75, when = 0) {
  const ctx = createAudioContext();
  const start = when || ctx.currentTime;
  const duration = 0.13;
  const master = ctx.createGain();
  const lowBody = ctx.createOscillator();
  const highBody = ctx.createOscillator();
  const lowGain = ctx.createGain();
  const highGain = ctx.createGain();
  const clickGain = ctx.createGain();
  const clickFilter = ctx.createBiquadFilter();
  const toneFilter = ctx.createBiquadFilter();
  const compressor = ctx.createDynamicsCompressor();
  const noiseBuffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);

  for (let index = 0; index < data.length; index += 1) {
    const progress = index / data.length;
    const decay = Math.pow(1 - progress, 7.2);
    const grain =
      Math.sin(index * 1.91) * 0.62 +
      Math.sin(index * 5.73 + 0.4) * 0.25 +
      Math.sin(index * 13.17 + 1.7) * 0.13;
    data[index] = grain * decay;
  }

  const click = ctx.createBufferSource();
  click.buffer = noiseBuffer;

  lowBody.type = "triangle";
  lowBody.frequency.setValueAtTime(430 + strength * 42, start);
  lowBody.frequency.exponentialRampToValueAtTime(318 + strength * 26, start + duration);
  lowGain.gain.setValueAtTime(0.42 + strength * 0.24, start);
  lowGain.gain.exponentialRampToValueAtTime(0.001, start + duration);

  highBody.type = "square";
  highBody.frequency.setValueAtTime(1040 + strength * 90, start);
  highBody.frequency.exponentialRampToValueAtTime(735 + strength * 55, start + 0.055);
  highGain.gain.setValueAtTime(0.24 + strength * 0.2, start);
  highGain.gain.exponentialRampToValueAtTime(0.001, start + 0.07);

  clickFilter.type = "bandpass";
  clickFilter.frequency.setValueAtTime(2500 + strength * 220, start);
  clickFilter.Q.value = 8.5;
  clickGain.gain.setValueAtTime(0.95 + strength * 0.48, start);
  clickGain.gain.exponentialRampToValueAtTime(0.001, start + 0.026);

  toneFilter.type = "lowpass";
  toneFilter.frequency.setValueAtTime(3600, start);
  toneFilter.Q.value = 0.8;

  compressor.threshold.value = -18;
  compressor.knee.value = 12;
  compressor.ratio.value = 5;
  compressor.attack.value = 0.002;
  compressor.release.value = 0.08;

  master.gain.setValueAtTime(0.0001, start);
  master.gain.exponentialRampToValueAtTime(0.55 + strength * 0.34, start + 0.003);
  master.gain.setValueAtTime(0.42 + strength * 0.25, start + 0.018);
  master.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  lowBody.connect(lowGain).connect(toneFilter);
  highBody.connect(highGain).connect(toneFilter);
  click.connect(clickFilter).connect(clickGain).connect(toneFilter);
  toneFilter.connect(master).connect(compressor).connect(ctx.destination);

  lowBody.start(start);
  highBody.start(start);
  click.start(start);
  lowBody.stop(start + duration);
  highBody.stop(start + duration);
  click.stop(start + duration);
}

function playRepeatCue(when = 0) {
  const ctx = createAudioContext();
  const start = when || ctx.currentTime;
  const duration = 0.58;
  const master = ctx.createGain();
  const fundamental = ctx.createOscillator();
  const overtone = ctx.createOscillator();
  const knockFilter = ctx.createBiquadFilter();

  knockFilter.type = "lowpass";
  knockFilter.frequency.value = 680;
  knockFilter.Q.value = 1.2;

  fundamental.type = "triangle";
  fundamental.frequency.setValueAtTime(130.81, start);
  overtone.type = "triangle";
  overtone.frequency.setValueAtTime(196, start);

  master.gain.setValueAtTime(0.0001, start);
  master.gain.exponentialRampToValueAtTime(0.4, start + 0.025);
  master.gain.setValueAtTime(0.4, start + duration - 0.18);
  master.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  fundamental.connect(knockFilter);
  overtone.connect(knockFilter);
  knockFilter.connect(master).connect(ctx.destination);

  fundamental.start(start);
  overtone.start(start);
  fundamental.stop(start + duration);
  overtone.stop(start + duration);
}

async function playPattern(pattern) {
  const ctx = createAudioContext();
  if (ctx.state === "suspended") await ctx.resume();
  setStatus("Pattern playing", "play");
  el.roundTitle.textContent = "The rhythm plays twice";
  el.tapCount.textContent = "Listen only. Do not tap yet.";
  el.timeLeft.textContent = "LISTEN";

  for (let repeat = 0; repeat < 2; repeat += 1) {
    if (repeat === 1) {
      showPhase("REPLAY CUE", "cue");
      el.roundTitle.textContent = "Second playback cue";
      playRepeatCue(ctx.currentTime + 0.08);
      await sleep(780);
      showPhase("LISTEN", "listen-preview");
      el.roundTitle.textContent = "Second playback";
    } else {
      showPhase("LISTEN", "listen-preview");
      el.roundTitle.textContent = "First playback";
    }
    const base = ctx.currentTime + 0.16;
    pattern.taps.forEach(([time, strength]) => playWoodKnock(strength, base + time / 1000));
    await sleep(ROUND_MS + 620);
  }
  hidePhase();
}

function renderTimeline(_pattern, userTaps = []) {
  if (!el.timeline) return;
  el.timeline.innerHTML = "";
  const guide = document.createElement("span");
  guide.className = "timeline-guide";
  guide.textContent = userTaps.length ? "Your taps" : "No rhythm preview";
  el.timeline.append(guide);

  userTaps.forEach((tap) => {
    const mark = document.createElement("span");
    mark.className = "user-tap";
    mark.style.insetInlineStart = `${clamp((tap.time / LISTEN_MS) * 100, 0, 100)}%`;
    mark.style.height = `${24 + tap.strength * 48}px`;
    el.timeline.append(mark);
  });
}

function renderTapTable(userTaps = []) {
  if (!el.tapRows) return;
  el.tapRows.innerHTML = "";
  if (!userTaps.length) {
    const row = document.createElement("tr");
    row.innerHTML = '<td colspan="4">No taps detected yet.</td>';
    el.tapRows.append(row);
    return;
  }

  userTaps.forEach((tap, index) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${index + 1}</td>
      <td>${(tap.time / 1000).toFixed(3)}s</td>
      <td>${Math.round(tap.strength * 100)}%</td>
      <td>${tap.source || "mic"}</td>
    `;
    el.tapRows.append(row);
  });
}

async function requestMicrophone() {
  createAudioContext();
  if (audioContext.state === "suspended") await audioContext.resume();
  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false
    }
  });
  sourceNode = audioContext.createMediaStreamSource(mediaStream);
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0;
  sourceNode.connect(analyser);
  tapDetector = new TapInputDetector(analyser, {
    onTap: handleDetectedTap,
    onMeter: updateInputMeter
  });
  monitorInput();
}

async function calibrate() {
  if (!tapDetector) return;
  setControls(true);
  setStatus("Calibrating", "calibrate");
  el.roundTitle.textContent = "Hold still while room noise is measured";
  const state = await tapDetector.calibrate(1850);
  noiseFloor = state.noiseFloor;
  detectionThreshold = state.threshold;
  setStatus("Ready", "ready");
  el.roundTitle.textContent = "Ready to play the pattern";
  setControls(false);
}

async function selectInputMode(mode) {
  setModeButtonsDisabled(true);
  saveInputMode(mode);
  try {
    if (mode === "screen") {
      setStatus("Phone tap", "ready");
      if (!listening) el.tapCount.textContent = "Phone screen taps are selected";
      return;
    }

    setStatus("Table knock", "calibrate");
    if (!tapDetector) {
      try {
        await requestMicrophone();
      } catch (_error) {
        saveInputMode("screen");
        setStatus("Phone tap", "ready");
        if (!listening) el.tapCount.textContent = "Microphone was blocked. Phone tap is selected.";
        return;
      }
    }
    await calibrate();
    if (!listening) el.tapCount.textContent = "Table knock detection is selected";
  } finally {
    setModeButtonsDisabled(false);
  }
}

function setModeButtonsDisabled(disabled) {
  if (el.screenModeButton) el.screenModeButton.disabled = disabled;
  if (el.micModeButton) el.micModeButton.disabled = disabled;
}

function updateInputMeter(state) {
  noiseFloor = state.noiseFloor;
  detectionThreshold = state.threshold;
  smoothedLevel = state.meterLevel;
  if (el.levelBar) el.levelBar.style.width = `${clamp(smoothedLevel * 260, 1, 100)}%`;
  if (el.thresholdBar) el.thresholdBar.style.width = `${clamp(detectionThreshold * 260, 8, 100)}%`;
}

function handleDetectedTap(tap) {
  if (!listening || tap.time < -20) return;
  const source = tap.source || "mic";
  if (inputMode === "screen" && source === "mic") return;
  if (inputMode === "mic" && source !== "mic" && source !== "keyboard") return;
  detectedTaps.push({
    time: tap.time,
    strength: clamp(tap.strength, 0, 1),
    source
  });
  el.tapCount.textContent = `${detectedTaps.length} taps detected`;
  renderTapTable(detectedTaps);
}

async function playMouseTapFeedback(strength) {
  try {
    const ctx = createAudioContext();
    if (ctx.state === "suspended") await ctx.resume();
    playWoodKnock(strength, ctx.currentTime + 0.012);
  } catch (_error) {
    // Audio feedback is optional; scoring should still work if playback is blocked.
  }
}

function recordManualTap(event) {
  if (!listening || inputMode !== "screen") return;
  const target = event.target;
  if (target?.closest?.("button, a, input, textarea")) return;
  const now = performance.now();
  if (now - lastManualTapAt < 78) return;
  lastManualTapAt = now;
  event.preventDefault();

  const pressure = typeof event.pressure === "number" && event.pressure > 0 ? event.pressure : 0.72;
  const strength = clamp(pressure * 0.9 + 0.18, 0.35, 1);
  const source = event.pointerType === "mouse" ? "mouse" : "screen";
  if (source === "mouse") playMouseTapFeedback(strength);
  handleDetectedTap({
    time: now - listenStartedAt,
    strength,
    source
  });
}

function monitorInput() {
  if (!tapDetector) return;
  tapDetector.processFrame(performance.now(), listening);
  animationFrame = requestAnimationFrame(monitorInput);
}

function scoreRound(pattern, taps) {
  const target = pattern.taps.map(([time, strength]) => ({ time, strength }));
  const orderedTaps = [...taps].sort((a, b) => a.time - b.time);
  const comparedLen = Math.min(target.length, orderedTaps.length);
  const timingScores = [];
  const intervalScores = [];
  const strengthScores = [];
  const startOffset = orderedTaps[0] ? orderedTaps[0].time - target[0].time : 0;

  for (let i = 0; i < comparedLen; i += 1) {
    const expected = target[i];
    const actual = orderedTaps[i];
    const alignedTime = actual.time - startOffset;
    const timingError = Math.abs(alignedTime - expected.time);
    const strengthError = Math.abs(actual.strength - expected.strength);
    timingScores.push(Math.pow(clamp(1 - timingError / 520, 0, 1), 0.72));
    strengthScores.push(clamp(1 - strengthError / 0.92, 0, 1));

    if (i > 0) {
      const expectedGap = target[i].time - target[i - 1].time;
      const actualGap = orderedTaps[i].time - orderedTaps[i - 1].time;
      const intervalError = Math.abs(actualGap - expectedGap);
      intervalScores.push(Math.pow(clamp(1 - intervalError / 460, 0, 1), 0.7));
    }
  }

  const averageOrZero = (values) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);
  const timing = averageOrZero(timingScores);
  const intervals = averageOrZero(intervalScores);
  const strength = averageOrZero(strengthScores);
  const countAccuracy = clamp(1 - Math.abs(orderedTaps.length - target.length) / (target.length + 2), 0, 1);
  const missingPenalty = Math.max(0, target.length - orderedTaps.length) * 0.28;
  const extraPenalty = Math.max(0, orderedTaps.length - target.length) * 0.16;
  const raw = 10 * (timing * 0.46 + intervals * 0.28 + countAccuracy * 0.18 + strength * 0.08) - missingPenalty - extraPenalty;
  return clamp(raw, 0, 10);
}

function renderScoreList(listElement) {
  if (!listElement) return;
  listElement.innerHTML = "";
  patterns.forEach((pattern, index) => {
    const item = document.createElement("li");
    const score = roundScores[index];
    item.innerHTML = `<span dir="ltr">${index + 1}. ${pattern.name}</span><strong>${score === undefined ? "---" : formatScore(score)}</strong>`;
    if (index === roundIndex) item.classList.add("active");
    listElement.append(item);
  });
}

function renderRoundScores() {
  renderScoreList(el.roundScores);
  renderScoreList(el.finalRoundScores);
  el.progressText.textContent = `${roundScores.length}/5`;
}

function updateRoundHeader() {
  const pattern = patterns[roundIndex];
  el.roundLabel.textContent = `Round ${roundIndex + 1} / ${patterns.length}`;
  el.roundTitle.textContent = pattern ? pattern.name : "Game complete";
  if (el.roundPageTitle) el.roundPageTitle.textContent = `Round ${roundIndex + 1}`;
  el.startRoundButton.querySelector("span").textContent = `Play round ${roundIndex + 1}`;
  el.lastScore.textContent = "Round score appears on the next page.";
  updateInputModeButtons();
  renderTapTable([]);
  renderRoundScores();
}

function showRoundPage(index) {
  roundIndex = index;
  updateRoundHeader();
  setStatus("Waiting", "");
  setControls(false);
  showPageView(el.roundScreen);
}

function showRoundResult(completedIndex, score) {
  const isFinalRound = completedIndex + 1 === patterns.length;
  el.resultEyebrow.textContent = `Round ${completedIndex + 1} complete`;
  el.resultTitle.textContent = `${patterns[completedIndex].name} score`;
  el.stageScore.textContent = formatScore(score);
  el.stageScoreText.textContent =
    isFinalRound
      ? "Round 5 score is saved. Calculating your final average..."
      : "This stage score is saved. The average appears only after round 5.";
  el.nextRoundButton.hidden = isFinalRound;
  el.nextRoundButton.disabled = false;
  el.nextRoundButton.querySelector("span").textContent = `Open round ${completedIndex + 2}`;
  showPageView(el.roundResult);
  lucide.createIcons();

  if (isFinalRound) {
    setTimeout(() => {
      el.stageScoreText.textContent = "Crunching timing, strength, speed, and consistency...";
    }, 550);
    setTimeout(() => {
      goToPage("final.html");
    }, 2450);
  }
}

async function listenForRound() {
  detectedTaps = [];
  listening = true;
  listenStartedAt = performance.now();
  lastManualTapAt = -Infinity;
  if (tapDetector) tapDetector.beginListening(listenStartedAt);
  setStatus("Your turn", "listen");
  el.roundTitle.textContent = "Your turn: tap the rhythm now";
  el.tapCount.textContent = "0 taps detected";
  showPhase("TAP NOW", "tap");
  renderTapTable([]);

  return new Promise((resolve) => {
    const tick = () => {
      const left = Math.max(0, LISTEN_MS - (performance.now() - listenStartedAt));
      el.timeLeft.textContent = `${(left / 1000).toFixed(2)}s`;
      if (left <= 0) {
        listening = false;
        if (tapDetector) tapDetector.stopListening();
        hidePhase();
        el.timeLeft.textContent = "00:00";
        resolve(detectedTaps.filter((tap) => tap.time <= LISTEN_MS));
        return;
      }
      roundTimer = window.setTimeout(tick, COUNTDOWN_STEP_MS);
    };
    tick();
  });
}

async function startRound() {
  if (!patterns[roundIndex] || listening) return;
  const pattern = patterns[roundIndex];
  const completedIndex = roundIndex;
  setControls(true);
  updateRoundHeader();
  if (inputMode === "mic" && !tapDetector) {
    setStatus("Ready check", "calibrate");
    try {
      await requestMicrophone();
      await calibrate();
    } catch (_error) {
      saveInputMode("screen");
      setStatus("Phone tap", "ready");
    }
  }
  await runRoundCountdown();
  await playPattern(pattern);
  showPhase("GET READY TO TAP", "prep");
  await sleep(760);
  const taps = await listenForRound();
  window.clearTimeout(roundTimer);
  const score = scoreRound(pattern, taps);
  roundScores.push(score);
  saveScores(roundScores);
  el.lastScore.textContent = `Round ${roundIndex + 1}: ${formatScore(score)}`;
  setStatus("Score saved", "ready");
  roundIndex = completedIndex + 1;
  renderRoundScores();
  goToPage(`result.html?round=${completedIndex + 1}`);
}

async function finishGame() {
  playerName = readPlayerName() || playerName || "Player";
  roundScores = readSavedScores();
  if (roundScores.length < patterns.length) {
    el.averageScore.textContent = "0.000";
    el.summaryText.textContent = "Finish all five rounds before the final average is calculated.";
    renderRoundScores();
    showPageView(el.finalScreen);
    return;
  }
  const average = roundScores.reduce((sum, score) => sum + score, 0) / roundScores.length;
  const roundedAverage = Number(average.toFixed(3));
  el.averageScore.textContent = formatScore(roundedAverage);
  el.summaryText.textContent = `Nice work, ${playerName}. Calculating your leaderboard rank...`;
  setStatus("Complete", "done");
  el.roundTitle.textContent = "All five rounds are complete";
  el.startRoundButton.disabled = true;
  el.recalibrateButton.disabled = false;
  renderRoundScores();
  showPageView(el.finalScreen);
  setLeaderboardVisible(true);

  const submittedKey = `pulseTrialSubmitted:${playerName}:${roundScores.join(",")}`;
  if (sessionStorage.getItem(submittedKey)) {
    await loadLeaderboard();
    el.summaryText.textContent = `Average ${formatScore(roundedAverage)}. Your completed run is already on the board.`;
    return;
  }

  try {
    const response = await fetch("/api/leaderboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: playerName,
        average: roundedAverage,
        rounds: roundScores.map((score) => Number(score.toFixed(3)))
      })
    });
    const data = await response.json();
    sessionStorage.setItem(submittedKey, "true");
    el.summaryText.textContent = `Average ${formatScore(roundedAverage)}. Your rank: #${data.rank} of ${data.total}.`;
    renderLeaderboard(data.leaderboard, data.rank);
  } catch (error) {
    el.summaryText.textContent = `Average ${formatScore(roundedAverage)}. Leaderboard save failed; keep the server running.`;
    renderLeaderboard([]);
  }
}

function renderLeaderboard(rows, currentRank = null) {
  el.leaderboardList.innerHTML = "";
  if (!rows.length) {
    const empty = document.createElement("article");
    empty.className = "leader-row empty-leaderboard";
    empty.innerHTML = "<span>No real players yet</span><span>Finish a full run to enter the board.</span><span>--</span>";
    el.leaderboardList.append(empty);
    el.leaderboardMeta.textContent = "Only real completed runs are shown.";
    return;
  }
  rows.forEach((row, index) => {
    const clone = el.leaderTemplate.content.cloneNode(true);
    clone.querySelector(".rank").textContent = `#${index + 1}`;
    clone.querySelector(".leader-name").textContent = row.name;
    clone.querySelector(".leader-score").textContent = formatScore(row.average);
    if (currentRank === index + 1 && row.name === playerName) {
      clone.querySelector(".leader-row").classList.add("current");
    }
    el.leaderboardList.append(clone);
  });
  el.leaderboardMeta.textContent = currentRank
    ? `Last calculated rank: #${currentRank}`
    : "Scores are saved by the local game server.";
}

async function loadLeaderboard() {
  try {
    const response = await fetch("/api/leaderboard", { cache: "no-store" });
    const data = await response.json();
    renderLeaderboard(data.leaderboard);
  } catch (error) {
    renderLeaderboard([]);
  }
}

function initPage() {
  document.body.dataset.page = pageName.replace(".html", "") || "index";
  playerName = readPlayerName();
  roundScores = readSavedScores();

  if (pageName === "setup.html") {
    showPageView(el.setup);
    setLeaderboardVisible(false);
    el.playerName.value = playerName;
    el.identityPanel.hidden = false;
    el.micPanel.hidden = true;
    return;
  }

  if (pageName === "first-time.html") {
    setLeaderboardVisible(false);
    showPageView(el.firstTimeScreen);
    return;
  }

  if (pageName === "tutorial.html") {
    setLeaderboardVisible(false);
    showPageView(el.tutorialScreen);
    return;
  }

  if (pageName === "round.html") {
    const requestedRound = clamp(Number(urlParams.get("round") || 1), 1, patterns.length);
    roundIndex = requestedRound - 1;
    setLeaderboardVisible(false);
    showRoundPage(roundIndex);
    return;
  }

  if (pageName === "result.html") {
    const requestedRound = clamp(Number(urlParams.get("round") || 1), 1, patterns.length);
    const score = roundScores[requestedRound - 1] ?? 0;
    roundIndex = requestedRound;
    setLeaderboardVisible(false);
    showRoundResult(requestedRound - 1, score);
    return;
  }

  if (pageName === "final.html") {
    roundIndex = patterns.length;
    setLeaderboardVisible(true);
    finishGame();
    return;
  }

  setLeaderboardVisible(false);
  showPageView(el.intro);
}

el.playerForm.addEventListener("submit", (event) => {
  event.preventDefault();
  playerName = sanitizeName(el.playerName.value);
  savePlayerName(playerName);
  resetGameProgress();
  if (isTouchDevice()) {
    saveInputMode("screen");
    goToPage("round.html?round=1");
    return;
  }
  el.identityPanel.hidden = true;
  el.micPanel.hidden = false;
});

el.introButton.addEventListener("click", async () => {
  goToPage("first-time.html");
});

el.firstTimeYes.addEventListener("click", () => {
  localStorage.setItem("pulseTrialSeenTutorial", "true");
  goToPage("tutorial.html");
});

el.firstTimeNo.addEventListener("click", () => {
  goToPage("setup.html");
});

el.tutorialContinue.addEventListener("click", () => {
  localStorage.setItem("pulseTrialSeenTutorial", "true");
  goToPage("setup.html");
});

el.micButton.addEventListener("click", async () => {
  el.micButton.disabled = true;
  try {
    await requestMicrophone();
    mediaStream.getTracks().forEach((track) => track.stop());
    sessionStorage.setItem("pulseTrialMicAllowed", "true");
    saveInputMode("mic");
    resetGameProgress();
    goToPage("round.html?round=1");
  } catch (error) {
    el.micButton.disabled = false;
    el.micPanel.querySelector("p:last-child").textContent =
      "Microphone access was not granted. Allow microphone permission in the browser to play.";
  }
});

el.startRoundButton.addEventListener("click", startRound);
el.recalibrateButton.addEventListener("click", calibrate);
el.screenModeButton.addEventListener("click", () => selectInputMode("screen"));
el.micModeButton.addEventListener("click", () => selectInputMode("mic"));
el.nextRoundButton.addEventListener("click", async () => {
  if (roundIndex >= patterns.length) {
    goToPage("final.html");
    return;
  }
  goToPage(`round.html?round=${roundIndex + 1}`);
});

el.playAgainButton.addEventListener("click", () => {
  resetGameProgress();
  goToPage("round.html?round=1");
});

window.addEventListener("keydown", (event) => {
  if (!listening || event.code !== "Space") return;
  event.preventDefault();
  const elapsed = performance.now() - listenStartedAt;
  handleDetectedTap({ time: elapsed, strength: 0.72, source: "keyboard" });
});

window.addEventListener("pointerdown", recordManualTap, { passive: false });

initPage();
loadLeaderboard();
lucide.createIcons();
