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

// Permission Manager (14 Core Permissions with honest status & missing-impact disclosure)
export class PermissionManager {
  static getDefaultCatalog(): PermissionRecord[] {
    return [
      {
        id: 'microphone',
        name: 'Microphone',
        purpose: 'Capture live voice commands, audio waveforms, and wake-word detection.',
        missingImpact: 'Voice listening, live audio waves, and wake-word activation will not work.',
        instructions: 'Click Allow to grant browser microphone permission, or enable Microphone in Android App Settings.',
        status: 'NOT_ALLOWED',
        scope: 'browser_and_android',
        canRequestInBrowser: true,
        requiredOnFirstLaunch: true,
      },
      {
        id: 'camera',
        name: 'Camera',
        purpose: 'Enable Camera Vision for object identification, OCR text reading, and scene Q&A.',
        missingImpact: 'Live camera scan and visual Q&A will be unavailable (manual image upload still works).',
        instructions: 'Click Allow when activating Camera Vision or grant Camera permission in Android Settings.',
        status: 'NOT_ALLOWED',
        scope: 'browser_and_android',
        canRequestInBrowser: true,
        requiredOnFirstLaunch: false,
      },
      {
        id: 'speech_recognition',
        name: 'Speech Recognition',
        purpose: 'Transcribe English, Hindi, and Hinglish speech into commands.',
        missingImpact: 'Spoken voice commands cannot be converted into text.',
        instructions: 'Uses microphone capture paired with server-side or on-device speech recognition.',
        status: 'NOT_ALLOWED',
        scope: 'browser_and_android',
        canRequestInBrowser: true,
        requiredOnFirstLaunch: true,
      },
      {
        id: 'notifications',
        name: 'Notifications',
        purpose: 'Show foreground voice-session alerts, task completion alerts, and routine updates.',
        missingImpact: 'Background task completion and foreground service banners cannot display.',
        instructions: 'Click Allow to enable Web Notifications or grant POST_NOTIFICATIONS on Android 13+.',
        status: 'NOT_ALLOWED',
        scope: 'browser_and_android',
        canRequestInBrowser: true,
        requiredOnFirstLaunch: false,
      },
      {
        id: 'location',
        name: 'Location',
        purpose: 'Provide weather, navigation, and GPS answers when explicitly asked.',
        missingImpact: 'GPS coordinates and location-specific answers will be unavailable.',
        instructions: 'Click Allow to prompt for browser Geolocation access.',
        status: 'NOT_ALLOWED',
        scope: 'browser_and_android',
        canRequestInBrowser: true,
        requiredOnFirstLaunch: false,
      },
      {
        id: 'accessibility_service',
        name: 'Accessibility Service',
        purpose: 'Inspect visible Android UI nodes, lock the screen on request, and execute permitted taps, scrolls, and in-app navigation.',
        missingImpact: 'Cross-app UI tapping, text entry, ad skipping, screen locking, and screen-node reading will not work.',
        instructions: 'Android Native Only: Open Android Settings > Accessibility > JARVIS Accessibility Service.',
        status: 'NOT_AVAILABLE',
        scope: 'android_native',
        canRequestInBrowser: false,
        requiredOnFirstLaunch: false,
      },
      {
        id: 'notification_access',
        name: 'Notification Access',
        purpose: 'Read incoming notifications aloud and summarize missed messages with consent.',
        missingImpact: 'Incoming third-party app notifications cannot be read automatically.',
        instructions: 'Android Native Only: Enable JARVIS in Special App Access > Notification Access.',
        status: 'NOT_AVAILABLE',
        scope: 'android_native',
        canRequestInBrowser: false,
        requiredOnFirstLaunch: false,
      },
      {
        id: 'contacts',
        name: 'Contacts',
        purpose: 'Look up saved contacts before user-confirmed calls or messages.',
        missingImpact: 'Contact name lookup will rely only on contacts you explicitly add.',
        instructions: 'Granted via Contact Picker API on supported browsers or READ_CONTACTS on Android.',
        status: 'NOT_AVAILABLE',
        scope: 'browser_and_android',
        canRequestInBrowser: false,
        requiredOnFirstLaunch: false,
      },
      {
        id: 'phone',
        name: 'Phone',
        purpose: 'Initiate user-confirmed voice calls on Android devices.',
        missingImpact: 'Direct phone calling cannot be launched automatically.',
        instructions: 'Android Native Only: Grant CALL_PHONE runtime permission.',
        status: 'NOT_AVAILABLE',
        scope: 'android_native',
        canRequestInBrowser: false,
        requiredOnFirstLaunch: false,
      },
      {
        id: 'call_log',
        name: 'Call Log',
        purpose: 'Summarize recent incoming, outgoing, and missed calls for Phone Intelligence when authorized.',
        missingImpact: 'Missed call summaries and call history reports will remain unavailable.',
        instructions: 'Android Native Only: Grant READ_CALL_LOG permission in Android App Settings.',
        status: 'NOT_AVAILABLE',
        scope: 'android_native',
        canRequestInBrowser: false,
        requiredOnFirstLaunch: false,
      },
      {
        id: 'sms',
        name: 'SMS',
        purpose: 'Draft and send user-confirmed text messages on Android.',
        missingImpact: 'Direct SMS dispatch is disabled.',
        instructions: 'Android Native Only: Grant SEND_SMS / READ_SMS runtime permission.',
        status: 'NOT_AVAILABLE',
        scope: 'android_native',
        canRequestInBrowser: false,
        requiredOnFirstLaunch: false,
      },
      {
        id: 'display_over_apps',
        name: 'Display Over Other Apps',
        purpose: 'Render the floating JARVIS overlay while controlling other Android apps.',
        missingImpact: 'Floating overlay orb over third-party apps will be unavailable.',
        instructions: 'Android Native Only: Settings > Special App Access > Display over other apps.',
        status: 'NOT_AVAILABLE',
        scope: 'android_native',
        canRequestInBrowser: false,
        requiredOnFirstLaunch: false,
      },
      {
        id: 'background_operation',
        name: 'Background Operation',
        purpose: 'Run ForegroundService with visible microphone indicator for wake-word detection.',
        missingImpact: 'Wake-word detection pauses when the app moves to the background.',
        instructions: 'Android Native Only: Controlled via ForegroundService toggle in Background Settings.',
        status: 'NOT_AVAILABLE',
        scope: 'android_native',
        canRequestInBrowser: false,
        requiredOnFirstLaunch: false,
      },
      {
        id: 'battery_optimization',
        name: 'Battery Optimization Settings',
        purpose: 'Prevent OS suspension during long multi-step or background voice sessions.',
        missingImpact: 'Android Doze mode may stop background wake-word listening after inactivity.',
        instructions: 'Android Native Only: Request Ignore Battery Optimizations in System Settings.',
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
