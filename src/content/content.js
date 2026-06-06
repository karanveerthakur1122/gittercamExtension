// GitterCam content script - bridges extension messaging with page-context scripts.
(function () {
  const api = globalThis.browser ?? globalThis.chrome;

  const TO_PAGE = 'gittercam:to-page';
  const TO_CONTENT = 'gittercam:to-content';

  const MSG = {
    SET_MODE: 'gittercam:set-mode',
    SET_LOOP_SECONDS: 'gittercam:set-loop-seconds',
    SET_FILTER: 'gittercam:set-filter',
    SET_AUDIO_MODE: 'gittercam:set-audio-mode',
    SET_VOICE_PRESET: 'gittercam:set-voice-preset',
    GET_STATE: 'gittercam:get-state',
    STATE_UPDATE: 'gittercam:state-update',
    MODE_CHANGED: 'gittercam:mode-changed'
  };

  const SAMPLE_URLS = {
    typing: [
      api.runtime.getURL('audio/typing-1.wav'),
      api.runtime.getURL('audio/typing-2.wav'),
      api.runtime.getURL('audio/typing-3.wav')
    ],
    mouse: api.runtime.getURL('audio/mouse-click.wav')
  };

  let updateOverlay = () => {};

  function injectScript(file) {
    const el = document.createElement('script');
    el.src = api.runtime.getURL(file);
    el.async = false;
    el.addEventListener('load', () => el.remove());

    const root = document.head || document.documentElement;
    if (root) {
      root.appendChild(el);
      return;
    }
    const obs = new MutationObserver(() => {
      const r = document.head || document.documentElement;
      if (r) {
        obs.disconnect();
        r.appendChild(el);
      }
    });
    obs.observe(document, { childList: true, subtree: true });
  }

  injectScript('pipeline.js');
  injectScript('audio-pipeline.js');
  injectScript('inject.js');

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== TO_CONTENT) return;

    if (data.type === 'state') {
      api.runtime.sendMessage({
        type: MSG.STATE_UPDATE,
        connected: !!data.connected
      });
    } else if (data.type === 'mode-changed') {
      api.runtime.sendMessage({ type: MSG.MODE_CHANGED, mode: data.mode });
      updateOverlay(data.mode);
    } else if (data.type === 'ready') {
      window.postMessage({ source: TO_PAGE, type: 'set-sample-urls', urls: SAMPLE_URLS }, '*');
    } else if (data.type === 'screen-share') {
      const host = document.getElementById('gittercam-overlay-host');
      if (host) host.style.display = data.active ? 'none' : '';
    }
  });

  api.runtime.onMessage.addListener((message) => {
    if (!message || !message.type) return;

    switch (message.type) {
      case MSG.SET_MODE:
        window.postMessage({ source: TO_PAGE, type: 'set-mode', mode: message.mode }, '*');
        updateOverlay(message.mode);
        break;
      case MSG.SET_LOOP_SECONDS:
        window.postMessage(
          { source: TO_PAGE, type: 'set-loop-seconds', loopSeconds: message.loopSeconds },
          '*'
        );
        break;
      case MSG.SET_FILTER:
        window.postMessage(
          { source: TO_PAGE, type: 'set-filter', filter: message.filter },
          '*'
        );
        break;
      case MSG.SET_AUDIO_MODE:
        window.postMessage(
          { source: TO_PAGE, type: 'set-audio-mode', audioMode: message.audioMode },
          '*'
        );
        break;
      case MSG.SET_VOICE_PRESET:
        window.postMessage(
          { source: TO_PAGE, type: 'set-voice-preset', voicePreset: message.voicePreset },
          '*'
        );
        break;
      case MSG.GET_STATE:
        window.postMessage({ source: TO_PAGE, type: 'get-state' }, '*');
        break;
      default:
        break;
    }
  });

  const MODES = [
    { id: 'normal', label: 'Live', icon: '\u25B6' },
    { id: 'freeze', label: 'Freeze', icon: '\u2744' },
    { id: 'loop', label: 'Loop', icon: '\u21BB' },
    { id: 'stutter', label: 'Lag', icon: '\u26A1' }
  ];

  function createOverlay() {
    if (document.getElementById('gittercam-overlay-host')) return;

    const host = document.createElement('div');
    host.id = 'gittercam-overlay-host';
    host.style.cssText =
      'position:fixed;right:20px;bottom:96px;z-index:2147483647;all:initial;';
    const shadow = host.attachShadow({ mode: 'closed' });

    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        .wrap {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          display: flex; align-items: center; gap: 4px;
          background: #14151aee; border: 1px solid #2a2d3a; border-radius: 999px;
          padding: 5px; box-shadow: 0 6px 24px #0008; backdrop-filter: blur(6px);
          user-select: none; cursor: default;
        }
        .grip { padding: 0 4px; color: #5a5f6c; cursor: grab; font-size: 13px; line-height: 1; }
        .wrap.collapsed .btn, .wrap.collapsed .grip { display: none; }
        .wrap.collapsed { padding: 0; }
        .dot {
          display: none; width: 26px; height: 26px; border-radius: 50%;
          background: linear-gradient(135deg,#5b8cff,#8a6bff); cursor: pointer;
        }
        .wrap.collapsed .dot { display: block; }
        .btn {
          display: inline-flex; flex-direction: column; align-items: center;
          gap: 1px; border: none; background: transparent; color: #c7cad4;
          border-radius: 999px; padding: 5px 9px; cursor: pointer; font-size: 13px;
        }
        .btn small { font-size: 9px; color: #8a8f9c; }
        .btn:hover { background: #ffffff14; }
        .btn.active { background: #20243a; color: #fff; box-shadow: 0 0 0 1px #5b8cff inset; }
        .btn.active small { color: #9db4ff; }
      </style>
      <div class="wrap" part="wrap">
        <span class="grip" title="Drag">\u22ee\u22ee</span>
        <span class="dot" title="GitterCam"></span>
        ${MODES.map(
          (m) =>
            `<button class="btn" data-mode="${m.id}"><span>${m.icon}</span><small>${m.label}</small></button>`
        ).join('')}
      </div>
    `;

    document.body.appendChild(host);

    const wrap = shadow.querySelector('.wrap');
    const grip = shadow.querySelector('.grip');
    const dot = shadow.querySelector('.dot');

    shadow.querySelectorAll('.btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const m = btn.dataset.mode;
        api.runtime.sendMessage({ type: MSG.SET_MODE, mode: m });
        window.postMessage({ source: TO_PAGE, type: 'set-mode', mode: m }, '*');
        setActive(m);
      });
    });

    function setActive(m) {
      shadow.querySelectorAll('.btn').forEach((b) => {
        b.classList.toggle('active', b.dataset.mode === m);
      });
    }

    dot.addEventListener('click', () => wrap.classList.remove('collapsed'));
    wrap.addEventListener('dblclick', (e) => {
      if (e.target.closest('.btn')) return;
      wrap.classList.toggle('collapsed');
    });

    let dragging = false;
    let offX = 0;
    let offY = 0;
    grip.addEventListener('mousedown', (e) => {
      dragging = true;
      const rect = host.getBoundingClientRect();
      offX = e.clientX - rect.left;
      offY = e.clientY - rect.top;
      grip.style.cursor = 'grabbing';
      e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      host.style.left = `${e.clientX - offX}px`;
      host.style.top = `${e.clientY - offY}px`;
      host.style.right = 'auto';
      host.style.bottom = 'auto';
    });
    window.addEventListener('mouseup', () => {
      dragging = false;
      grip.style.cursor = 'grab';
    });

    updateOverlay = setActive;
    Promise.resolve(api.runtime.sendMessage({ type: MSG.GET_STATE }))
      .then((state) => {
        if (state && state.mode) setActive(state.mode);
      })
      .catch(() => {});
  }

  if (window.top === window) {
    if (document.body) createOverlay();
    else document.addEventListener('DOMContentLoaded', createOverlay);
  }

  window.postMessage({ source: TO_PAGE, type: 'get-state' }, '*');
})();
