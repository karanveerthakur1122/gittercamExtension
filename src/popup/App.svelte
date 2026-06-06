<script>
  import { onMount, onDestroy } from 'svelte';
  import {
    MODE,
    MODE_LABELS,
    LOOP_SECONDS_OPTIONS,
    DEFAULT_LOOP_SECONDS,
    FILTER_OPTIONS,
    FILTER_LABELS,
    DEFAULT_FILTER,
    SCHEDULE_UNITS,
    DEFAULT_SCHEDULE_DELAY,
    DEFAULT_SCHEDULE_DURATION,
    AUDIO_MODE,
    AUDIO_MODE_LABELS,
    AUDIO_MODE_OPTIONS,
    DEFAULT_AUDIO_MODE,
    VOICE_PRESET_LABELS,
    VOICE_PRESET_OPTIONS,
    DEFAULT_VOICE_PRESET
  } from '../shared/constants.js';
  import { MSG } from '../shared/messages.js';

  const browserApi = globalThis.browser;
  const chromeApi = globalThis.chrome;

  const MODES = [
    { id: MODE.NORMAL, key: 'Alt+N', icon: '\u25B6' },
    { id: MODE.FREEZE, key: 'Alt+F', icon: '\u2744' },
    { id: MODE.LOOP, key: 'Alt+L', icon: '\u21BB' },
    { id: MODE.STUTTER, key: 'Alt+S', icon: '\u26A1' }
  ];

  let mode = $state(MODE.NORMAL);
  let loopSeconds = $state(DEFAULT_LOOP_SECONDS);
  let filter = $state(DEFAULT_FILTER);
  let audioMode = $state(DEFAULT_AUDIO_MODE);
  let voicePreset = $state(DEFAULT_VOICE_PRESET);
  let connected = $state(false);
  let loading = $state(true);

  let schedule = $state(null); // { freezeAt, resumeAt } | null
  let nowMs = $state(Date.now());
  let delayValue = $state(DEFAULT_SCHEDULE_DELAY);
  let delayUnit = $state('sec');
  let durationValue = $state(DEFAULT_SCHEDULE_DURATION);
  let durationUnit = $state('sec');
  let ticker = null;

  function unitMs(unitId) {
    const u = SCHEDULE_UNITS.find((x) => x.id === unitId);
    return u ? u.ms : 1000;
  }

  function send(message) {
    if (browserApi?.runtime?.sendMessage) {
      return browserApi.runtime.sendMessage(message).catch(() => undefined);
    }
    return new Promise((resolve) => {
      chromeApi.runtime.sendMessage(message, (resp) => {
        void chromeApi.runtime.lastError; // swallow "no receiving end"
        resolve(resp);
      });
    });
  }

  async function refresh() {
    const state = await send({ type: MSG.GET_STATE });
    if (state) {
      mode = state.mode ?? MODE.NORMAL;
      loopSeconds = state.loopSeconds ?? DEFAULT_LOOP_SECONDS;
      filter = state.filter ?? DEFAULT_FILTER;
      audioMode = state.audioMode ?? DEFAULT_AUDIO_MODE;
      voicePreset = state.voicePreset ?? DEFAULT_VOICE_PRESET;
      connected = !!state.connected;
      schedule = state.schedule ?? null;
    }
    loading = false;
  }

  async function setMode(next) {
    mode = next;
    await send({ type: MSG.SET_MODE, mode: next });
  }

  async function setLoopSeconds(secs) {
    loopSeconds = secs;
    await send({ type: MSG.SET_LOOP_SECONDS, loopSeconds: secs });
  }

  async function setFilter(f) {
    filter = f;
    await send({ type: MSG.SET_FILTER, filter: f });
  }

  async function setAudioMode(m) {
    audioMode = m;
    await send({ type: MSG.SET_AUDIO_MODE, audioMode: m });
  }

  async function setVoicePreset(p) {
    voicePreset = p;
    await send({ type: MSG.SET_VOICE_PRESET, voicePreset: p });
  }

  async function startSchedule() {
    const delayMs = Math.max(1, Number(delayValue) || 0) * unitMs(delayUnit);
    const durationMs = Math.max(1, Number(durationValue) || 0) * unitMs(durationUnit);
    const resp = await send({
      type: MSG.SCHEDULE_FREEZE,
      delayMs,
      durationMs
    });
    if (resp && resp.schedule) schedule = resp.schedule;
  }

  async function cancelSchedule() {
    await send({ type: MSG.CANCEL_SCHEDULE });
    schedule = null;
  }

  async function panic() {
    mode = MODE.NORMAL;
    audioMode = DEFAULT_AUDIO_MODE;
    schedule = null;
    await send({ type: MSG.PANIC });
  }

  const scheduleStatus = $derived.by(() => {
    if (!schedule) return null;
    if (nowMs < schedule.freezeAt) {
      return { label: 'Freezing in', remaining: schedule.freezeAt - nowMs };
    }
    if (nowMs < schedule.resumeAt) {
      return { label: 'Resuming in', remaining: schedule.resumeAt - nowMs };
    }
    return { label: 'Done', remaining: 0 };
  });

  function fmt(ms) {
    const total = Math.max(0, Math.round(ms / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  onMount(() => {
    refresh();
    ticker = setInterval(() => {
      nowMs = Date.now();
      if (schedule && nowMs >= schedule.resumeAt) {
        schedule = null;
        refresh();
      }
    }, 1000);
  });

  onDestroy(() => {
    if (ticker) clearInterval(ticker);
  });
</script>

<main>
  <header>
    <span class="logo">GitterCam</span>
    <span class="status" class:on={connected}>
      {connected ? 'Call connected' : 'No active call'}
    </span>
  </header>

  <div class="grid">
    {#each MODES as m (m.id)}
      <button
        class="mode"
        class:active={mode === m.id}
        onclick={() => setMode(m.id)}
        disabled={loading}
        title={`${MODE_LABELS[m.id]} (${m.key})`}
      >
        <span class="icon">{m.icon}</span>
        <span class="label">{MODE_LABELS[m.id]}</span>
        <span class="hotkey">{m.key}</span>
      </button>
    {/each}
  </div>

  <button class="panic" onclick={panic} title="Revert camera + mic to live (Alt+P)">
    Panic - go live
  </button>

  <div class="loop-row">
    <span class="loop-label">Loop length</span>
    <div class="loop-opts">
      {#each LOOP_SECONDS_OPTIONS as s (s)}
        <button
          class="chip"
          class:active={loopSeconds === s}
          onclick={() => setLoopSeconds(s)}
        >
          {s}s
        </button>
      {/each}
    </div>
  </div>

  <div class="section">
    <span class="section-label">Filter</span>
    <div class="filters">
      {#each FILTER_OPTIONS as f (f)}
        <button
          class="chip"
          class:active={filter === f}
          onclick={() => setFilter(f)}
        >
          {FILTER_LABELS[f]}
        </button>
      {/each}
    </div>
  </div>

  <div class="section">
    <span class="section-label">Schedule freeze</span>
    {#if scheduleStatus && scheduleStatus.remaining > 0}
      <div class="sched-active">
        <span class="sched-count">
          {scheduleStatus.label} <b>{fmt(scheduleStatus.remaining)}</b>
        </span>
        <button class="chip cancel" onclick={cancelSchedule}>Cancel</button>
      </div>
    {:else}
      <div class="sched-form">
        <label>
          In
          <input
            class="num"
            type="number"
            min="1"
            max="3600"
            bind:value={delayValue}
          />
          <select bind:value={delayUnit}>
            {#each SCHEDULE_UNITS as u (u.id)}
              <option value={u.id}>{u.label}</option>
            {/each}
          </select>
        </label>
        <label>
          for
          <input
            class="num"
            type="number"
            min="1"
            max="3600"
            bind:value={durationValue}
          />
          <select bind:value={durationUnit}>
            {#each SCHEDULE_UNITS as u (u.id)}
              <option value={u.id}>{u.label}</option>
            {/each}
          </select>
        </label>
      </div>
      <button class="chip go full" onclick={startSchedule} disabled={!connected}>
        Set schedule
      </button>
    {/if}
  </div>

  <div class="section">
    <span class="section-label">Audio</span>
    <div class="filters">
      {#each AUDIO_MODE_OPTIONS as a (a)}
        <button
          class="chip"
          class:active={audioMode === a}
          onclick={() => setAudioMode(a)}
        >
          {AUDIO_MODE_LABELS[a]}
        </button>
      {/each}
    </div>

    {#if audioMode === AUDIO_MODE.VOICE}
      <div class="voice-row">
        {#each VOICE_PRESET_OPTIONS as p (p)}
          <button
            class="chip"
            class:active={voicePreset === p}
            onclick={() => setVoicePreset(p)}
          >
            {VOICE_PRESET_LABELS[p]}
          </button>
        {/each}
      </div>
    {/if}
  </div>

  {#if !connected && !loading}
    <p class="hint">Open a Meet, Zoom, Teams, Slack, or Discord call to control your camera.</p>
  {/if}
</main>

<style>
  :global(body) {
    margin: 0;
  }

  main {
    width: 280px;
    padding: 14px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: #e7e9ee;
    background: #14151a;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }

  .logo {
    font-weight: 700;
    font-size: 15px;
    letter-spacing: 0.2px;
    background: linear-gradient(90deg, #5b8cff, #8a6bff);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }

  .status {
    font-size: 11px;
    color: #8a8f9c;
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  .status::before {
    content: '';
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #555a66;
  }

  .status.on {
    color: #54d18c;
  }

  .status.on::before {
    background: #54d18c;
  }

  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .mode {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    padding: 10px;
    border: 1px solid #262833;
    border-radius: 10px;
    background: #1b1d25;
    color: #e7e9ee;
    cursor: pointer;
    transition: border-color 0.12s, background 0.12s, transform 0.05s;
  }

  .mode:hover:not(:disabled) {
    border-color: #3a3f50;
  }

  .mode:active:not(:disabled) {
    transform: translateY(1px);
  }

  .mode:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .mode.active {
    border-color: #5b8cff;
    background: #20243a;
    box-shadow: 0 0 0 1px #5b8cff inset;
  }

  .icon {
    font-size: 16px;
  }

  .label {
    font-size: 13px;
    font-weight: 600;
  }

  .hotkey {
    font-size: 10px;
    color: #8a8f9c;
  }

  .loop-row {
    margin-top: 14px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .loop-label {
    font-size: 12px;
    color: #b7bcc9;
  }

  .loop-opts {
    display: flex;
    gap: 6px;
  }

  .chip {
    padding: 4px 10px;
    font-size: 12px;
    border-radius: 999px;
    border: 1px solid #262833;
    background: #1b1d25;
    color: #b7bcc9;
    cursor: pointer;
  }

  .chip.active {
    border-color: #5b8cff;
    color: #fff;
    background: #20243a;
  }

  .hint {
    margin: 12px 0 2px;
    font-size: 11px;
    color: #8a8f9c;
    text-align: center;
  }

  .section {
    margin-top: 14px;
  }

  .section-label {
    display: block;
    font-size: 12px;
    color: #b7bcc9;
    margin-bottom: 6px;
  }

  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .sched-form {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .sched-form label {
    font-size: 12px;
    color: #8a8f9c;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .sched-form select {
    background: #1b1d25;
    color: #e7e9ee;
    border: 1px solid #262833;
    border-radius: 6px;
    padding: 3px 6px;
    font-size: 12px;
  }

  .sched-form .num {
    width: 52px;
    background: #1b1d25;
    color: #e7e9ee;
    border: 1px solid #262833;
    border-radius: 6px;
    padding: 3px 6px;
    font-size: 12px;
  }

  .chip.go {
    margin-left: auto;
    border-color: #5b8cff;
    color: #fff;
    background: #20243a;
  }

  .chip.go.full {
    width: 100%;
    margin: 8px 0 0;
    text-align: center;
  }

  .chip.go:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .sched-active {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .sched-count {
    font-size: 12px;
    color: #e7e9ee;
  }

  .sched-count b {
    color: #5b8cff;
    font-variant-numeric: tabular-nums;
  }

  .chip.cancel {
    border-color: #5a2a33;
    color: #ff9aa6;
  }

  .voice-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid #20222c;
  }

  .panic {
    width: 100%;
    margin-top: 10px;
    padding: 9px;
    border-radius: 10px;
    border: 1px solid #5a2a33;
    background: #2a151a;
    color: #ff9aa6;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.12s, border-color 0.12s;
  }

  .panic:hover {
    background: #3a1a22;
    border-color: #7a3540;
  }
</style>
