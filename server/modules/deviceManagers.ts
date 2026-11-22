import type {
  CalendarEventItem,
  CallLogEntry,
  ParsedCommand,
  PermissionRecord,
  PermissionStatus,
  PhoneContact,
  PhoneIntelligenceSummary,
  PhoneNotification,
} from '../../src/types/jarvis.ts';
import { accessibilityController } from './accessibilityController.ts';
import { androidAutomationEngine } from './androidAutomationEngine.ts';
import { loggingDiagnostics } from './loggingDiagnostics.ts';
import { storageStore } from './storageStore.ts';

// Permission Manager (18 Core Permissions with real browser grant + Android native integration)
export class PermissionManager {
  static getDefaultCatalog(): PermissionRecord[] {
    return [
      {
        id: 'microphone',
        name: 'Microphone',
        purpose: 'Capture live voice commands, audio waveforms, and continuous Siri Orb listening.',
        missingImpact: 'Voice listening, live audio waves, and wake-word activation will not work.',
        instructions: 'Tap Allow to grant live Microphone permission right now.',
        status: 'NOT_ALLOWED',
        scope: 'browser_and_android',
        canRequestInBrowser: true,
        requiredOnFirstLaunch: true,
      },
      {
        id: 'speech_recognition',
        name: 'Speech Recognition',
        purpose: 'Transcribe English, Hindi, and Hinglish speech into commands instantaneously.',
        missingImpact: 'Spoken voice commands cannot be converted into text.',
        instructions: 'Uses real-time microphone stream + SpeechRecognition / Gemini / Groq STT.',
        status: 'NOT_ALLOWED',
        scope: 'browser_and_android',
        canRequestInBrowser: true,
        requiredOnFirstLaunch: true,
      },
      {
        id: 'location',
        name: 'Location (Live Weather & GPS)',
        purpose: 'Fetch accurate Live Weather on Home screen and answer GPS/location queries.',
        missingImpact: 'Live city weather and exact GPS coordinates will fall back to approximate area.',
        instructions: 'Tap Allow to grant Geolocation access.',
        status: 'NOT_ALLOWED',
        scope: 'browser_and_android',
        canRequestInBrowser: true,
        requiredOnFirstLaunch: false,
      },
      {
        id: 'camera',
        name: 'Camera',
        purpose: 'Enable Camera Vision for object identification, OCR text reading, and visual Q&A.',
        missingImpact: 'Live camera scan will be unavailable (manual image upload still works).',
        instructions: 'Tap Allow to enable real Camera access.',
        status: 'NOT_ALLOWED',
        scope: 'browser_and_android',
        canRequestInBrowser: true,
        requiredOnFirstLaunch: false,
      },
      {
        id: 'notifications',
        name: 'Notifications',
        purpose: 'Show 24/7 foreground service status, alerts, and routine updates.',
        missingImpact: 'Background alerts and foreground notifications cannot display.',
        instructions: 'Tap Allow to enable Notifications.',
        status: 'NOT_ALLOWED',
        scope: 'browser_and_android',
        canRequestInBrowser: true,
        requiredOnFirstLaunch: false,
      },
      {
        id: 'wake_lock',
        name: 'Screen Wake Lock (24/7 Keep Awake)',
        purpose: 'Keep JARVIS active without sleeping during 24/7 wake-word listening and voice sessions.',
        missingImpact: 'Screen or background tab may sleep and pause live wake-word detection.',
        instructions: 'Tap Allow to engage Screen Wake Lock API.',
        status: 'NOT_ALLOWED',
        scope: 'browser_and_android',
        canRequestInBrowser: true,
        requiredOnFirstLaunch: false,
      },
      {
        id: 'clipboard',
        name: 'Clipboard Read & Write',
        purpose: 'Allow JARVIS to read copied text or copy AI replies/summaries quickly.',
        missingImpact: 'Voice copy-paste automation between apps is restricted.',
        instructions: 'Tap Allow to grant Clipboard access.',
        status: 'NOT_ALLOWED',
        scope: 'browser_and_android',
        canRequestInBrowser: true,
        requiredOnFirstLaunch: false,
      },
      {
        id: 'sensors',
        name: 'Device Motion & Sensors',
        purpose: 'Detect tilt, shake-to-wake, and physical gestures for hands-free control.',
        missingImpact: 'Motion/shake triggers remain disabled.',
        instructions: 'Tap Allow to enable DeviceMotion sensor access.',
        status: 'NOT_ALLOWED',
        scope: 'browser_and_android',
        canRequestInBrowser: true,
        requiredOnFirstLaunch: false,
      },
      {
        id: 'display_over_apps',
        name: 'Display Over Other Apps (Floating Logo)',
        purpose: 'Show the circular JARVIS overlay logo across apps: Double-Tap = Active, Single-Tap = Off, auto-shows on back/minimize.',
        missingImpact: 'Floating circular JARVIS quick-control orb will stay off.',
        instructions: 'Enable Display Over Other Apps toggle or Android SYSTEM_ALERT_WINDOW.',
        status: 'NOT_ALLOWED',
        scope: 'browser_and_android',
        canRequestInBrowser: true,
        requiredOnFirstLaunch: false,
      },
      {
        id: 'accessibility_service',
        name: 'Accessibility Service (Full Screen Touch)',
        purpose: 'Inspect visible Android UI nodes, perform global screen taps, swipes, scrolls, back, home, and lock screen.',
        missingImpact: 'Cross-app screen touch control, button clicking, and ad skipping require Accessibility Service.',
        instructions: 'Android Native: Settings > Accessibility > JARVIS Accessibility Service.',
        status: 'NOT_AVAILABLE',
        scope: 'android_native',
        canRequestInBrowser: false,
        requiredOnFirstLaunch: false,
      },
      {
        id: 'background_operation',
        name: '24/7 Background Operation',
        purpose: 'Run WakeWordForegroundService 24/7 with persistent microphone detection even when minimized.',
        missingImpact: 'Wake-word detection stops when JARVIS is sent to background on Android.',
        instructions: 'Android Native: Controlled via WakeWordForegroundService & Voice command.',
        status: 'NOT_AVAILABLE',
        scope: 'android_native',
        canRequestInBrowser: false,
        requiredOnFirstLaunch: false,
      },
      {
        id: 'battery_optimization',
        name: 'Battery Optimization Exemption',
        purpose: 'Prevent Android Doze mode from killing 24/7 background JARVIS service.',
        missingImpact: 'OS battery saver may kill background wake-word service after inactivity.',
        instructions: 'Android Native: Request Unrestricted Battery / Ignore Battery Optimizations.',
        status: 'NOT_AVAILABLE',
        scope: 'android_native',
        canRequestInBrowser: false,
        requiredOnFirstLaunch: false,
      },
      {
        id: 'notification_access',
        name: 'Notification Listener Access',
        purpose: 'Read incoming WhatsApp, Messages, and app notifications aloud on command.',
        missingImpact: 'Third-party notifications cannot be read aloud automatically.',
        instructions: 'Android Native: Special App Access > Notification Access.',
        status: 'NOT_AVAILABLE',
        scope: 'android_native',
        canRequestInBrowser: false,
        requiredOnFirstLaunch: false,
      },
      {
        id: 'contacts',
        name: 'Contacts Access',
        purpose: 'Look up saved contacts before voice-confirmed calls or messages.',
        missingImpact: 'Contact name lookup relies only on saved assistant contacts.',
        instructions: 'Android READ_CONTACTS or browser Contact Picker.',
        status: 'NOT_ALLOWED',
        scope: 'browser_and_android',
        canRequestInBrowser: true,
        requiredOnFirstLaunch: false,
      },
      {
        id: 'phone',
        name: 'Phone & Direct Calling',
        purpose: 'Initiate user-confirmed voice calls on Android devices.',
        missingImpact: 'Direct phone calling cannot launch automatically.',
        instructions: 'Android Native: Grant CALL_PHONE runtime permission.',
        status: 'NOT_AVAILABLE',
        scope: 'android_native',
        canRequestInBrowser: false,
        requiredOnFirstLaunch: false,
      },
      {
        id: 'call_log',
        name: 'Call Log Access',
        purpose: 'Summarize missed, incoming, and outgoing calls when asked.',
        missingImpact: 'Missed call summaries remain unavailable.',
        instructions: 'Android Native: Grant READ_CALL_LOG permission.',
        status: 'NOT_AVAILABLE',
        scope: 'android_native',
        canRequestInBrowser: false,
        requiredOnFirstLaunch: false,
      },
      {
        id: 'sms',
        name: 'SMS Read & Send',
        purpose: 'Draft and send user-confirmed SMS messages by voice.',
        missingImpact: 'Direct SMS sending is disabled.',
        instructions: 'Android Native: Grant SEND_SMS / READ_SMS permission.',
        status: 'NOT_AVAILABLE',
        scope: 'android_native',
        canRequestInBrowser: false,
        requiredOnFirstLaunch: false,
      },
      {
        id: 'calendar_storage',
        name: 'Media, Files & Calendar',
        purpose: 'Read reminders/events and analyze screenshots or documents via Vision.',
        missingImpact: 'Automatic calendar event sync and media scanning are disabled.',
        instructions: 'Android Native: Grant READ_CALENDAR and READ_MEDIA_IMAGES.',
        status: 'NOT_AVAILABLE',
        scope: 'android_native',
        canRequestInBrowser: false,
        requiredOnFirstLaunch: false,
      },
    ];
  }
}

export class NotificationManager {
  static list(): PhoneNotification[] {
    return [...storageStore.getState().notifications];
  }

  static summarize(): string {
    const items = storageStore.getState().notifications;
    const unread = items.filter((n) => !n.isRead);
    if (unread.length === 0) return 'You have no unread notifications.';
    return unread.map((n) => `${n.appName} from ${n.sender}: "${n.body}"`).join(' | ');
  }

  static markRead(id: string): void {
    storageStore.update((draft) => {
      const target = draft.notifications.find((n) => n.id === id);
      if (target) target.isRead = true;
    });
  }
}

export class CallLogManager {
  static list(): CallLogEntry[] {
    return [...(storageStore.getState().callLogs || [])];
  }
}

export class CalendarManager {
  static list(): CalendarEventItem[] {
    return [...(storageStore.getState().calendarEvents || [])];
  }
}

export class PhoneIntelligenceManager {
  static summarize(options?: {
    notificationsAuthorized?: boolean;
    callLogAuthorized?: boolean;
  }): PhoneIntelligenceSummary {
    const notificationsAuthorized = options?.notificationsAuthorized ?? true;
    const callLogAuthorized = options?.callLogAuthorized ?? true;

    const unreadNotifications = notificationsAuthorized
      ? storageStore.getState().notifications.filter((n) => !n.isRead)
      : [];
    const recentCalls = callLogAuthorized ? CallLogManager.list() : [];
    const missedCallsCount = recentCalls.filter((c) => c.callType === 'missed').length;
    const upcomingEvents = CalendarManager.list();
    const scr = accessibilityController.getScreenState();

    const parts: string[] = [];
    if (notificationsAuthorized) {
      parts.push(
        unreadNotifications.length > 0
          ? `Unread notifications (${unreadNotifications.length}): ${unreadNotifications.map((n) => `${n.appName} from ${n.sender} ("${n.body}")`).join('; ')}.`
          : 'No unread notifications.'
      );
    } else {
      parts.push('Notifications: Notification Access permission not granted.');
    }

    if (callLogAuthorized) {
      parts.push(
        recentCalls.length > 0
          ? `Call activity (${missedCallsCount} missed): ${recentCalls.map((c) => `${c.callType} call with ${c.contactName}`).join('; ')}.`
          : 'No recent calls recorded.'
      );
    } else {
      parts.push('Calls: Call Log permission not granted.');
    }

    if (upcomingEvents.length > 0) {
      parts.push(
        `Upcoming events/reminders: ${upcomingEvents.map((e) => `${e.title}${e.location ? ` at ${e.location}` : ''}`).join('; ')}.`
      );
    }
    parts.push(`Device status: Battery ${scr.batteryPercent}%, Network ${scr.networkStatus}.`);

    return {
      generatedAt: new Date().toISOString(),
      notificationsAuthorized,
      callLogAuthorized,
      unreadNotifications,
      recentCalls,
      missedCallsCount,
      upcomingEvents,
      batteryPercent: scr.batteryPercent,
      networkStatus: scr.networkStatus,
      summaryText: parts.join(' '),
    };
  }
}

export class ContactManager {
  static search(query?: string): PhoneContact[] {
    const all = storageStore.getState().contacts;
    if (!query || !query.trim()) return [...all];
    const q = query.trim().toLowerCase();
    return all.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        (c.relation && c.relation.toLowerCase().includes(q))
    );
  }
}

export class GpsManager {
  static formatCoordinates(lat: number, lng: number, accuracy?: number): string {
    return `Latitude ${lat.toFixed(5)}, Longitude ${lng.toFixed(5)}${accuracy ? ` (±${Math.round(accuracy)}m)` : ''}`;
  }
}

export class FileManager {
  static describeUploadedFile(name: string, sizeBytes: number, mimeType: string): string {
    const kb = (sizeBytes / 1024).toFixed(1);
    return `File "${name}" (${mimeType || 'application/octet-stream'}, ${kb} KB)`;
  }
}

export class BackgroundTaskManager {
  private activeTasks = new Map<string, { label: string; startedAt: string; controller: AbortController }>();

  register(id: string, label: string): AbortController {
    const controller = new AbortController();
    this.activeTasks.set(id, { label, startedAt: new Date().toISOString(), controller });
    return controller;
  }

  cancel(id: string): boolean {
    const task = this.activeTasks.get(id);
    if (!task) return false;
    task.controller.abort();
    this.activeTasks.delete(id);
    return true;
  }

  complete(id: string): void {
    this.activeTasks.delete(id);
  }
}
export const backgroundTaskManager = new BackgroundTaskManager();

export class SecurityManager {
  static validatePermissionBeforeExecution(status: PermissionStatus, permissionName: string): void {
    if (status !== 'ALLOWED') {
      throw new Error(`Permission "${permissionName}" is currently ${status}. Grant access before continuing.`);
    }
  }
}

export class TaskExecutionEngine {
  static async runCommandPlan(command: ParsedCommand, confirmed = false) {
    loggingDiagnostics.record('TaskExecutionEngine', 'INFO', `Dispatching command plan: ${command.category}`);
    return androidAutomationEngine.executePlan(command, confirmed);
  }
}
