import React, { useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  compact?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, isAndroid, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  const handlePress = async () => {
    if (isInstallable) {
      const ok = await install();
      if (!ok) setShowGuide(true);
      return;
    }
    setShowGuide(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void handlePress()}
        aria-label="Install Android App"
        className={
          compact
            ? 'min-h-[38px] px-2.5 flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors whitespace-nowrap shadow-sm'
            : 'inline-flex items-center justify-center gap-2 min-h-[42px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors whitespace-nowrap shadow-sm'
        }
      >
        {compact ? <Download className="w-3.5 h-3.5" /> : <Smartphone className="w-4 h-4" />}
        <span>{compact ? 'App' : 'Install Android App'}</span>
      </button>

      {showGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 dark:bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white dark:bg-[#0D121C] border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-cyan-950/60 border border-blue-200 dark:border-cyan-800 flex items-center justify-center shrink-0">
                  <Smartphone className="w-5 h-5 text-blue-600 dark:text-cyan-400" />
                </div>
                <div>
                  <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                    {isIOS ? 'Install on iPhone / iPad' : 'Install JARVIS Android App'}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Standalone App · Home Screen Launcher
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white"
                aria-label="Close install guide"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isIOS ? (
              <ol className="text-xs text-slate-700 dark:text-slate-300 space-y-2 list-decimal pl-4 leading-relaxed">
                <li>Safari toolbar mein <strong>Share</strong> button tap karein.</li>
                <li>Neeche scroll karke <strong>Add to Home Screen</strong> par tap karein.</li>
              </ol>
            ) : (
              <div className="space-y-3 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                <p>
                  {isAndroid
                    ? 'Android phone par standalone app ki tarah install karne ke liye:'
                    : 'Android Chrome mein is app ko direct WebAPK ki tarah install karne ke liye:'}
                </p>
                <ol className="space-y-1.5 list-decimal pl-4">
                  <li>
                    App ko AI Studio iframe se bahar direct browser tab mein kholein (ya Shared URL Chrome mein open karein).
                  </li>
                  <li>
                    Chrome top-right <strong>Menu (⋮)</strong> &rarr; <strong>Install app / Add to Home screen</strong> par tap karein.
                  </li>
                  <li>
                    Full native Android Studio APK (`OverlayBubbleService` + `WakeWordForegroundService` + `Accessibility`) ke liye <strong>Settings &rarr; Android & Info</strong> se APK project download karein.
                  </li>
                </ol>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="w-full min-h-[42px] rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
            >
              Samajh Gaya
            </button>
          </div>
        </div>
      )}
    </>
  );
};
