export const MODE = {
  NORMAL: 'normal',
  FREEZE: 'freeze',
  LOOP: 'loop',
  STUTTER: 'stutter'
};

export const MODE_LABELS = {
  [MODE.NORMAL]: 'Live',
  [MODE.FREEZE]: 'Freeze',
  [MODE.LOOP]: 'Loop',
  [MODE.STUTTER]: 'Bad Connection'
};

export const MODE_BADGE = {
  [MODE.NORMAL]: '',
  [MODE.FREEZE]: 'F',
  [MODE.LOOP]: 'L',
  [MODE.STUTTER]: 'S'
};

export const COMMAND = {
  TOGGLE_FREEZE: 'toggle-freeze',
  TOGGLE_LOOP: 'toggle-loop',
  TOGGLE_STUTTER: 'toggle-stutter',
  TOGGLE_NORMAL: 'toggle-normal'
};

export const COMMAND_MODE = {
  [COMMAND.TOGGLE_FREEZE]: MODE.FREEZE,
  [COMMAND.TOGGLE_LOOP]: MODE.LOOP,
  [COMMAND.TOGGLE_STUTTER]: MODE.STUTTER,
  [COMMAND.TOGGLE_NORMAL]: MODE.NORMAL
};

export const DEFAULT_LOOP_SECONDS = 5;
export const LOOP_SECONDS_OPTIONS = [3, 5, 10];

export const FILTER = {
  NONE: 'none',
  GRAYSCALE: 'grayscale(100%)',
  SEPIA: 'sepia(80%)',
  WARM: 'saturate(1.3) hue-rotate(-10deg)',
  COOL: 'saturate(0.9) hue-rotate(15deg) brightness(1.05)',
  VIVID: 'contrast(1.4) saturate(1.2)'
};

export const FILTER_LABELS = {
  [FILTER.NONE]: 'None',
  [FILTER.GRAYSCALE]: 'B&W',
  [FILTER.SEPIA]: 'Sepia',
  [FILTER.WARM]: 'Warm',
  [FILTER.COOL]: 'Cool',
  [FILTER.VIVID]: 'Vivid'
};

export const FILTER_OPTIONS = [
  FILTER.NONE,
  FILTER.GRAYSCALE,
  FILTER.SEPIA,
  FILTER.WARM,
  FILTER.COOL,
  FILTER.VIVID
];

export const DEFAULT_FILTER = FILTER.NONE;

export const SCHEDULE_UNITS = [
  { id: 'sec', label: 'sec', ms: 1000 },
  { id: 'min', label: 'min', ms: 60000 }
];
export const DEFAULT_SCHEDULE_DELAY = 30;
export const DEFAULT_SCHEDULE_DURATION = 60;

export const AUDIO_MODE = {
  NORMAL: 'normal',
  MUTED_AMBIENT: 'muted-ambient',
  VOICE: 'voice-changed',
  TYPING: 'typing'
};

export const AUDIO_MODE_LABELS = {
  [AUDIO_MODE.NORMAL]: 'Normal',
  [AUDIO_MODE.MUTED_AMBIENT]: 'Mute + Ambient',
  [AUDIO_MODE.VOICE]: 'Voice',
  [AUDIO_MODE.TYPING]: 'Typing'
};

export const AUDIO_MODE_OPTIONS = [
  AUDIO_MODE.NORMAL,
  AUDIO_MODE.MUTED_AMBIENT,
  AUDIO_MODE.VOICE,
  AUDIO_MODE.TYPING
];

export const DEFAULT_AUDIO_MODE = AUDIO_MODE.NORMAL;

export const VOICE_PRESET = {
  NONE: 'none',
  DEEP: 'deep',
  HIGH: 'high',
  ROBOT: 'robot',
  ECHO: 'echo',
  WHISPER: 'whisper',
  CHIPMUNK: 'chipmunk'
};

export const VOICE_PRESET_LABELS = {
  [VOICE_PRESET.DEEP]: 'Deep',
  [VOICE_PRESET.HIGH]: 'High',
  [VOICE_PRESET.ROBOT]: 'Robot',
  [VOICE_PRESET.ECHO]: 'Echo',
  [VOICE_PRESET.WHISPER]: 'Whisper',
  [VOICE_PRESET.CHIPMUNK]: 'Chipmunk'
};

export const VOICE_PRESET_OPTIONS = [
  VOICE_PRESET.DEEP,
  VOICE_PRESET.HIGH,
  VOICE_PRESET.ROBOT,
  VOICE_PRESET.ECHO,
  VOICE_PRESET.WHISPER,
  VOICE_PRESET.CHIPMUNK
];

export const DEFAULT_VOICE_PRESET = VOICE_PRESET.DEEP;

export const STORAGE_KEYS = {
  LOOP_SECONDS: 'loopSeconds',
  FILTER: 'filter',
  AUDIO_MODE: 'audioMode',
  VOICE_PRESET: 'voicePreset'
};
