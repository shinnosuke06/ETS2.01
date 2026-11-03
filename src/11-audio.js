// ---------------------------------------------------------------------------
// Synthesised sound: inline-six diesel, turbo, retarder, wind and road noise,
// indicator relay, air horn, ETC chime and impacts. Starts on a user gesture.
// ---------------------------------------------------------------------------
const AUD = { ctx: null, on: false, vol: lsGet('nlh.vol', 0.7) };
function initAudio() {
  if (AUD.ctx) { AUD.ctx.resume && AUD.ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  let ctx;
  try { ctx = new AC(); } catch (e) { return; }
  AUD.ctx = ctx;
  const master = ctx.createGain(); master.gain.value = AUD.vol;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
  master.connect(comp); comp.connect(ctx.destination);
  AUD.master = master;
  const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = nb.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  AUD.noiseBuf = nb;
  const noise = () => { const s = ctx.createBufferSource(); s.buffer = nb; s.loop = true; s.start(); return s; };
  const osc = (type, f) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.start(); return o; };
  const gain = (v, to) => { const g = ctx.createGain(); g.gain.value = v; if (to) g.connect(to); return g; };
  const filt = (type, f, q, to) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; if (to) b.connect(to); return b; };

  // engine
  AUD.eng = gain(0, master);
  AUD.engLP = filt('lowpass', 500, 0.8, AUD.eng);
  AUD.o1 = osc('sawtooth', 30); AUD.o1.connect(gain(0.28, AUD.engLP));
  AUD.o2 = osc('square', 15); AUD.o2.connect(gain(0.18, AUD.engLP));
  AUD.o3 = osc('sine', 15); AUD.o3.connect(gain(0.6, AUD.engLP));
  const clatter = gain(0.0, AUD.engLP);
  AUD.clatterG = clatter;
  const nbp = filt('bandpass', 1100, 1.1, clatter);
  noise().connect(nbp);
  AUD.lfo = osc('square', 30);
  const depth = gain(0.5); AUD.lfo.connect(depth); depth.connect(clatter.gain);
  // turbo whistle
  AUD.turboG = gain(0, master); AUD.turbo = osc('sine', 2200); AUD.turbo.connect(AUD.turboG);
  // wind and road
  AUD.windG = gain(0, master); noise().connect(filt('bandpass', 650, 0.45, AUD.windG));
  AUD.roadG = gain(0, master); noise().connect(filt('lowpass', 170, 0.7, AUD.roadG));
  // retarder
  AUD.retG = gain(0, master); const rbp = filt('bandpass', 320, 2.5, AUD.retG); noise().connect(rbp); AUD.retO = osc('triangle', 160); AUD.retO.connect(gain(0.25, AUD.retG));
  // horn
  AUD.hornG = gain(0, master); const hl = filt('lowpass', 2400, 0.7, AUD.hornG);
  for (const f of [311, 392, 466]) osc('sawtooth', f).connect(gain(0.18, hl));
  AUD.on = true;
}
function setVolume(v) { AUD.vol = v; lsSet('nlh.vol', v); if (AUD.master) AUD.master.gain.setTargetAtTime(v, AUD.ctx.currentTime, 0.05); }
function audioUpdate(st) {
  if (!AUD.on) return;
  const t = AUD.ctx.currentTime, k = 0.05;
  const fire = st.rpm / 60 * 3;
  AUD.o1.frequency.setTargetAtTime(fire, t, k); AUD.o2.frequency.setTargetAtTime(fire * 0.5, t, k);
  AUD.o3.frequency.setTargetAtTime(fire * 0.5, t, k); AUD.lfo.frequency.setTargetAtTime(fire, t, k);
  const cab = st.inCab ? 0.75 : 1;
  AUD.engLP.frequency.setTargetAtTime((220 + st.load * 900 + st.rpm * 0.28) * cab, t, 0.08);
  AUD.eng.gain.setTargetAtTime(st.running ? (0.2 + st.load * 0.32 + st.rpm / 2300 * 0.12) * (st.inCab ? 0.85 : 1) : 0, t, 0.08);
  AUD.clatterG.gain.setTargetAtTime(st.running ? 0.05 + st.load * 0.12 : 0, t, 0.1);
  AUD.turbo.frequency.setTargetAtTime(1500 + st.rpm * 1.3, t, 0.2);
  AUD.turboG.gain.setTargetAtTime(st.running ? st.load * st.rpm / 2300 * 0.022 : 0, t, 0.25);
  const sp = Math.abs(st.v) / 25;
  AUD.windG.gain.setTargetAtTime(sp * sp * (st.inCab ? 0.16 : 0.3) * (st.tunnel ? 1.5 : 1), t, 0.2);
  AUD.roadG.gain.setTargetAtTime(Math.min(1, sp) * 0.22, t, 0.2);
  AUD.retG.gain.setTargetAtTime(st.ret * Math.min(1, sp * 2) * 0.12, t, 0.1);
  AUD.retO.frequency.setTargetAtTime(120 + Math.abs(st.v) * 9, t, 0.1);
}
function sfxBurst({ f = 2500, q = 3, dur = 0.02, vol = 0.25, type = 'bandpass' } = {}) {
  if (!AUD.on) return;
  const ctx = AUD.ctx, t = ctx.currentTime;
  const s = ctx.createBufferSource(); s.buffer = AUD.noiseBuf;
  const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q;
  const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(b); b.connect(g); g.connect(AUD.master);
  s.start(t, Math.random()); s.stop(t + dur + 0.02);
}
function sfxTick(on) { sfxBurst({ f: on ? 2800 : 1900, q: 4, dur: 0.025, vol: 0.35 }); }
function sfxThump(strength) { sfxBurst({ f: 120, q: 0.8, dur: 0.35, vol: clamp(0.3 + strength * 0.1, 0.3, 1.2), type: 'lowpass' }); sfxBurst({ f: 900, q: 1, dur: 0.15, vol: 0.3 }); }
function sfxScrape() { sfxBurst({ f: 3200, q: 1.5, dur: 0.5, vol: 0.25 }); }
function sfxTone(freqs, len = 0.22, vol = 0.18) {
  if (!AUD.on) return;
  const ctx = AUD.ctx; let t = ctx.currentTime;
  for (const f of freqs) {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + len * 1.6);
    o.connect(g); g.connect(AUD.master); o.start(t); o.stop(t + len * 1.7);
    t += len;
  }
}
function sfxChime() { sfxTone([1319, 1047], 0.26, 0.2); }
function sfxStarter() {
  if (!AUD.on) return;
  const ctx = AUD.ctx, t = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(18, t); o.frequency.linearRampToValueAtTime(26, t + 0.9);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.35, t + 0.08); g.gain.setValueAtTime(0.35, t + 0.8); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
  o.connect(lp); lp.connect(g); g.connect(AUD.master); o.start(t); o.stop(t + 1.2);
}
function setHorn(on) { if (AUD.on) AUD.hornG.gain.setTargetAtTime(on ? 0.28 : 0, AUD.ctx.currentTime, 0.02); }
