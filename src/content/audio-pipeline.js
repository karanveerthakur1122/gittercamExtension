// GitterCam audio pipeline - Web Audio voice effects and ambient generation.
(function () {
  if (window.__gittercamAudio) return;

  const AC = window.AudioContext || window.webkitAudioContext;

  // Resume suspended AudioContexts on user gesture (Chrome autoplay policy).
  const liveContexts = new Set();
  function resumeContexts() {
    for (const ctx of liveContexts) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    }
  }
  ['pointerdown', 'mousedown', 'keydown', 'touchstart', 'click'].forEach((ev) =>
    window.addEventListener(ev, resumeContexts, { capture: true, passive: true })
  );

  const AUDIO_MODE = {
    NORMAL: 'normal',
    MUTED_AMBIENT: 'muted-ambient',
    VOICE: 'voice-changed',
    TYPING: 'typing'
  };

  const VOICE = {
    NONE: 'none',
    DEEP: 'deep',
    HIGH: 'high',
    ROBOT: 'robot',
    ECHO: 'echo',
    WHISPER: 'whisper',
    CHIPMUNK: 'chipmunk'
  };

  const PITCH_RATIO = {
    [VOICE.DEEP]: 0.78,
    [VOICE.HIGH]: 1.45,
    [VOICE.CHIPMUNK]: 1.9
  };

  function createPitchShifter(ctx, initialRatio) {
    const node = ctx.createScriptProcessor(1024, 1, 1);
    const size = 16384;
    const buffer = new Float32Array(size);
    let writePos = 0;
    let readPos = 0;
    const grain = 2048;
    let ratio = initialRatio;

    node.setRatio = (r) => {
      ratio = r;
    };

    node.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      const output = e.outputBuffer.getChannelData(0);

      for (let i = 0; i < input.length; i++) {
        buffer[writePos] = input[i];
        writePos = (writePos + 1) % size;

        const r1 = readPos;
        const r2 = (readPos + grain / 2) % size;

        const i1 = Math.floor(r1);
        const i2 = Math.floor(r2);
        const f1 = r1 - i1;
        const f2 = r2 - i2;

        const s1 =
          buffer[i1] * (1 - f1) + buffer[(i1 + 1) % size] * f1;
        const s2 =
          buffer[i2] * (1 - f2) + buffer[(i2 + 1) % size] * f2;

        const phase = (readPos % grain) / grain;
        const w = Math.abs(0.5 - phase) * 2;
        output[i] = s1 * w + s2 * (1 - w);

        readPos = (readPos + ratio) % size;
      }
    };

    return node;
  }

  function makeNoiseBuffer(ctx, seconds, type) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      if (type === 'brown') {
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.5;
      } else {
        data[i] = white;
      }
    }
    return buf;
  }

  class AudioInstance {
    constructor(manager, realStream) {
      this.manager = manager;
      this.realStream = realStream;
      this.ctx = new AC();
      liveContexts.add(this.ctx);

      this.source = this.ctx.createMediaStreamSource(
        new MediaStream(realStream.getAudioTracks())
      );
      this.dest = this.ctx.createMediaStreamDestination();

      // Silent tap to ctx.destination keeps the graph pulled even before consumer attaches.
      this.outBus = this.ctx.createGain();
      this.outBus.connect(this.dest);
      const silent = this.ctx.createGain();
      silent.gain.value = 0;
      this.outBus.connect(silent);
      silent.connect(this.ctx.destination);

      this.nodes = [];
      this.ambientNodes = [];
      this.typingTimer = null;
      this.samples = null;

      this._loadSamples();
      this.rebuild();
    }

    get stream() {
      return this.dest.stream;
    }

    async _loadSamples() {
      const urls = this.manager.sampleUrls;
      if (!urls) return;
      try {
        const load = async (url) => {
          const res = await fetch(url);
          const buf = await res.arrayBuffer();
          return await this.ctx.decodeAudioData(buf);
        };
        const [t1, t2, t3, mouse] = await Promise.all([
          load(urls.typing[0]),
          load(urls.typing[1]),
          load(urls.typing[2]),
          load(urls.mouse)
        ]);
        this.samples = { typing: [t1, t2, t3], mouse };
        if (
          this.manager.audioMode === AUDIO_MODE.TYPING ||
          this.manager.audioMode === AUDIO_MODE.MUTED_AMBIENT
        ) {
          this.rebuild();
        }
      } catch (err) {
        console.warn('[GitterCam] audio sample load failed:', err);
      }
    }

    _disconnectAll() {
      try {
        this.source.disconnect();
      } catch (_) {
        /* ignore */
      }
      for (const n of this.nodes) {
        try {
          n.disconnect();
          if (n.stop) n.stop();
        } catch (_) {
          /* ignore */
        }
      }
      this.nodes = [];
      this._stopAmbient();
      this._stopTyping();
    }

    rebuild() {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      this._disconnectAll();

      const mode = this.manager.audioMode;
      if (mode === AUDIO_MODE.MUTED_AMBIENT) {
        this._startAmbient();
      } else if (mode === AUDIO_MODE.VOICE) {
        this._connectVoice();
      } else if (mode === AUDIO_MODE.TYPING) {
        this.source.connect(this.outBus);
        this._startTyping();
      } else {
        this.source.connect(this.outBus);
      }
    }

    _connectVoice() {
      const ctx = this.ctx;
      const preset = this.manager.voicePreset;

      if (preset === VOICE.ROBOT) {
        const osc = ctx.createOscillator();
        osc.frequency.value = 50;
        const ring = ctx.createGain();
        ring.gain.value = 0;
        osc.connect(ring.gain);
        this.source.connect(ring);
        ring.connect(this.outBus);
        osc.start();
        this.nodes.push(osc, ring);
        return;
      }

      if (preset === VOICE.ECHO) {
        const delay = ctx.createDelay(1.0);
        delay.delayTime.value = 0.28;
        const fb = ctx.createGain();
        fb.gain.value = 0.45;
        this.source.connect(this.outBus);
        this.source.connect(delay);
        delay.connect(fb);
        fb.connect(delay);
        delay.connect(this.outBus);
        this.nodes.push(delay, fb);
        return;
      }

      if (preset === VOICE.WHISPER) {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 2600;
        bp.Q.value = 0.8;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 1600;

        const noise = ctx.createBufferSource();
        noise.buffer = makeNoiseBuffer(ctx, 2, 'white');
        noise.loop = true;
        const noiseGain = ctx.createGain();
        noiseGain.gain.value = 0.08;

        this.source.connect(hp);
        hp.connect(bp);
        bp.connect(this.outBus);
        noise.connect(noiseGain);
        noiseGain.connect(this.outBus);
        noise.start();
        this.nodes.push(bp, hp, noise, noiseGain);
        return;
      }

      const ratio = PITCH_RATIO[preset] || 1;
      const shifter = createPitchShifter(ctx, ratio);
      this.source.connect(shifter);
      shifter.connect(this.outBus);
      this.nodes.push(shifter);
    }

    _startAmbient() {
      const ctx = this.ctx;

      const noise = ctx.createBufferSource();
      noise.buffer = makeNoiseBuffer(ctx, 3, 'brown');
      noise.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 320;
      const g = ctx.createGain();
      g.gain.value = 0.06;
      noise.connect(lp);
      lp.connect(g);
      g.connect(this.outBus);
      noise.start();
      this.ambientNodes.push(noise, lp, g);

      if (this.samples) {
        this.ambientTimer = setInterval(() => {
          if (Math.random() < 0.5) this._playClick(0.18);
        }, 600 + Math.random() * 900);
      }
    }

    _stopAmbient() {
      for (const n of this.ambientNodes) {
        try {
          n.disconnect();
          if (n.stop) n.stop();
        } catch (_) {
          /* ignore */
        }
      }
      this.ambientNodes = [];
      if (this.ambientTimer) {
        clearInterval(this.ambientTimer);
        this.ambientTimer = null;
      }
    }

    _startTyping() {
      if (!this.samples) return;
      const tick = () => {
        this._playKeystroke();
        this.typingTimer = setTimeout(tick, 60 + Math.random() * 160);
      };
      tick();
    }

    _stopTyping() {
      if (this.typingTimer) {
        clearTimeout(this.typingTimer);
        this.typingTimer = null;
      }
    }

    _playKeystroke() {
      if (!this.samples) return;
      const pool = this.samples.typing;
      const buf = pool[Math.floor(Math.random() * pool.length)];
      this._playBuffer(buf, 0.5 + Math.random() * 0.4, 0.92 + Math.random() * 0.16);
    }

    _playClick(gain) {
      if (!this.samples) return;
      const buf =
        Math.random() < 0.7
          ? this.samples.typing[Math.floor(Math.random() * 3)]
          : this.samples.mouse;
      this._playBuffer(buf, gain, 0.9 + Math.random() * 0.2);
    }

    _playBuffer(buffer, gainVal, rate) {
      if (!buffer) return;
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = rate;
      const g = this.ctx.createGain();
      g.gain.value = gainVal;
      src.connect(g);
      g.connect(this.outBus);
      src.start();
    }

    stop() {
      this._disconnectAll();
      liveContexts.delete(this.ctx);
      try {
        this.ctx.close();
      } catch (_) {
        /* ignore */
      }
      this.manager.instances.delete(this);
    }
  }

  const manager = {
    AUDIO_MODE,
    VOICE,
    audioMode: AUDIO_MODE.NORMAL,
    voicePreset: VOICE.NONE,
    sampleUrls: null,
    instances: new Set(),

    setSampleUrls(urls) {
      this.sampleUrls = urls;
    },

    async interceptAudio(realStream) {
      if (!realStream || realStream.getAudioTracks().length === 0) return null;
      const inst = new AudioInstance(this, realStream);
      this.instances.add(inst);

      if (inst.ctx.state === 'suspended') {
        try {
          await inst.ctx.resume();
        } catch (_) {
          /* ignore */
        }
      }

      const at = realStream.getAudioTracks()[0];
      if (at) at.addEventListener('ended', () => inst.stop());

      return inst.stream;
    },

    setAudioMode(mode) {
      if (!Object.values(AUDIO_MODE).includes(mode)) return;
      this.audioMode = mode;
      for (const inst of this.instances) inst.rebuild();
    },

    setVoicePreset(preset) {
      if (!Object.values(VOICE).includes(preset)) return;
      this.voicePreset = preset;
      if (this.audioMode === AUDIO_MODE.VOICE) {
        for (const inst of this.instances) inst.rebuild();
      }
    },

    onScreenShareStart() {
      this._savedAudioMode = this.audioMode;
      if (this.audioMode !== AUDIO_MODE.NORMAL) this.setAudioMode(AUDIO_MODE.NORMAL);
    },

    onScreenShareEnd() {
      const restore = this._savedAudioMode;
      this._savedAudioMode = null;
      if (restore && restore !== AUDIO_MODE.NORMAL) this.setAudioMode(restore);
    },

    get active() {
      return this.instances.size > 0;
    }
  };

  window.__gittercamAudio = manager;
})();
