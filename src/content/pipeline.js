// GitterCam video pipeline - canvas-based webcam stream manipulation.
(function () {
  if (window.__gittercamPipeline) return;

  const MODE = { NORMAL: 'normal', FREEZE: 'freeze', LOOP: 'loop', STUTTER: 'stutter' };
  const OUTPUT_FPS = 30;

  function now() {
    return performance.now();
  }

  class CameraInstance {
    constructor(manager, realStream) {
      this.manager = manager;
      this.realStream = realStream;

      this.video = document.createElement('video');
      this.video.muted = true;
      this.video.playsInline = true;
      this.video.srcObject = new MediaStream(realStream.getVideoTracks());

      this.canvas = document.createElement('canvas');
      this.ctx = this.canvas.getContext('2d', { alpha: false });

      this.rafId = null;
      this.started = false;

      // Loop state.
      this.loopFrames = [];
      this.loopPhase = 'idle';
      this.loopRecordStart = 0;
      this.loopPlayStart = 0;
      this.capturing = false;

      // Stutter state.
      this.holdUntil = 0;

      this.outputStream = null;
      this._lastMode = MODE.NORMAL;
    }

    async start() {
      try {
        await this.video.play();
      } catch (_) {
        /* ignore */
      }

      const w = this.video.videoWidth || 640;
      const h = this.video.videoHeight || 480;
      this.canvas.width = w;
      this.canvas.height = h;

      this.ctx.drawImage(this.video, 0, 0, w, h);

      const canvasStream = this.canvas.captureStream(OUTPUT_FPS);
      this.outputStream = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...this.realStream.getAudioTracks()
      ]);

      this.started = true;
      this._loop();

      const vt = this.realStream.getVideoTracks()[0];
      if (vt) vt.addEventListener('ended', () => this.stop());

      return this.outputStream;
    }

    onModeChange(mode) {
      if (mode === MODE.LOOP && this._lastMode !== MODE.LOOP) {
        this.loopFrames = [];
        this.loopPhase = 'recording';
        this.loopRecordStart = now();
      }
      if (mode === MODE.STUTTER && this._lastMode !== MODE.STUTTER) {
        this.holdUntil = 0;
      }
      this._lastMode = mode;
    }

    _drawLive() {
      this.ctx.filter = this.manager.filter || 'none';
      this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
      this.ctx.filter = 'none';
    }

    _renderNormal() {
      this._drawLive();
    }

    _renderFreeze() {}

    _renderLoop() {
      const loopMs = this.manager.loopSeconds * 1000;

      if (this.loopPhase === 'recording') {
        this._drawLive();
        if (!this.capturing) {
          this.capturing = true;
          createImageBitmap(this.video)
            .then((bmp) => {
              this.loopFrames.push(bmp);
              this.capturing = false;
            })
            .catch(() => {
              this.capturing = false;
            });
        }
        if (now() - this.loopRecordStart >= loopMs && this.loopFrames.length > 0) {
          this.loopPhase = 'playing';
          this.loopPlayStart = now();
        }
        return;
      }

      if (this.loopPhase === 'playing' && this.loopFrames.length > 0) {
        const elapsed = (now() - this.loopPlayStart) % loopMs;
        const idx = Math.min(
          this.loopFrames.length - 1,
          Math.floor((elapsed / loopMs) * this.loopFrames.length)
        );
        const bmp = this.loopFrames[idx];
        this.ctx.filter = this.manager.filter || 'none';
        this.ctx.drawImage(bmp, 0, 0, this.canvas.width, this.canvas.height);
        this.ctx.filter = 'none';
      } else {
        this._drawLive();
      }
    }

    _renderStutter() {
      const t = now();
      if (t < this.holdUntil) return;

      this._drawLive();
      const roll = Math.random();
      if (roll < 0.15) {
        this.holdUntil = t + 700 + Math.random() * 1300;
      } else if (roll < 0.75) {
        this.holdUntil = t + 120 + Math.random() * 500;
      } else {
        this.holdUntil = t + 30;
      }
    }

    _loop() {
      const tick = () => {
        if (!this.started) return;
        if (this.video.readyState >= 2) {
          switch (this.manager.mode) {
            case MODE.FREEZE:
              this._renderFreeze();
              break;
            case MODE.LOOP:
              this._renderLoop();
              break;
            case MODE.STUTTER:
              this._renderStutter();
              break;
            default:
              this._renderNormal();
          }
        }
        this.rafId = requestAnimationFrame(tick);
      };
      this.rafId = requestAnimationFrame(tick);
    }

    stop() {
      this.started = false;
      if (this.rafId) cancelAnimationFrame(this.rafId);
      this.rafId = null;
      for (const bmp of this.loopFrames) {
        if (bmp.close) bmp.close();
      }
      this.loopFrames = [];
      try {
        this.video.srcObject = null;
      } catch (_) {
        /* ignore */
      }
      this.manager.instances.delete(this);
    }
  }

  const manager = {
    MODE,
    mode: MODE.NORMAL,
    loopSeconds: 5,
    filter: 'none',
    screenSharing: false,
    _savedMode: null,
    notifyModeChange: null,
    instances: new Set(),

    async intercept(realStream) {
      if (!realStream || realStream.getVideoTracks().length === 0) {
        return realStream;
      }
      const instance = new CameraInstance(this, realStream);
      this.instances.add(instance);
      instance.onModeChange(this.mode);
      const out = await instance.start();
      return out;
    },

    setMode(mode) {
      if (!Object.values(MODE).includes(mode)) return;
      this.mode = mode;
      for (const inst of this.instances) inst.onModeChange(mode);
      if (typeof this.notifyModeChange === 'function') this.notifyModeChange(mode);
    },

    setLoopSeconds(seconds) {
      const s = Number(seconds);
      if (Number.isFinite(s) && s > 0) this.loopSeconds = s;
    },

    setFilter(filter) {
      this.filter = filter || 'none';
    },

    onScreenShareStart() {
      if (this.screenSharing) return;
      this.screenSharing = true;
      this._savedMode = this.mode;
      if (this.mode !== MODE.NORMAL) this.setMode(MODE.NORMAL);
    },

    onScreenShareEnd() {
      if (!this.screenSharing) return;
      this.screenSharing = false;
      const restore = this._savedMode;
      this._savedMode = null;
      if (restore && restore !== MODE.NORMAL) this.setMode(restore);
    },

    get connected() {
      return this.instances.size > 0;
    }
  };

  window.__gittercamPipeline = manager;
})();
