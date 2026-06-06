// GitterCam service worker / background event page.
(function () {
  const api = globalThis.browser ?? globalThis.chrome;

  const MODE = { NORMAL: 'normal', FREEZE: 'freeze', LOOP: 'loop', STUTTER: 'stutter' };
  const MODE_BADGE = { normal: '', freeze: 'F', loop: 'L', stutter: 'S' };

  const MSG = {
    SET_MODE: 'gittercam:set-mode',
    SET_LOOP_SECONDS: 'gittercam:set-loop-seconds',
    SET_FILTER: 'gittercam:set-filter',
    SET_AUDIO_MODE: 'gittercam:set-audio-mode',
    SET_VOICE_PRESET: 'gittercam:set-voice-preset',
    GET_STATE: 'gittercam:get-state',
    SCHEDULE_FREEZE: 'gittercam:schedule-freeze',
    CANCEL_SCHEDULE: 'gittercam:cancel-schedule',
    PANIC: 'gittercam:panic',
    STATE_UPDATE: 'gittercam:state-update',
    MODE_CHANGED: 'gittercam:mode-changed'
  };

  const COMMAND_MODE = {
    'toggle-freeze': MODE.FREEZE,
    'toggle-loop': MODE.LOOP,
    'toggle-stutter': MODE.STUTTER,
    'toggle-normal': MODE.NORMAL
  };

  const STORAGE_KEY = 'loopSeconds';
  const FILTER_KEY = 'filter';
  const AUDIO_MODE_KEY = 'audioMode';
  const VOICE_PRESET_KEY = 'voicePreset';
  const DEFAULT_LOOP_SECONDS = 5;
  const DEFAULT_FILTER = 'none';
  const DEFAULT_AUDIO_MODE = 'normal';
  const DEFAULT_VOICE_PRESET = 'deep';

  const tabState = new Map();

  function getTabState(tabId) {
    let s = tabState.get(tabId);
    if (!s) {
      s = { mode: MODE.NORMAL, connected: false };
      tabState.set(tabId, s);
    }
    return s;
  }

  const SUPPORTED_PATTERNS = [
    /^https?:\/\/meet\.google\.com\//,
    /^https?:\/\/[^/]*\.zoom\.us\//,
    /^https?:\/\/teams\.(microsoft|live)\.com\//,
    /^https?:\/\/app\.slack\.com\//,
    /^https?:\/\/discord\.com\//
  ];

  function isSupportedUrl(url) {
    return typeof url === 'string' && SUPPORTED_PATTERNS.some((r) => r.test(url));
  }

  async function getLoopSeconds() {
    try {
      const res = await api.storage.local.get(STORAGE_KEY);
      return res[STORAGE_KEY] ?? DEFAULT_LOOP_SECONDS;
    } catch (_) {
      return DEFAULT_LOOP_SECONDS;
    }
  }

  async function setLoopSecondsStored(seconds) {
    try {
      await api.storage.local.set({ [STORAGE_KEY]: seconds });
    } catch (_) {
      /* ignore */
    }
  }

  async function getFilter() {
    try {
      const res = await api.storage.local.get(FILTER_KEY);
      return res[FILTER_KEY] ?? DEFAULT_FILTER;
    } catch (_) {
      return DEFAULT_FILTER;
    }
  }

  async function setFilterStored(filter) {
    try {
      await api.storage.local.set({ [FILTER_KEY]: filter });
    } catch (_) {
      /* ignore */
    }
  }

  async function getStored(key, fallback) {
    try {
      const res = await api.storage.local.get(key);
      return res[key] ?? fallback;
    } catch (_) {
      return fallback;
    }
  }

  async function setStored(key, value) {
    try {
      await api.storage.local.set({ [key]: value });
    } catch (_) {
      /* ignore */
    }
  }

  const SCHEDULES_KEY = 'schedules';

  async function getAllSchedules() {
    try {
      const res = await api.storage.local.get(SCHEDULES_KEY);
      return res[SCHEDULES_KEY] || {};
    } catch (_) {
      return {};
    }
  }

  async function getSchedule(tabId) {
    const all = await getAllSchedules();
    return all[tabId] || null;
  }

  async function saveSchedule(tabId, schedule) {
    const all = await getAllSchedules();
    if (schedule) all[tabId] = schedule;
    else delete all[tabId];
    try {
      await api.storage.local.set({ [SCHEDULES_KEY]: all });
    } catch (_) {
      /* ignore */
    }
  }

  function alarmNames(tabId) {
    return { freeze: `gittercam:freeze:${tabId}`, resume: `gittercam:resume:${tabId}` };
  }

  // chrome.alarms clamps under ~1min; use setTimeout for short delays.
  const ALARM_MIN_MS = 60000;
  const tabTimers = new Map();

  function pushTimer(tabId, id) {
    const arr = tabTimers.get(tabId) || [];
    arr.push(id);
    tabTimers.set(tabId, arr);
  }

  function clearTimers(tabId) {
    const arr = tabTimers.get(tabId);
    if (arr) arr.forEach((id) => clearTimeout(id));
    tabTimers.delete(tabId);
  }

  async function clearSchedule(tabId) {
    const { freeze, resume } = alarmNames(tabId);
    try {
      await api.alarms.clear(freeze);
      await api.alarms.clear(resume);
    } catch (_) {
      /* ignore */
    }
    clearTimers(tabId);
    await saveSchedule(tabId, null);
  }

  async function runTransition(tabId, kind) {
    let tab = null;
    try {
      tab = await api.tabs.get(tabId);
    } catch (_) {
      tab = null;
    }
    if (kind === 'freeze') {
      if (tab) await applyMode(tab, MODE.FREEZE);
    } else {
      if (tab) await applyMode(tab, MODE.NORMAL);
      await clearSchedule(tabId);
    }
  }

  function armTransition(tabId, kind, when) {
    const delay = when - Date.now();
    const { freeze, resume } = alarmNames(tabId);
    const name = kind === 'freeze' ? freeze : resume;
    if (delay <= ALARM_MIN_MS) {
      const id = setTimeout(() => runTransition(tabId, kind), Math.max(0, delay));
      pushTimer(tabId, id);
    } else {
      try {
        api.alarms.create(name, { when });
      } catch (_) {
        /* ignore */
      }
    }
  }

  async function scheduleFreeze(tab, delayMs, durationMs) {
    const tabId = tab.id;
    const freezeAt = Date.now() + delayMs;
    const resumeAt = freezeAt + durationMs;

    await clearSchedule(tabId);
    armTransition(tabId, 'freeze', freezeAt);
    armTransition(tabId, 'resume', resumeAt);
    await saveSchedule(tabId, { freezeAt, resumeAt });
  }

  async function getActiveMeetTab() {
    try {
      const tabs = await api.tabs.query({ active: true, lastFocusedWindow: true });
      const tab = tabs && tabs[0];
      if (tab && isSupportedUrl(tab.url)) return tab;
    } catch (_) {
      /* ignore */
    }
    return null;
  }

  async function sendToTab(tabId, message) {
    try {
      await api.tabs.sendMessage(tabId, message);
    } catch (_) {
      /* ignore */
    }
  }

  function updateBadge(tabId, mode) {
    const text = MODE_BADGE[mode] || '';
    try {
      api.action.setBadgeText({ tabId, text });
      if (text) {
        api.action.setBadgeBackgroundColor({ tabId, color: '#5b8cff' });
      }
    } catch (_) {
      /* ignore */
    }
  }

  async function applyMode(tab, mode) {
    if (!tab) return;
    const state = getTabState(tab.id);
    state.mode = mode;
    updateBadge(tab.id, mode);
    await sendToTab(tab.id, { type: MSG.SET_MODE, mode });
  }

  api.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !message.type) return;

    if (message.type === MSG.STATE_UPDATE && sender.tab) {
      const state = getTabState(sender.tab.id);
      state.connected = !!message.connected;
      if (state.connected) {
        if (state.mode !== MODE.NORMAL) {
          sendToTab(sender.tab.id, { type: MSG.SET_MODE, mode: state.mode });
        }
        getFilter().then((filter) => {
          if (filter && filter !== DEFAULT_FILTER) {
            sendToTab(sender.tab.id, { type: MSG.SET_FILTER, filter });
          }
        });
        getStored(AUDIO_MODE_KEY, DEFAULT_AUDIO_MODE).then((audioMode) => {
          if (audioMode && audioMode !== DEFAULT_AUDIO_MODE) {
            sendToTab(sender.tab.id, { type: MSG.SET_AUDIO_MODE, audioMode });
          }
        });
        getStored(VOICE_PRESET_KEY, DEFAULT_VOICE_PRESET).then((voicePreset) => {
          sendToTab(sender.tab.id, { type: MSG.SET_VOICE_PRESET, voicePreset });
        });
      }
      updateBadge(sender.tab.id, state.mode);
      return;
    }

    if (message.type === MSG.MODE_CHANGED && sender.tab) {
      const state = getTabState(sender.tab.id);
      state.mode = message.mode;
      updateBadge(sender.tab.id, message.mode);
      return;
    }

    if (message.type === MSG.GET_STATE) {
      (async () => {
        const tab = await getActiveMeetTab();
        const loopSeconds = await getLoopSeconds();
        const filter = await getFilter();
        const audioMode = await getStored(AUDIO_MODE_KEY, DEFAULT_AUDIO_MODE);
        const voicePreset = await getStored(VOICE_PRESET_KEY, DEFAULT_VOICE_PRESET);
        if (!tab) {
          sendResponse({
            mode: MODE.NORMAL,
            loopSeconds,
            filter,
            audioMode,
            voicePreset,
            connected: false,
            schedule: null
          });
          return;
        }
        const state = getTabState(tab.id);
        const schedule = await getSchedule(tab.id);
        sendResponse({
          mode: state.mode,
          loopSeconds,
          filter,
          audioMode,
          voicePreset,
          connected: state.connected,
          schedule
        });
      })();
      return true;
    }

    if (message.type === MSG.SET_FILTER) {
      (async () => {
        await setFilterStored(message.filter);
        const tab = await getActiveMeetTab();
        if (tab) {
          await sendToTab(tab.id, { type: MSG.SET_FILTER, filter: message.filter });
        }
        sendResponse({ ok: true });
      })();
      return true;
    }

    if (message.type === MSG.SET_AUDIO_MODE) {
      (async () => {
        await setStored(AUDIO_MODE_KEY, message.audioMode);
        const tab = await getActiveMeetTab();
        if (tab) {
          await sendToTab(tab.id, { type: MSG.SET_AUDIO_MODE, audioMode: message.audioMode });
        }
        sendResponse({ ok: !!tab });
      })();
      return true;
    }

    if (message.type === MSG.SET_VOICE_PRESET) {
      (async () => {
        await setStored(VOICE_PRESET_KEY, message.voicePreset);
        const tab = await getActiveMeetTab();
        if (tab) {
          await sendToTab(tab.id, {
            type: MSG.SET_VOICE_PRESET,
            voicePreset: message.voicePreset
          });
        }
        sendResponse({ ok: !!tab });
      })();
      return true;
    }

    if (message.type === MSG.SET_MODE) {
      (async () => {
        const tab = await getActiveMeetTab();
        await applyMode(tab, message.mode);
        sendResponse({ ok: !!tab });
      })();
      return true;
    }

    if (message.type === MSG.SET_LOOP_SECONDS) {
      (async () => {
        await setLoopSecondsStored(message.loopSeconds);
        const tab = await getActiveMeetTab();
        if (tab) {
          await sendToTab(tab.id, {
            type: MSG.SET_LOOP_SECONDS,
            loopSeconds: message.loopSeconds
          });
        }
        sendResponse({ ok: true });
      })();
      return true;
    }

    if (message.type === MSG.SCHEDULE_FREEZE) {
      (async () => {
        const tab = await getActiveMeetTab();
        if (!tab) {
          sendResponse({ ok: false });
          return;
        }
        await scheduleFreeze(tab, message.delayMs, message.durationMs);
        sendResponse({ ok: true, schedule: await getSchedule(tab.id) });
      })();
      return true;
    }

    if (message.type === MSG.CANCEL_SCHEDULE) {
      (async () => {
        const tab = await getActiveMeetTab();
        if (tab) await clearSchedule(tab.id);
        sendResponse({ ok: true });
      })();
      return true;
    }

    if (message.type === MSG.PANIC) {
      (async () => {
        const tab = await getActiveMeetTab();
        await panic(tab);
        sendResponse({ ok: !!tab });
      })();
      return true;
    }
  });

  if (api.alarms && api.alarms.onAlarm) {
    api.alarms.onAlarm.addListener((alarm) => {
      const match = /^gittercam:(freeze|resume):(\d+)$/.exec(alarm.name);
      if (!match) return;
      runTransition(Number(match[2]), match[1]);
    });
  }

  async function panic(tab) {
    if (!tab) return;
    await clearSchedule(tab.id);
    await applyMode(tab, MODE.NORMAL);
    await setStored(AUDIO_MODE_KEY, DEFAULT_AUDIO_MODE);
    await sendToTab(tab.id, { type: MSG.SET_AUDIO_MODE, audioMode: DEFAULT_AUDIO_MODE });
  }

  if (api.commands && api.commands.onCommand) {
    api.commands.onCommand.addListener(async (command) => {
      const tab = await getActiveMeetTab();
      if (command === 'panic') {
        await panic(tab);
        return;
      }
      const mode = COMMAND_MODE[command];
      if (!mode) return;
      await applyMode(tab, mode);
    });
  }

  api.tabs.onRemoved.addListener((tabId) => {
    tabState.delete(tabId);
    clearSchedule(tabId);
  });
})();
