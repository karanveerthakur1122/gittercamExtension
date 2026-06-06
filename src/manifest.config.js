const MATCHES = [
  '*://meet.google.com/*',
  '*://*.zoom.us/*',
  '*://teams.microsoft.com/*',
  '*://teams.live.com/*',
  '*://app.slack.com/*',
  '*://discord.com/*'
];

const BASE = {
  manifest_version: 3,
  name: 'GitterCam',
  version: '1.1.0',
  description:
    'Freeze, loop, filter, schedule, or fake a bad connection on your webcam during video calls.',
  icons: {
    16: 'icons/icon16.png',
    48: 'icons/icon48.png',
    128: 'icons/icon128.png'
  },
  action: {
    default_title: 'GitterCam',
    default_popup: 'popup.html',
    default_icon: {
      16: 'icons/icon16.png',
      48: 'icons/icon48.png',
      128: 'icons/icon128.png'
    }
  },
  permissions: ['storage', 'activeTab', 'scripting', 'alarms'],
  host_permissions: [...MATCHES],
  content_scripts: [
    {
      matches: [...MATCHES],
      js: ['content.js'],
      run_at: 'document_start',
      all_frames: true
    }
  ],
  web_accessible_resources: [
    {
      resources: ['pipeline.js', 'audio-pipeline.js', 'inject.js', 'audio/*'],
      matches: [...MATCHES]
    }
  ],
  commands: {
    'toggle-freeze': {
      suggested_key: { default: 'Alt+F' },
      description: 'Freeze the webcam on the current frame'
    },
    'toggle-loop': {
      suggested_key: { default: 'Alt+L' },
      description: 'Loop a short recording of yourself'
    },
    'toggle-stutter': {
      suggested_key: { default: 'Alt+S' },
      description: 'Fake a bad connection (stutter)'
    },
    'toggle-normal': {
      description: 'Return to the live camera feed'
    },
    panic: {
      suggested_key: { default: 'Alt+P' },
      description: 'Panic: instantly revert camera and mic to live'
    }
  }
};

export function buildManifest(target) {
  const manifest = structuredClone(BASE);

  if (target === 'firefox') {
    manifest.background = { scripts: ['service-worker.js'] };
    manifest.browser_specific_settings = {
      gecko: {
        id: 'gittercam@gittercam.app',
        strict_min_version: '121.0'
      }
    };
  } else {
    manifest.background = {
      service_worker: 'service-worker.js',
      type: 'module'
    };
    manifest.minimum_chrome_version = '102';
  }

  return manifest;
}
