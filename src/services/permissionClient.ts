import type { PermissionRecord, PermissionStatus } from '../types/jarvis';

const OVERLAY_GRANT_KEY = 'jarvis_display_over_apps_granted';
const WAKE_LOCK_PREF_KEY = 'jarvis_wake_lock_granted';
const SENSORS_GRANT_KEY = 'jarvis_sensors_granted';
const CONTACTS_GRANT_KEY = 'jarvis_contacts_granted';

interface AndroidNativeBridge {
  hasOverlayPermission?: () => boolean;
  requestOverlayPermission?: () => boolean;
  hasPermission?: (id: string) => boolean;
  requestPermission?: (id: string) => boolean;
}

function getAndroidBridge(): AndroidNativeBridge | null {
  return (window as unknown as { JarvisAndroid?: AndroidNativeBridge }).JarvisAndroid || null;
}

let activeWakeLock: { release: () => Promise<void>; released?: boolean } | null = null;

export async function acquireScreenWakeLock(): Promise<boolean> {
  try {
    const nav = navigator as unknown as {
      wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void>; released?: boolean }> };
    };
    if (!nav.wakeLock) return false;
    if (activeWakeLock && !activeWakeLock.released) return true;
    activeWakeLock = await nav.wakeLock.request('screen');
    localStorage.setItem(WAKE_LOCK_PREF_KEY, '1');
    return true;
  } catch {
    return false;
  }
}

export async function releaseScreenWakeLock(): Promise<void> {
  try {
    if (activeWakeLock) {
      await activeWakeLock.release();
      activeWakeLock = null;
    }
  } catch {
    activeWakeLock = null;
  }
}

export function isOverlayGranted(): boolean {
  const bridge = getAndroidBridge();
  if (bridge?.hasOverlayPermission) {
    try {
      return Boolean(bridge.hasOverlayPermission());
    } catch {
      return false;
    }
  }
  try {
    return localStorage.getItem(OVERLAY_GRANT_KEY) === '1';
  } catch {
    return false;
  }
}

export function setOverlayGranted(val: boolean): void {
  try {
    localStorage.setItem(OVERLAY_GRANT_KEY, val ? '1' : '0');
  } catch {
    // ignore
  }
}

export async function resolveBrowserPermissionStatuses(
  catalog: PermissionRecord[]
): Promise<PermissionRecord[]> {
  const bridge = getAndroidBridge();

  const results = await Promise.all(
    catalog.map(async (item) => {
      if (item.id === 'display_over_apps') {
        if (bridge?.hasOverlayPermission) {
          const ok = Boolean(bridge.hasOverlayPermission());
          return { ...item, status: (ok ? 'ALLOWED' : 'NOT_ALLOWED') as PermissionStatus };
        }
        return {
          ...item,
          status: (isOverlayGranted() ? 'ALLOWED' : 'NOT_ALLOWED') as PermissionStatus,
        };
      }

      if (item.id === 'wake_lock') {
        const supported = 'wakeLock' in navigator;
        if (!supported) return { ...item, status: 'NOT_AVAILABLE' as PermissionStatus };
        const granted =
          Boolean(activeWakeLock && !activeWakeLock.released) ||
          localStorage.getItem(WAKE_LOCK_PREF_KEY) === '1';
        return { ...item, status: (granted ? 'ALLOWED' : 'NOT_ALLOWED') as PermissionStatus };
      }

      if (item.id === 'sensors') {
        if (!('DeviceMotionEvent' in window)) {
          return { ...item, status: 'NOT_AVAILABLE' as PermissionStatus };
        }
        const dm = DeviceMotionEvent as unknown as {
          requestPermission?: () => Promise<'granted' | 'denied'>;
        };
        if (typeof dm?.requestPermission === 'function') {
          const saved = localStorage.getItem(SENSORS_GRANT_KEY);
          const status: PermissionStatus =
            saved === '1' ? 'ALLOWED' : saved === 'denied' ? 'RESTRICTED' : 'NOT_ALLOWED';
          return { ...item, status };
        }
        return {
          ...item,
          status: (localStorage.getItem(SENSORS_GRANT_KEY) === '1'
            ? 'ALLOWED'
            : 'NOT_ALLOWED') as PermissionStatus,
        };
      }

      if (item.scope === 'android_native') {
        if (bridge?.hasPermission) {
          try {
            const ok = bridge.hasPermission(item.id);
            return { ...item, status: (ok ? 'ALLOWED' : 'NOT_ALLOWED') as PermissionStatus };
          } catch {
            return { ...item, status: 'NOT_ALLOWED' as PermissionStatus };
          }
        }
        return { ...item, status: 'NOT_ALLOWED' as PermissionStatus };
      }

      try {
        if (item.id === 'microphone' || item.id === 'speech_recognition') {
          if (!navigator.mediaDevices?.getUserMedia) {
            return { ...item, status: 'NOT_AVAILABLE' as PermissionStatus };
          }
          if (navigator.permissions?.query) {
            const q = await navigator.permissions.query({ name: 'microphone' as PermissionName });
            const mapped: PermissionStatus =
              q.state === 'granted' ? 'ALLOWED' : q.state === 'denied' ? 'RESTRICTED' : 'NOT_ALLOWED';
            return { ...item, status: mapped };
          }
          return { ...item, status: 'NOT_ALLOWED' as PermissionStatus };
        }

        if (item.id === 'camera') {
          if (!navigator.mediaDevices?.getUserMedia) {
            return { ...item, status: 'NOT_AVAILABLE' as PermissionStatus };
          }
          if (navigator.permissions?.query) {
            const q = await navigator.permissions.query({ name: 'camera' as PermissionName });
            const mapped: PermissionStatus =
              q.state === 'granted' ? 'ALLOWED' : q.state === 'denied' ? 'RESTRICTED' : 'NOT_ALLOWED';
            return { ...item, status: mapped };
          }
          return { ...item, status: 'NOT_ALLOWED' as PermissionStatus };
        }

        if (item.id === 'location') {
          if (!('geolocation' in navigator)) {
            return { ...item, status: 'NOT_AVAILABLE' as PermissionStatus };
          }
          if (navigator.permissions?.query) {
            const q = await navigator.permissions.query({ name: 'geolocation' });
            const mapped: PermissionStatus =
              q.state === 'granted' ? 'ALLOWED' : q.state === 'denied' ? 'RESTRICTED' : 'NOT_ALLOWED';
            return { ...item, status: mapped };
          }
          return { ...item, status: 'NOT_ALLOWED' as PermissionStatus };
        }

        if (item.id === 'notifications') {
          if (!('Notification' in window)) {
            return { ...item, status: 'NOT_AVAILABLE' as PermissionStatus };
          }
          const p = Notification.permission;
          const mapped: PermissionStatus =
            p === 'granted' ? 'ALLOWED' : p === 'denied' ? 'RESTRICTED' : 'NOT_ALLOWED';
          return { ...item, status: mapped };
        }

        if (item.id === 'clipboard') {
          if (!navigator.clipboard) {
            return { ...item, status: 'NOT_AVAILABLE' as PermissionStatus };
          }
          if (navigator.permissions?.query) {
            const q = await navigator.permissions.query({
              name: 'clipboard-read' as PermissionName,
            });
            const mapped: PermissionStatus =
              q.state === 'granted' ? 'ALLOWED' : q.state === 'denied' ? 'RESTRICTED' : 'NOT_ALLOWED';
            return { ...item, status: mapped };
          }
          return { ...item, status: 'NOT_ALLOWED' as PermissionStatus };
        }

        if (item.id === 'contacts') {
          if (bridge?.hasPermission) {
            return {
              ...item,
              status: (bridge.hasPermission('contacts') ? 'ALLOWED' : 'NOT_ALLOWED') as PermissionStatus,
            };
          }
          if (!('contacts' in navigator)) {
            return { ...item, status: 'NOT_ALLOWED' as PermissionStatus };
          }
          return {
            ...item,
            status: (localStorage.getItem(CONTACTS_GRANT_KEY) === '1'
              ? 'ALLOWED'
              : 'NOT_ALLOWED') as PermissionStatus,
          };
        }
      } catch {
        // Fallback when Permissions API rejects a specific descriptor
      }

      return item;
    })
  );

  return results;
}

export async function requestBrowserPermission(id: string): Promise<PermissionStatus> {
  const bridge = getAndroidBridge();

  try {
    if (id === 'microphone' || id === 'speech_recognition') {
      if (!navigator.mediaDevices?.getUserMedia) return 'NOT_ALLOWED';
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      return 'ALLOWED';
    }

    if (id === 'camera') {
      if (!navigator.mediaDevices?.getUserMedia) return 'NOT_ALLOWED';
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach((t) => t.stop());
      return 'ALLOWED';
    }

    if (id === 'notifications') {
      if (!('Notification' in window)) return 'NOT_ALLOWED';
      const perm = await Notification.requestPermission();
      return perm === 'granted' ? 'ALLOWED' : perm === 'denied' ? 'RESTRICTED' : 'NOT_ALLOWED';
    }

    if (id === 'location') {
      if (!('geolocation' in navigator)) return 'NOT_ALLOWED';
      return await new Promise<PermissionStatus>((resolve) => {
        navigator.geolocation.getCurrentPosition(
          () => resolve('ALLOWED'),
          (err) => resolve(err.code === err.PERMISSION_DENIED ? 'RESTRICTED' : 'NOT_ALLOWED'),
          { timeout: 8000 }
        );
      });
    }

    if (id === 'wake_lock') {
      const ok = await acquireScreenWakeLock();
      return ok ? 'ALLOWED' : 'NOT_ALLOWED';
    }

    if (id === 'clipboard') {
      if (!navigator.clipboard?.readText) return 'NOT_ALLOWED';
      await navigator.clipboard.readText();
      return 'ALLOWED';
    }

    if (id === 'sensors') {
      if (!('DeviceMotionEvent' in window)) return 'NOT_ALLOWED';
      const dm = DeviceMotionEvent as unknown as {
        requestPermission?: () => Promise<'granted' | 'denied'>;
      };
      if (typeof dm?.requestPermission === 'function') {
        const res = await dm.requestPermission();
        localStorage.setItem(SENSORS_GRANT_KEY, res === 'granted' ? '1' : 'denied');
        return res === 'granted' ? 'ALLOWED' : 'RESTRICTED';
      }
      localStorage.setItem(SENSORS_GRANT_KEY, '1');
      return 'ALLOWED';
    }

    if (id === 'contacts') {
      if (bridge?.requestPermission) {
        const ok = bridge.requestPermission('contacts');
        return ok ? 'ALLOWED' : 'NOT_ALLOWED';
      }
      const nav = navigator as unknown as {
        contacts?: { select: (props: string[], opts?: { multiple?: boolean }) => Promise<unknown[]> };
      };
      if (!nav.contacts?.select) return 'NOT_ALLOWED';
      await nav.contacts.select(['name', 'tel'], { multiple: false });
      localStorage.setItem(CONTACTS_GRANT_KEY, '1');
      return 'ALLOWED';
    }

    if (id === 'display_over_apps') {
      if (bridge?.requestOverlayPermission) {
        const ok = bridge.requestOverlayPermission();
        return ok ? 'ALLOWED' : 'NOT_ALLOWED';
      }
      setOverlayGranted(true);
      return 'ALLOWED';
    }

    if (bridge?.requestPermission) {
      const ok = bridge.requestPermission(id);
      return ok ? 'ALLOWED' : 'NOT_ALLOWED';
    }
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      return 'RESTRICTED';
    }
    return 'NOT_ALLOWED';
  }
  return 'NOT_ALLOWED';
}

export async function getLiveGpsCoordinates(): Promise<{ lat: number; lng: number; accuracy: number } | null> {
  if (!('geolocation' in navigator)) return null;
  return await new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 6000 }
    );
  });
}

export interface LiveDeviceTelemetry {
  batteryPercent: number | null;
  charging: boolean | null;
  networkLabel: string;
}

export async function getLiveDeviceTelemetry(): Promise<LiveDeviceTelemetry> {
  let batteryPercent: number | null = null;
  let charging: boolean | null = null;

  try {
    const nav = navigator as unknown as {
      getBattery?: () => Promise<{ level: number; charging: boolean }>;
    };
    if (nav.getBattery) {
      const bat = await nav.getBattery();
      batteryPercent = Math.round(bat.level * 100);
      charging = Boolean(bat.charging);
    }
  } catch {
    // Battery API unavailable
  }

  let networkLabel = navigator.onLine ? 'Online' : 'Offline';
  try {
    const conn = (navigator as unknown as {
      connection?: { effectiveType?: string; type?: string };
    }).connection;
    if (navigator.onLine && conn) {
      const tag = (conn.type || conn.effectiveType || '').toUpperCase();
      if (tag) networkLabel = `Online · ${tag}`;
    }
  } catch {
    // ignore
  }

  return { batteryPercent, charging, networkLabel };
}
