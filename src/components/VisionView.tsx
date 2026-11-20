import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  CameraOff,
  Eye,
  FileText,
  Monitor,
  RefreshCw,
  ScanLine,
  Send,
  SwitchCamera,
  Upload,
  Volume2,
} from 'lucide-react';
import type {
  EmotionType,
  PersonalityId,
  VirtualScreenState,
  VisionAnalysisResult,
  VoiceSettings,
} from '../types/jarvis';
import { voiceClient } from '../services/voiceClient';

interface VisionViewProps {
  activePersonality: PersonalityId;
  activeEmotion: EmotionType;
  activeVoice?: VoiceSettings;
  onPermissionsChanged: () => Promise<void>;
}

export const VisionView: React.FC<VisionViewProps> = ({
  activePersonality,
  activeEmotion,
  activeVoice,
  onPermissionsChanged,
}) => {
  const [subTab, setSubTab] = useState<'camera' | 'screen'>('camera');
  const [cameraActive, setCameraActive] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [qaPrompt, setQaPrompt] = useState('');
  const [capturedPreview, setCapturedPreview] = useState<string | null>(null);
  const [visionResult, setVisionResult] = useState<VisionAnalysisResult | null>(null);

  const [screenConsent, setScreenConsent] = useState(false);
  const [screenState, setScreenState] = useState<VirtualScreenState | null>(null);
  const [loadingScreen, setLoadingScreen] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const startCamera = async (mode: 'environment' | 'user' = facingMode) => {
    stopCamera();
    setCameraError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera API is not supported in this browser.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
      await onPermissionsChanged();
    } catch (err) {
      setCameraError(
        err instanceof Error ? err.message : 'Camera access denied. Allow Camera permission to scan.'
      );
      await onPermissionsChanged();
    }
  };

  const captureFrameDataUrl = (): string | null => {
    const video = videoRef.current;
    if (!video || !cameraActive || video.videoWidth === 0) return capturedPreview;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
    setCapturedPreview(dataUrl);
    return dataUrl;
  };

  const runVisionAnalysis = async (
    mode: 'object' | 'ocr' | 'scene' | 'qa',
    explicitQuestion?: string
  ) => {
    const img = captureFrameDataUrl();
    if (!img) {
      setCameraError('Start the camera or upload an image first.');
      return;
    }
    setCameraError(null);
    setAnalyzing(true);
    try {
      const resp = await fetch('/api/vision/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: img,
          mimeType: 'image/jpeg',
          mode,
          question: explicitQuestion || qaPrompt.trim() || undefined,
        }),
      });
      const json = (await resp.json()) as VisionAnalysisResult & { error?: string };
      if (!resp.ok) {
        setCameraError(json.error || `Vision analysis HTTP ${resp.status}`);
      } else {
        setVisionResult(json);
      }
    } catch (err) {
      setCameraError(err instanceof Error ? err.message : 'Vision request failed.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = String(reader.result || '');
      if (dataUrl) {
        setCapturedPreview(dataUrl);
        setCameraError(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const fetchScreenContext = async () => {
    setLoadingScreen(true);
    try {
      const resp = await fetch('/api/automation/screen');
      if (resp.ok) {
        setScreenState(await resp.json());
      }
    } finally {
      setLoadingScreen(false);
    }
  };

  useEffect(() => {
    if (subTab === 'screen' && screenConsent) {
      void fetchScreenContext();
    }
  }, [subTab, screenConsent]);

  return (
    <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 pb-24 pt-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-2xl font-semibold text-white tracking-tight">
            Vision & Scan
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Explicitly activated camera recognition, OCR text reading, visual Q&A, and screen UI inspection.
          </p>
        </div>

        <div className="inline-flex p-1 rounded-xl bg-[#09132d] border border-blue-900/60 self-start">
          <button
            type="button"
            onClick={() => setSubTab('camera')}
            className={`inline-flex items-center gap-1.5 min-h-[40px] px-4 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
              subTab === 'camera' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            Camera Vision
          </button>
          <button
            type="button"
            onClick={() => setSubTab('screen')}
            className={`inline-flex items-center gap-1.5 min-h-[40px] px-4 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
              subTab === 'screen' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Monitor className="w-3.5 h-3.5" />
            Screen Vision
          </button>
        </div>
      </div>

      {subTab === 'camera' ? (
        <div className="space-y-5">
          {/* Camera Viewport & Explicit Controls */}
          <div className="rounded-2xl bg-[#09132d]/80 border border-blue-900/50 overflow-hidden">
            <div className="px-4 py-3 border-b border-blue-900/40 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs">
                <span className={cameraActive ? 'text-amber-300 font-semibold' : 'text-slate-400'}>
                  {cameraActive ? 'Camera Active' : 'Camera Standby'}
                </span>
                <span aria-hidden="true" className="text-slate-600">·</span>
                <span className="text-slate-400">
                  {facingMode === 'environment' ? 'Rear Lens' : 'Front Lens'}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {!cameraActive ? (
                  <button
                    type="button"
                    onClick={() => void startCamera(facingMode)}
                    className="inline-flex items-center gap-1.5 min-h-[38px] px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-medium text-white whitespace-nowrap"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    Activate Camera
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        const next = facingMode === 'environment' ? 'user' : 'environment';
                        setFacingMode(next);
                        void startCamera(next);
                      }}
                      className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 rounded-xl bg-[#040918] hover:bg-blue-950/70 border border-blue-800/60 text-xs font-medium text-slate-200 whitespace-nowrap"
                    >
                      <SwitchCamera className="w-3.5 h-3.5" />
                      Flip Lens
                    </button>
                    <button
                      type="button"
                      onClick={stopCamera}
                      className="inline-flex items-center gap-1.5 min-h-[38px] px-3.5 py-1.5 rounded-xl bg-red-950/60 hover:bg-red-900/60 border border-red-500/35 text-xs font-medium text-red-200 whitespace-nowrap"
                    >
                      <CameraOff className="w-3.5 h-3.5" />
                      Stop Camera
                    </button>
                  </>
                )}

                <label className="inline-flex items-center gap-1.5 min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[#040918] hover:bg-blue-950/70 border border-blue-800/60 text-xs font-medium text-slate-200 cursor-pointer whitespace-nowrap">
                  <Upload className="w-3.5 h-3.5" />
                  Upload Image
                  <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                </label>
              </div>
            </div>

            <div className="relative bg-[#040918] aspect-video max-h-[340px] w-full flex items-center justify-center overflow-hidden">
              <video
                ref={videoRef}
                playsInline
                muted
                className={`w-full h-full object-cover ${cameraActive ? 'block' : 'hidden'}`}
              />
              {!cameraActive && capturedPreview && (
                <img
                  src={capturedPreview}
                  alt="Captured frame for vision analysis"
                  className="w-full h-full object-contain"
                />
              )}
              {!cameraActive && !capturedPreview && (
                <div className="text-center px-6">
                  <ScanLine className="w-10 h-10 text-blue-400/70 mx-auto mb-2" />
                  <p className="text-sm text-slate-300">
                    Camera stays off until you tap Activate Camera or upload a photo.
                  </p>
                </div>
              )}
            </div>

            {cameraError && (
              <div className="px-4 py-2.5 bg-red-950/40 border-t border-red-500/30 text-xs text-red-300">
                {cameraError}
              </div>
            )}

            {/* Action Buttons */}
            <div className="p-4 space-y-3 border-t border-blue-900/40">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={analyzing}
                  onClick={() => void runVisionAnalysis('object')}
                  className="inline-flex items-center gap-1.5 min-h-[40px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-xs font-medium text-white whitespace-nowrap"
                >
                  <Eye className="w-3.5 h-3.5" />
                  Identify Object
                </button>
                <button
                  type="button"
                  disabled={analyzing}
                  onClick={() => void runVisionAnalysis('ocr')}
                  className="inline-flex items-center gap-1.5 min-h-[40px] px-4 py-2 rounded-xl bg-[#040918] hover:bg-blue-950/70 border border-blue-800/60 disabled:opacity-50 text-xs font-medium text-slate-100 whitespace-nowrap"
                >
                  <FileText className="w-3.5 h-3.5 text-amber-300" />
                  Read Text (OCR)
                </button>
                <button
                  type="button"
                  disabled={analyzing}
                  onClick={() => void runVisionAnalysis('scene')}
                  className="inline-flex items-center gap-1.5 min-h-[40px] px-4 py-2 rounded-xl bg-[#040918] hover:bg-blue-950/70 border border-blue-800/60 disabled:opacity-50 text-xs font-medium text-slate-100 whitespace-nowrap"
                >
                  <ScanLine className="w-3.5 h-3.5 text-blue-400" />
                  Describe Scene
                </button>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void runVisionAnalysis('qa');
                }}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  value={qaPrompt}
                  onChange={(e) => setQaPrompt(e.target.value)}
                  placeholder="Ask a visual question (e.g. What brand is this or translate the sign)..."
                  className="flex-1 h-11 px-3.5 rounded-xl bg-[#040918] border border-blue-900/60 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                />
                <button
                  type="submit"
                  disabled={analyzing}
                  className="min-h-[44px] px-4 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-xs font-medium text-white inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Send className="w-3.5 h-3.5" />
                  {analyzing ? 'Scanning...' : 'Ask Vision'}
                </button>
              </form>
            </div>
          </div>

          {/* Vision Analysis Result */}
          {visionResult && (
            <div className="rounded-2xl bg-[#09132d]/80 border border-amber-400/30 p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-medium text-amber-300 uppercase tracking-wider">
                  {visionResult.mode} Analysis · {visionResult.latencyMs}ms
                </div>
                {activeVoice && (
                  <button
                    type="button"
                    onClick={() => {
                      voiceClient.primeAudio();
                      void voiceClient.speak(
                        visionResult.summary,
                        activePersonality,
                        activeVoice,
                        activeEmotion,
                        () => {},
                        () => {}
                      );
                    }}
                    className="inline-flex items-center gap-1.5 text-xs text-blue-300 hover:text-amber-300"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    Speak Result
                  </button>
                )}
              </div>
              <p className="text-sm text-slate-100 leading-relaxed">{visionResult.summary}</p>
              {visionResult.detectedObjects.length > 0 && (
                <div className="text-xs text-slate-300">
                  <span className="text-slate-400">Objects: </span>
                  {visionResult.detectedObjects.join(' · ')}
                </div>
              )}
              {visionResult.extractedText && (
                <div className="p-3 rounded-xl bg-[#040918] border border-blue-900/50 text-xs font-mono text-slate-200 whitespace-pre-wrap">
                  {visionResult.extractedText}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl bg-[#09132d]/80 border border-blue-900/50 p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-white">Screen Context & UI Nodes</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Reads accessible UI elements only when Screen Vision consent is enabled.
              </p>
            </div>
            <label className="inline-flex items-center gap-2.5 text-xs text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={screenConsent}
                onChange={(e) => setScreenConsent(e.target.checked)}
                className="w-4 h-4 accent-blue-500"
              />
              Allow Screen Inspection
            </label>
          </div>

          {!screenConsent ? (
            <div className="p-6 rounded-xl bg-[#040918]/80 border border-blue-900/40 text-center text-xs text-slate-400">
              Screen inspection is currently paused. Enable "Allow Screen Inspection" above to view active app nodes.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-xs text-slate-300">
                  {screenState ? (
                    <>
                      <span className="text-amber-300 font-semibold">{screenState.currentApp}</span>
                      <span className="text-slate-500"> · {screenState.packageName}</span>
                    </>
                  ) : (
                    'Loading screen tree...'
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void fetchScreenContext()}
                  className="inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-xl bg-[#040918] border border-blue-800/60 text-xs text-slate-200"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingScreen ? 'animate-spin' : ''}`} />
                  Refresh Screen
                </button>
              </div>

              {screenState && (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="p-3 rounded-xl bg-[#040918] border border-blue-900/50">
                      <div className="text-slate-400">Brightness</div>
                      <div className="text-white font-semibold mt-0.5 tabular-nums">
                        {screenState.brightnessPercent}%
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-[#040918] border border-blue-900/50">
                      <div className="text-slate-400">Volume</div>
                      <div className="text-white font-semibold mt-0.5 tabular-nums">
                        {screenState.volumePercent}%
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-[#040918] border border-blue-900/50">
                      <div className="text-slate-400">Battery</div>
                      <div className="text-white font-semibold mt-0.5 tabular-nums">
                        {screenState.batteryPercent}%
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-[#040918] border border-blue-900/50">
                      <div className="text-slate-400">Network</div>
                      <div className="text-white font-semibold mt-0.5 truncate">
                        {screenState.networkStatus}
                      </div>
                    </div>
                  </div>

                  <div className="divide-y divide-blue-900/40 rounded-xl bg-[#040918] border border-blue-900/50 overflow-hidden">
                    {screenState.nodes.map((node) => (
                      <div key={node.nodeId} className="p-3 flex items-center justify-between gap-3 text-xs">
                        <div className="min-w-0">
                          <div className="text-white font-medium truncate">{node.label}</div>
                          <div className="text-slate-500 font-mono text-[11px] truncate">
                            {node.type} · {node.nodeId}
                          </div>
                        </div>
                        <span className="text-slate-400 shrink-0">
                          {node.editable ? 'Editable' : node.clickable ? 'Clickable' : 'Readable'}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
