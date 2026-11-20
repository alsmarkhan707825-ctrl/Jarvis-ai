import type { PermissionRecord, PermissionStatus } from '../types/jarvis';

export async function resolveBrowserPermissionStatuses(
  catalog: PermissionRecord[]
): Promise<PermissionRecord[]> {
  const results = await Promise.all(
    catalog.map(async (item) => {
      if (item.scope === 'android_native') {
        return { ...item, status: 'NOT_AVAILABLE' as PermissionStatus };
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

        if (item.id === 'contacts') {
          const supported = 'contacts' in navigator;
          return { ...item, status: (supported ? 'NOT_ALLOWED' : 'NOT_AVAILABLE') as PermissionStatus };
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
  try {
    if (id === 'microphone' || id === 'speech_recognition') {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      return 'ALLOWED';
    }

    if (id === 'camera') {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach((t) => t.stop());
      return 'ALLOWED';
    }

    if (id === 'notifications') {
      if (!('Notification' in window)) return 'NOT_AVAILABLE';
      const perm = await Notification.requestPermission();
      return perm === 'granted' ? 'ALLOWED' : perm === 'denied' ? 'RESTRICTED' : 'NOT_ALLOWED';
    }

    if (id === 'location') {
      if (!('geolocation' in navigator)) return 'NOT_AVAILABLE';
      return await new Promise<PermissionStatus>((resolve) => {
        navigator.geolocation.getCurrentPosition(
          () => resolve('ALLOWED'),
          (err) => resolve(err.code === err.PERMISSION_DENIED ? 'RESTRICTED' : 'NOT_ALLOWED'),
          { timeout: 8000 }
        );
      });
    }
  } catch {
    return 'RESTRICTED';
  }
  return 'NOT_AVAILABLE';
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
