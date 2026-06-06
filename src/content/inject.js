// GitterCam - patches getUserMedia/getDisplayMedia and handles control messages.
(function () {
  if (window.__gittercamInjected) return;
  window.__gittercamInjected = true;

  const TO_PAGE = 'gittercam:to-page';
  const TO_CONTENT = 'gittercam:to-content';

  function postToContent(payload) {
    window.postMessage({ source: TO_CONTENT, ...payload }, '*');
  }

  if (window.__gittercamPipeline) {
    window.__gittercamPipeline.notifyModeChange = (mode) => {
      postToContent({ type: 'mode-changed', mode });
    };
  }

  const md = navigator.mediaDevices;

  if (md && typeof md.getUserMedia === 'function') {
    const original = md.getUserMedia.bind(md);
    md.getUserMedia = async function (constraints) {
      const realStream = await original(constraints);
      try {
        const wantsVideo = constraints && constraints.video;
        const wantsAudio = constraints && constraints.audio;
        let videoTracks = realStream.getVideoTracks();
        let audioTracks = realStream.getAudioTracks();
        let connected = false;

        if (wantsVideo && window.__gittercamPipeline && videoTracks.length) {
          const v = await window.__gittercamPipeline.intercept(realStream);
          videoTracks = v.getVideoTracks();
          connected = true;
        }

        if (wantsAudio && window.__gittercamAudio && audioTracks.length) {
          const a = await window.__gittercamAudio.interceptAudio(realStream);
          if (a) {
            audioTracks = a.getAudioTracks();
            connected = true;
          }
        }

        if (connected) {
          postToContent({ type: 'state', connected: true });
          return new MediaStream([...videoTracks, ...audioTracks]);
        }
      } catch (err) {
        console.warn('[GitterCam] interception failed, using real media:', err);
        return realStream;
      }
      return realStream;
    };
  }

  if (md && typeof md.getDisplayMedia === 'function') {
    const originalGetDisplayMedia = md.getDisplayMedia.bind(md);
    md.getDisplayMedia = async function (constraints) {
      const stream = await originalGetDisplayMedia(constraints);
      try {
        const pipeline = window.__gittercamPipeline;
        const audio = window.__gittercamAudio;
        if (pipeline) pipeline.onScreenShareStart();
        if (audio) audio.onScreenShareStart();
        postToContent({ type: 'screen-share', active: true });

        const track = stream.getVideoTracks()[0];
        if (track) {
          track.addEventListener('ended', () => {
            if (pipeline) pipeline.onScreenShareEnd();
            if (audio) audio.onScreenShareEnd();
            postToContent({ type: 'screen-share', active: false });
          });
        }
      } catch (err) {
        console.warn('[GitterCam] screen-share hook failed:', err);
      }
      return stream;
    };
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== TO_PAGE) return;

    const pipeline = window.__gittercamPipeline;
    if (!pipeline) return;

    switch (data.type) {
      case 'set-mode':
        pipeline.setMode(data.mode);
        break;
      case 'set-loop-seconds':
        pipeline.setLoopSeconds(data.loopSeconds);
        break;
      case 'set-filter':
        pipeline.setFilter(data.filter);
        break;
      case 'set-audio-mode':
        if (window.__gittercamAudio) window.__gittercamAudio.setAudioMode(data.audioMode);
        break;
      case 'set-voice-preset':
        if (window.__gittercamAudio) window.__gittercamAudio.setVoicePreset(data.voicePreset);
        break;
      case 'set-sample-urls':
        if (window.__gittercamAudio) window.__gittercamAudio.setSampleUrls(data.urls);
        break;
      case 'get-state':
        postToContent({ type: 'state', connected: pipeline.connected });
        break;
      default:
        break;
    }
  });

  postToContent({ type: 'ready' });
})();
