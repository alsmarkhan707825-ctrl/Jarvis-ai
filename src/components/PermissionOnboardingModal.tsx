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
    ['microphone', 'camera', 'speech_recognition', 'notifications', 'location'].includes(p.id)
  );

  const handleRequest = async (id: string) => {
    setBusyId(id);
    await requestBrowserPermission(id);
    await onRefreshPermissions();
    setBusyId(null);
  };

  const getIcon = (id: string) => {
    if (id === 'microphone' || id === 'speech_recognition') {
      return <Mic className="w-5 h-5 text-blue-400" />;
    }
    if (id === 'camera') return <Camera className="w-5 h-5 text-amber-300" />;
    if (id === 'notifications') return <Bell className="w-5 h-5 text-amber-400" />;
    if (id === 'location') return <MapPin className="w-5 h-5 text-blue-300" />;
    return <Shield className="w-5 h-5 text-amber-400" />;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#040918]/90 backdrop-blur-md p-4 overflow-y-auto">
      <div className="w-full max-w-lg rounded-3xl bg-[#09132d] border border-blue-500/25 shadow-2xl shadow-blue-950/60 p-6 sm:p-8 my-auto">
        <div className="mb-5">
          <h2 className="font-display text-2xl font-semibold text-white tracking-tight">
            Permission Setup
          </h2>
          <p className="mt-2 text-sm text-slate-300 leading-relaxed">
            JARVIS AI activates microphone, camera, and location only when you explicitly grant access.
            Native Android permissions (Accessibility, Notification Listener, Phone, SMS) can be reviewed in Settings.
          </p>
        </div>

        <div className="divide-y divide-blue-900/50 border-y border-blue-900/50 max-h-[52vh] overflow-y-auto pr-1">
          {primaryList.map((perm) => {
            const granted = perm.status === 'ALLOWED';
            return (
              <div key={perm.id} className="py-3.5 flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="mt-0.5 shrink-0 w-9 h-9 rounded-xl bg-blue-950/80 border border-blue-500/20 flex items-center justify-center">
                    {getIcon(perm.id)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-white">{perm.name}</span>
                      <span className="text-xs text-slate-400">· {perm.status.replace(/_/g, ' ')}</span>
                    </div>
                    <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">{perm.purpose}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                      If skipped: {perm.missingImpact}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={granted || busyId === perm.id}
                  onClick={() => handleRequest(perm.id)}
                  className={`shrink-0 min-h-[40px] px-4 py-2 rounded-xl text-xs font-medium transition-colors whitespace-nowrap ${
                    granted
                      ? 'bg-blue-950/50 text-amber-300 border border-amber-400/30 cursor-default'
                      : 'bg-blue-600 hover:bg-blue-500 text-white'
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
            className="min-h-[44px] px-6 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white text-sm font-medium border border-amber-400/30 transition-all whitespace-nowrap"
          >
            Continue to JARVIS
          </button>
        </div>
      </div>
    </div>
  );
};
