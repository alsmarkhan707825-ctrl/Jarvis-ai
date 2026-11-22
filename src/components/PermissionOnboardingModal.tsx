import React, { useState } from 'react';
import { Bell, Camera, CheckCircle2, MapPin, Mic, Shield } from 'lucide-react';
import type { PermissionRecord } from '../types/jarvis';
import { requestBrowserPermission } from '../services/permissionClient';

interface PermissionOnboardingModalProps {
  permissions: PermissionRecord[];
  onRefreshPermissions: () => Promise<void>;
  onComplete: () => void;
}

export const PermissionOnboardingModal: React.FC<PermissionOnboardingModalProps> = ({
  permissions,
  onRefreshPermissions,
  onComplete,
}) => {
  const [busyId, setBusyId] = useState<string | null>(null);

  const primaryList = permissions.filter((p) =>
    [
      'microphone',
      'camera',
      'speech_recognition',
      'notifications',
      'location',
      'display_over_apps',
      'wake_lock',
    ].includes(p.id)
  );

  const handleRequest = async (id: string) => {
    setBusyId(id);
    await requestBrowserPermission(id);
    await onRefreshPermissions();
    setBusyId(null);
  };

  const getIcon = (id: string) => {
    if (id === 'microphone' || id === 'speech_recognition') {
      return <Mic className="w-5 h-5 text-blue-600 dark:text-cyan-400" />;
    }
    if (id === 'camera') return <Camera className="w-5 h-5 text-amber-600 dark:text-amber-400" />;
    if (id === 'notifications') return <Bell className="w-5 h-5 text-amber-600 dark:text-amber-400" />;
    if (id === 'location') return <MapPin className="w-5 h-5 text-blue-600 dark:text-cyan-400" />;
    return <Shield className="w-5 h-5 text-blue-600 dark:text-cyan-400" />;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 dark:bg-black/75 backdrop-blur-md p-4 overflow-y-auto">
      <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-[#0D121C] border border-slate-200 dark:border-slate-800 shadow-2xl p-6 sm:p-8 my-auto">
        <div className="mb-5">
          <h2 className="font-display text-2xl font-semibold text-slate-900 dark:text-white tracking-tight">
            Permission Setup
          </h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            Allow Microphone, Camera, Location, Display Over Other Apps (Floating JARVIS Logo), and 24/7 Wake Lock. Created by alsmar Boos.
          </p>
        </div>

        <div className="divide-y divide-slate-200 dark:divide-slate-800 border-y border-slate-200 dark:border-slate-800 max-h-[52vh] overflow-y-auto pr-1">
          {primaryList.map((perm) => {
            const granted = perm.status === 'ALLOWED';
            return (
              <div key={perm.id} className="py-3.5 flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="mt-0.5 shrink-0 w-9 h-9 rounded-xl bg-blue-50 dark:bg-slate-800 border border-blue-200 dark:border-slate-700 flex items-center justify-center">
                    {getIcon(perm.id)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900 dark:text-white">
                        {perm.name}
                      </span>
                      <span
                        className={`text-xs font-semibold ${
                          perm.status === 'ALLOWED'
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : perm.status === 'RESTRICTED'
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-amber-700 dark:text-amber-400'
                        }`}
                      >
                        ·{' '}
                        {perm.status === 'ALLOWED'
                          ? 'ALLOWED'
                          : perm.status === 'RESTRICTED'
                            ? 'DENIED'
                            : 'NOT ALLOWED'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">
                      {perm.purpose}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={granted || busyId === perm.id}
                  onClick={() => handleRequest(perm.id)}
                  className={`shrink-0 min-h-[40px] px-4 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
                    granted
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700 cursor-default'
                      : 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'
                  }`}
                >
                  {granted ? (
                    <span className="inline-flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Allowed
                    </span>
                  ) : busyId === perm.id ? (
                    'Requesting...'
                  ) : (
                    'Allow'
                  )}
                </button>
              </div>
            );
          })}
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onComplete}
            className="min-h-[44px] px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-sm transition-all whitespace-nowrap"
          >
            Continue to JARVIS
          </button>
        </div>
      </div>
    </div>
  );
};
