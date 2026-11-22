import dotenv from 'dotenv';
dotenv.config({ override: true });
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import type {
  AppSettingsPayload,
  AutomationRoutine,
  ChatMessage,
  EmotionType,
  MemoryCategory,
  ParsedCommand,
  PersonalityId,
  ProviderId,
  SttProviderId,
  VoiceSettings,
} from './src/types/jarvis.ts';
import { aiProviderManager, formatFriendlyProviderError } from './server/modules/aiProviderManager.ts';
import { accessibilityController } from './server/modules/accessibilityController.ts';
import { AudioProcessingEngine } from './server/modules/audioProcessingEngine.ts';
import { conversationManager } from './server/modules/conversationManager.ts';
import {
  ContactManager,
  NotificationManager,
  PermissionManager,
  PhoneIntelligenceManager,
  TaskExecutionEngine,
} from './server/modules/deviceManagers.ts';
import { emotionEngine, SUPPORTED_EMOTIONS } from './server/modules/emotionEngine.ts';
import { errorRecoveryEngine } from './server/modules/errorRecoveryEngine.ts';
import { intentDetectionEngine } from './server/modules/intentDetectionEngine.ts';
import { loggingDiagnostics } from './server/modules/loggingDiagnostics.ts';
import { memoryManager } from './server/modules/memoryManager.ts';
import { modelSelectionManager } from './server/modules/modelSelectionManager.ts';
import { storageStore } from './server/modules/storageStore.ts';
import { selfEvolutionEngine } from './server/modules/selfEvolutionEngine.ts';
import { textToSpeechEngine } from './server/modules/textToSpeechEngine.ts';
import { visionEngine } from './server/modules/visionEngine.ts';
import { voiceRecognitionEngine } from './server/modules/voiceRecognitionEngine.ts';
import { VoiceAppControlEngine } from './server/modules/voiceAppControl.ts';
import { buildZipFromDirectory } from './server/modules/zipBuilder.ts';

const PORT = Number(process.env.PORT || 3000);

function matchEmotionName(rawTag: string): EmotionType | undefined {
  const lower = rawTag.trim().toLowerCase();
  return SUPPORTED_EMOTIONS.find((em) => em.toLowerCase() === lower);
}

function collectAndroidFiles(dir: string, baseDir: string): Array<{ path: string; content: string }> {
  if (!fs.existsSync(dir)) return [];
  const results: Array<{ path: string; content: string }> = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectAndroidFiles(fullPath, baseDir));
    } else {
      const rel = path.relative(baseDir, fullPath).replace(/\\/g, '/');
      results.push({ path: rel, content: fs.readFileSync(fullPath, 'utf8') });
    }
  }
  return results;
}

async function bootstrap() {
  const app = express();
  app.use(express.json({ limit: '18mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, timestamp: new Date().toISOString() });
  });

  // Settings
  app.get('/api/settings', (_req, res) => {
    res.json(storageStore.getState().settings);
  });

  app.patch('/api/settings', (req, res) => {
    const patch = req.body as Partial<AppSettingsPayload>;
    const updated = storageStore.update((draft) => {
      if (patch.activePersonality) draft.settings.activePersonality = patch.activePersonality;
      if (patch.themeMode === 'black' || patch.themeMode === 'white') {
        draft.settings.themeMode = patch.themeMode;
      }
      if (patch.floatingBubbleEnabled !== undefined) {
        draft.settings.floatingBubbleEnabled = patch.floatingBubbleEnabled;
      }
      if (patch.background24x7 !== undefined) {
        draft.settings.background24x7 = patch.background24x7;
      }
      if (patch.elevenlabsEnabled !== undefined) {
        draft.settings.elevenlabsEnabled = patch.elevenlabsEnabled;
      }
      if (patch.characterMoods) {
        draft.settings.characterMoods = { ...draft.settings.characterMoods, ...patch.characterMoods };
      }
      if (patch.jarvisModel) draft.settings.jarvisModel = { ...draft.settings.jarvisModel, ...patch.jarvisModel };
      if (patch.girlModel) draft.settings.girlModel = { ...draft.settings.girlModel, ...patch.girlModel };
      if (patch.jarvisVoice) draft.settings.jarvisVoice = { ...draft.settings.jarvisVoice, ...patch.jarvisVoice };
      if (patch.girlVoice) draft.settings.girlVoice = { ...draft.settings.girlVoice, ...patch.girlVoice };
      if (patch.automation) draft.settings.automation = { ...draft.settings.automation, ...patch.automation };
      if (patch.enabledProviders) {
        draft.settings.enabledProviders = { ...draft.settings.enabledProviders, ...patch.enabledProviders };
      }
      if (patch.providerDefaultModels) {
        draft.settings.providerDefaultModels = {
          ...draft.settings.providerDefaultModels,
          ...patch.providerDefaultModels,
        };
      }
      if (patch.providerCustomModels) {
        draft.settings.providerCustomModels = {
          ...(draft.settings.providerCustomModels || {}),
          ...patch.providerCustomModels,
        };
      }
      if (patch.primaryProvider !== undefined) draft.settings.primaryProvider = patch.primaryProvider;
      if (patch.secondaryProvider !== undefined) draft.settings.secondaryProvider = patch.secondaryProvider;
      if (patch.autoModelSelection !== undefined) draft.settings.autoModelSelection = patch.autoModelSelection;
      if (patch.fastResponseModel !== undefined) draft.settings.fastResponseModel = patch.fastResponseModel;
      if (patch.reasoningModel !== undefined) draft.settings.reasoningModel = patch.reasoningModel;
      if (patch.sttProvider !== undefined) draft.settings.sttProvider = patch.sttProvider;
      if (patch.ttsProvider !== undefined) draft.settings.ttsProvider = patch.ttsProvider;
      if (patch.autoSpeakChatReplies !== undefined) draft.settings.autoSpeakChatReplies = patch.autoSpeakChatReplies;
      if (patch.proactiveTalkEnabled !== undefined) draft.settings.proactiveTalkEnabled = patch.proactiveTalkEnabled;
      if (patch.proactiveIntervalSec !== undefined) draft.settings.proactiveIntervalSec = patch.proactiveIntervalSec;
      if (patch.playfulBanterEnabled !== undefined) draft.settings.playfulBanterEnabled = patch.playfulBanterEnabled;
      if (patch.selfLearningEnabled !== undefined) draft.settings.selfLearningEnabled = patch.selfLearningEnabled;
      if (patch.wakeWords !== undefined) draft.settings.wakeWords = patch.wakeWords;
      if (patch.wakeWordSensitivity !== undefined) draft.settings.wakeWordSensitivity = patch.wakeWordSensitivity;
      if (patch.sleepState !== undefined) draft.settings.sleepState = patch.sleepState;
      if (patch.preferredLanguage !== undefined) draft.settings.preferredLanguage = patch.preferredLanguage;
      if (patch.onboardingCompleted !== undefined) draft.settings.onboardingCompleted = patch.onboardingCompleted;
    });
    res.json(updated.settings);
  });

  // AI Providers & Voice Key Status
  app.get('/api/providers', (_req, res) => {
    res.json(aiProviderManager.listProviders());
  });

  app.get('/api/voice/engines', (_req, res) => {
    const statuses = aiProviderManager.getVoiceKeyStatuses();
    res.json({
      ...statuses,
      elevenlabsEnabled: storageStore.getState().settings.elevenlabsEnabled !== false,
    });
  });

  app.post('/api/voice/elevenlabs/connect', async (_req, res) => {
    storageStore.update((draft) => {
      draft.settings.elevenlabsEnabled = true;
      draft.settings.ttsProvider = 'elevenlabs';
      for (const vc of [draft.settings.jarvisVoice, draft.settings.girlVoice]) {
        vc.ttsEngine = 'elevenlabs';
        vc.voiceModel = 'eleven_flash_v2_5';
        vc.voiceName = vc.gender === 'female' ? 'Rachel' : 'Adam';
      }
    });
    const key = process.env.ELEVENLABS_API_KEY;
    const configured = Boolean(key && !key.startsWith('MY_'));
    if (!configured) {
      res.json({
        configured: false,
        enabled: true,
        status: 'ENV_KEY_MISSING',
        message: 'Set ELEVENLABS_API_KEY in AI Studio Secrets to activate ElevenLabs neural voices.',
      });
      return;
    }
    try {
      const resp = await fetch('https://api.elevenlabs.io/v1/user', {
        headers: { 'xi-api-key': key! },
        signal: AbortSignal.timeout(6000),
      });
      res.json({
        configured: true,
        enabled: true,
        status: resp.ok ? 'CONNECTED' : 'ERROR',
        message: resp.ok ? 'ElevenLabs Voice connected & active.' : `ElevenLabs HTTP ${resp.status}`,
      });
    } catch (e) {
      res.json({
        configured: true,
        enabled: true,
        status: 'ERROR',
        message: e instanceof Error ? e.message : 'ElevenLabs connection test failed.',
      });
    }
  });

  app.post('/api/voice/elevenlabs/disconnect', (_req, res) => {
    storageStore.update((draft) => {
      draft.settings.elevenlabsEnabled = false;
      if (draft.settings.ttsProvider === 'elevenlabs') {
        draft.settings.ttsProvider = 'gemini';
      }
      for (const vc of [draft.settings.jarvisVoice, draft.settings.girlVoice]) {
        if (vc.ttsEngine === 'elevenlabs') {
          vc.ttsEngine = 'gemini';
          vc.voiceModel = 'gemini-3.8-flash-lite-tts';
          vc.voiceName = vc.gender === 'female' ? 'Kore' : 'Charon';
        }
      }
    });
    res.json({ enabled: false, status: 'DISCONNECTED', message: 'ElevenLabs Voice disconnected.' });
  });

  app.post('/api/voice/elevenlabs/test', async (_req, res) => {
    const start = Date.now();
    const key = process.env.ELEVENLABS_API_KEY;
    if (!key || key.startsWith('MY_')) {
      res.json({
        configured: false,
        status: 'ENV_KEY_MISSING',
        message: 'Add ELEVENLABS_API_KEY in AI Studio > Settings > Secrets.',
      });
      return;
    }
    try {
      const resp = await fetch('https://api.elevenlabs.io/v1/user', {
        headers: { 'xi-api-key': key },
        signal: AbortSignal.timeout(7000),
      });
      res.json({
        configured: true,
        status: resp.ok ? 'CONNECTED' : 'ERROR',
        latencyMs: Date.now() - start,
        message: resp.ok ? 'ElevenLabs Voice Key verified!' : `ElevenLabs HTTP ${resp.status}`,
      });
    } catch (e) {
      res.json({
        configured: true,
        status: 'ERROR',
        latencyMs: Date.now() - start,
        message: e instanceof Error ? e.message : 'ElevenLabs check failed.',
      });
    }
  });

  // Live Real-Time Weather Route (Open-Meteo, zero API key required)
  app.get('/api/weather', async (req, res) => {
    try {
      let lat = Number(req.query.lat);
      let lon = Number(req.query.lon);
      let city = typeof req.query.city === 'string' && req.query.city.trim() ? req.query.city.trim() : '';

      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        // Default to New Delhi coordinates if browser GPS not yet granted
        lat = 28.6139;
        lon = 77.209;
        if (!city) city = 'New Delhi';
      }

      const weatherUrl =
        `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}` +
        `&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m&timezone=auto`;

      const weatherResp = await fetch(weatherUrl, { signal: AbortSignal.timeout(7000) });
      if (!weatherResp.ok) {
        throw new Error(`Weather API HTTP ${weatherResp.status}`);
      }
      const wData = (await weatherResp.json()) as {
        current?: {
          temperature_2m: number;
          relative_humidity_2m: number;
          apparent_temperature: number;
          is_day: number;
          weather_code: number;
          wind_speed_10m: number;
        };
      };

      if (!city) {
        try {
          const geoResp = await fetch(
            `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&localityLanguage=en`,
            { signal: AbortSignal.timeout(4000) }
          );
          if (geoResp.ok) {
            const g = (await geoResp.json()) as { city?: string; locality?: string; principalSubdivision?: string };
            city = g.city || g.locality || g.principalSubdivision || 'Current Location';
          }
        } catch {
          city = 'Your Location';
        }
      }

      const cur = wData.current;
      const code = cur?.weather_code ?? 0;
      const codeMap: Record<number, string> = {
        0: 'Clear Sky',
        1: 'Mainly Clear',
        2: 'Partly Cloudy',
        3: 'Overcast',
        45: 'Foggy',
        48: 'Mist',
        51: 'Light Drizzle',
        53: 'Moderate Drizzle',
        61: 'Light Rain',
        63: 'Rainy',
        65: 'Heavy Rain',
        71: 'Light Snow',
        80: 'Rain Showers',
        95: 'Thunderstorm',
      };
      const condition = codeMap[code] || (code >= 80 ? 'Showers' : code >= 50 ? 'Drizzle' : 'Clear');

      res.json({
        city: city || 'Live Weather',
        temperatureC: Math.round(cur?.temperature_2m ?? 26),
        feelsLikeC: Math.round(cur?.apparent_temperature ?? 26),
        humidity: Math.round(cur?.relative_humidity_2m ?? 50),
        windKmh: Math.round(cur?.wind_speed_10m ?? 8),
        condition,
        weatherCode: code,
        isDay: cur?.is_day !== 0,
        updatedAt: new Date().toISOString(),
      });
    } catch (e) {
      res.status(502).json({
        error: e instanceof Error ? e.message : 'Unable to fetch live weather',
      });
    }
  });

  app.post('/api/providers/:id/test', async (req, res) => {
    const providerId = req.params.id as ProviderId;
    const info = await aiProviderManager.testConnection(providerId);
    res.json(info);
  });

  app.post('/api/providers/:id/connect', async (req, res) => {
    const providerId = req.params.id as ProviderId;
    const info = await aiProviderManager.connectProvider(providerId);
    res.json(info);
  });

  app.post('/api/providers/:id/disconnect', (req, res) => {
    const providerId = req.params.id as ProviderId;
    const info = aiProviderManager.disconnectProvider(providerId);
    res.json(info);
  });

  app.get('/api/providers/:id/models', async (req, res) => {
    const providerId = req.params.id as ProviderId;
    const models = await aiProviderManager.fetchModels(providerId);
    res.json({ provider: providerId, models });
  });

  // Self-Evolution & Adaptive Traits
  app.get('/api/evolution', (req, res) => {
    const personality = req.query.personality as PersonalityId | undefined;
    res.json(selfEvolutionEngine.list(personality));
  });

  app.post('/api/evolution/:personality', (req, res) => {
    const personality = req.params.personality as PersonalityId;
    const { trait } = req.body as { trait?: string };
    if (!trait?.trim()) {
      res.status(400).json({ error: 'Trait text is required.' });
      return;
    }
    const created = selfEvolutionEngine.addTrait(personality, trait, 'user_command');
    res.status(201).json(created);
  });

  app.delete('/api/evolution/:id', (req, res) => {
    res.json({ removed: selfEvolutionEngine.removeTrait(req.params.id) });
  });

  // Conversations
  app.get('/api/conversations', (req, res) => {
    const personality = req.query.personality as PersonalityId | undefined;
    const q = req.query.q as string | undefined;
    res.json(conversationManager.list(personality, q));
  });

  app.post('/api/conversations', (req, res) => {
    const { personality, title } = req.body as { personality: PersonalityId; title?: string };
    const thread = conversationManager.create(personality || 'jarvis', title);
    res.status(201).json(thread);
  });

  app.patch('/api/conversations/:id', (req, res) => {
    try {
      const { title } = req.body as { title: string };
      res.json(conversationManager.rename(req.params.id, title));
    } catch (e) {
      res.status(404).json({ error: e instanceof Error ? e.message : 'Not found' });
    }
  });

  app.delete('/api/conversations/:id', (req, res) => {
    res.json({ removed: conversationManager.delete(req.params.id) });
  });

  // Memory
  app.get('/api/memory', (req, res) => {
    const personality = req.query.personality as PersonalityId | undefined;
    const q = req.query.q as string | undefined;
    res.json(memoryManager.list(personality, q));
  });

  app.get('/api/memory/export', (req, res) => {
    const personality = req.query.personality as PersonalityId | undefined;
    res.setHeader('Content-Type', 'application/json');
    res.send(memoryManager.exportJson(personality));
  });

  app.post('/api/memory', (req, res) => {
    try {
      const body = req.body as {
        personality: PersonalityId;
        category: MemoryCategory;
        key: string;
        value: string;
        userApproved: boolean;
      };
      const entry = memoryManager.add(body);
      res.status(201).json(entry);
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : 'Failed to save memory' });
    }
  });

  app.patch('/api/memory/:id', (req, res) => {
    try {
      res.json(memoryManager.update(req.params.id, req.body));
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : 'Failed to update memory' });
    }
  });

  app.delete('/api/memory/:id', (req, res) => {
    res.json({ removed: memoryManager.delete(req.params.id) });
  });

  // Automation Routines
  app.get('/api/routines', (_req, res) => {
    res.json(storageStore.getState().routines);
  });

  app.post('/api/routines', (req, res) => {
    const { name, triggerPhrase, commandsText, scheduleLabel } = req.body as Partial<AutomationRoutine>;
    if (!name?.trim() || !triggerPhrase?.trim() || !commandsText?.trim()) {
      res.status(400).json({ error: 'Name, trigger phrase, and commands are required.' });
      return;
    }
    const created: AutomationRoutine = {
      id: crypto.randomUUID(),
      name: name.trim(),
      triggerPhrase: triggerPhrase.trim(),
      commandsText: commandsText.trim(),
      scheduleLabel: scheduleLabel?.trim() || 'Manual / Voice Trigger',
      enabled: true,
    };
    storageStore.update((draft) => {
      draft.routines.unshift(created);
    });
    res.status(201).json(created);
  });

  app.patch('/api/routines/:id', (req, res) => {
    let updated: AutomationRoutine | undefined;
    storageStore.update((draft) => {
      const target = draft.routines.find((r) => r.id === req.params.id);
      if (target) {
        Object.assign(target, req.body);
        updated = target;
      }
    });
    if (!updated) {
      res.status(404).json({ error: 'Routine not found' });
      return;
    }
    res.json(updated);
  });

  app.delete('/api/routines/:id', (req, res) => {
    storageStore.update((draft) => {
      draft.routines = draft.routines.filter((r) => r.id !== req.params.id);
    });
    res.json({ deleted: true });
  });

  app.post('/api/routines/:id/run', async (req, res) => {
    const routine = storageStore.getState().routines.find((r) => r.id === req.params.id);
    if (!routine) {
      res.status(404).json({ error: 'Routine not found' });
      return;
    }
    const plan = await intentDetectionEngine.parse(routine.commandsText);
    const report = await TaskExecutionEngine.runCommandPlan(plan, false);
    storageStore.update((draft) => {
      const item = draft.routines.find((r) => r.id === routine.id);
      if (item) item.lastRunAt = new Date().toISOString();
    });
    res.json(report);
  });

  // Vision Engine (Camera / OCR / Scene / Visual Q&A)
  app.post('/api/vision/analyze', async (req, res) => {
    try {
      const { imageBase64, mimeType, mode = 'scene', question } = req.body as {
        imageBase64: string;
        mimeType?: string;
        mode?: 'object' | 'ocr' | 'scene' | 'qa';
        question?: string;
      };
      if (!imageBase64) {
        res.status(400).json({ error: 'imageBase64 is required' });
        return;
      }
      const result = await visionEngine.analyzeImage({ imageBase64, mimeType, mode, question });
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : 'Vision analysis failed' });
    }
  });

  // Streaming Assistant Endpoint (SSE)
  app.post('/api/assistant/stream', async (req, res) => {
    const startTime = Date.now();
    const {
      conversationId,
      personality = 'jarvis',
      message,
      gpsCoords,
      moodOverride,
    } = req.body as {
      conversationId?: string;
      personality: PersonalityId;
      message: string;
      gpsCoords?: { lat: number; lng: number; accuracy?: number } | null;
      moodOverride?: EmotionType;
    };

    if (!message || !message.trim()) {
      res.status(400).json({ error: 'Message cannot be empty.' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const sendEvent = (event: string, data: unknown) => {
      if (!res.writableEnded) {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      }
    };

    try {
      const parsedCommand = await intentDetectionEngine.parse(message);
      const appControl = VoiceAppControlEngine.parseAndApply(message);

      const effectivePersonality: PersonalityId =
        appControl?.switchPersonality || (personality === 'girl' ? 'girl' : 'jarvis');

      let thread = conversationId ? conversationManager.get(conversationId) : undefined;
      if (!thread || thread.personality !== effectivePersonality || appControl?.clearChat) {
        thread = conversationManager.create(effectivePersonality);
      }

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: message.trim(),
        timestamp: new Date().toISOString(),
        personality: effectivePersonality,
        detectedLanguage: parsedCommand.detectedLanguage,
      };
      conversationManager.appendMessage(thread.id, userMsg);
      sendEvent('thread', { threadId: thread.id, userMessage: userMsg });

      if (appControl) {
        sendEvent('appControl', {
          directive: appControl,
          settings: storageStore.getState().settings,
        });
      }

      let executionReport: Awaited<ReturnType<typeof TaskExecutionEngine.runCommandPlan>> | undefined;
      if (parsedCommand.steps.length > 0 || parsedCommand.blockedReason) {
        executionReport = await TaskExecutionEngine.runCommandPlan(parsedCommand, false);
        parsedCommand.steps = executionReport.executedSteps;
        parsedCommand.taskSummary = executionReport.taskSummary;
        sendEvent('command', {
          commandPlan: parsedCommand,
          taskSummary: executionReport.taskSummary,
          awaitingConfirmation: executionReport.awaitingConfirmation,
          screenSummary: executionReport.screenSummary,
        });
      }

      const contextNotes: string[] = [];
      if (appControl && appControl.summaryNotes.length > 0) {
        contextNotes.push(`Internal JARVIS Voice Controls Applied: ${appControl.summaryNotes.join('; ')}`);
      }
      if (parsedCommand.steps.some((s) => s.action === 'read_notifications')) {
        contextNotes.push(`Active Notifications: ${NotificationManager.summarize()}`);
      }
      if (parsedCommand.steps.some((s) => s.action === 'phone_intelligence')) {
        const intel = PhoneIntelligenceManager.summarize();
        contextNotes.push(
          `Authorized Phone Intelligence (DO NOT invent anything outside these verified facts): ${intel.summaryText}`
        );
      }
      if (parsedCommand.steps.some((s) => s.action === 'search_contacts')) {
        const matches = ContactManager.search(message);
        contextNotes.push(
          `Contacts: ${
            matches.length > 0
              ? matches.map((c) => `${c.name} (${c.phone})`).join('; ')
              : 'No matching contacts found.'
          }`
        );
      }
      if (parsedCommand.steps.some((s) => s.action === 'get_gps_location')) {
        contextNotes.push(
          gpsCoords
            ? `GPS Coordinates: ${gpsCoords.lat.toFixed(5)}, ${gpsCoords.lng.toFixed(5)}`
            : 'Device GPS permission not granted; inform the user to enable Location access.'
        );
      }
      if (executionReport && parsedCommand.steps.length > 0) {
        const scr = accessibilityController.getScreenState();
        contextNotes.push(
          `Multi-Task Engine: ${executionReport.taskSummary.completed}/${executionReport.taskSummary.total} verified; ` +
            `Active App=${scr.currentApp}, Brightness=${scr.brightnessPercent}%, Volume=${scr.volumePercent}%, ` +
            `Battery=${scr.batteryPercent}%, Network=${scr.networkStatus}. ` +
            `Steps=${executionReport.executedSteps.map((s) => `${s.action}:${s.status}`).join(', ')}` +
            (executionReport.awaitingConfirmation
              ? `; PAUSED for confirmation: "${parsedCommand.confirmationPrompt}"`
              : '')
        );
      }
      if (parsedCommand.blockedReason) {
        contextNotes.push(`Blocked by Security Policy: ${parsedCommand.blockedReason}`);
      }

      const isSleepCmd = parsedCommand.steps.some((s) => s.action === 'sleep_mode');
      const isShutdownCmd = parsedCommand.steps.some((s) => s.action === 'shutdown_mode');

      if (isSleepCmd || isShutdownCmd) {
        const nextSleepState = isShutdownCmd ? 'SHUTDOWN' : 'SLEEPING';
        storageStore.update((draft) => {
          draft.settings.sleepState = nextSleepState;
        });
        sendEvent('sleepState', { sleepState: nextSleepState });

        const replyText = isShutdownCmd
          ? parsedCommand.detectedLanguage === 'Hindi' || parsedCommand.detectedLanguage === 'Hinglish'
            ? 'System shutdown kar diya gaya hai. Sabhi voice aur background services band hain. Dubara shuru karne ke liye Restart dabaiye.'
            : 'Complete shutdown activated. All voice, AI processing, wake-word, and background listening services are now stopped. Tap Restart JARVIS when you want me back.'
          : parsedCommand.detectedLanguage === 'Hindi' || parsedCommand.detectedLanguage === 'Hinglish'
            ? 'Theek hai, main sleep mode mein ja raha hoon. Dubara bulane ke liye Hey JARVIS kahiye.'
            : 'Entering sleep mode. Audio capture is paused and wake-word standby remains ready when enabled.';

        sendEvent('delta', { text: replyText });
        const latencyMs = Date.now() - startTime;
        const assistantMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: replyText,
          timestamp: new Date().toISOString(),
          personality: effectivePersonality,
          emotion: 'Calm',
          detectedLanguage: parsedCommand.detectedLanguage,
          latencyMs,
          commandPlan: parsedCommand,
        };
        conversationManager.appendMessage(thread.id, assistantMsg);
        sendEvent('done', {
          threadId: thread.id,
          assistantMessage: assistantMsg,
          emotion: 'Calm',
          latencyMs,
          sleepState: nextSleepState,
        });
        res.end();
        return;
      }

      const settings = storageStore.getState().settings;
      const modelConfig = modelSelectionManager.getConfig(effectivePersonality);
      const voiceConfig = modelSelectionManager.getVoiceConfig(effectivePersonality);
      const memoryContext = memoryManager.retrieveRelevant(effectivePersonality, message);

      const currentEmotion =
        appControl?.setMood ||
        emotionEngine.detectUserMood(
          message,
          effectivePersonality,
          moodOverride || settings.characterMoods[effectivePersonality] || 'Normal'
        );

      const emotionDirective = emotionEngine.buildPromptDirective(
        currentEmotion,
        voiceConfig.emotionIntensity ?? 0.85,
        effectivePersonality
      );

      const evolutionDirective = selfEvolutionEngine.buildEvolutionDirective(
        effectivePersonality,
        settings.playfulBanterEnabled !== false
      );

      const liveTimeStr = new Date().toLocaleString('en-IN', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

      const systemPrompt =
        `${modelConfig.systemPrompt}\n${emotionDirective}${memoryContext}${evolutionDirective}` +
        `\nNatural Voice Rule: Speak 100% like a real person in natural Hinglish, Hindi, or English. NEVER refer to yourself as an AI, bot, assistant, or Aria. Strictly ZERO emojis, ZERO emoticons, ZERO asterisks, ZERO markdown.` +
        `\nCreator Rule: Only if directly introducing yourself or asked who created/made you, mention alsmar Boos (Mujhe alsmar Boos ne banaya hai).` +
        `\nCurrent Local Date & Time: ${liveTimeStr}.` +
        (contextNotes.length > 0 ? `\n\nReal-Time Device & Task Context:\n${contextNotes.join('\n')}` : '');

      const historyMessages = thread.messages.slice(-14).map((m) => ({
        role: (m.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
        content: m.content,
      }));

      let providerUsed: ProviderId = modelConfig.provider;
      let modelUsed = modelConfig.model;
      let fullReply = '';
      let prefixBuffer = '';
      let prefixResolved = false;
      let detectedTagEmotion: EmotionType | undefined;

      const emitCleanText = (rawSegment: string) => {
        const noMood = rawSegment.replace(/\[MOOD:[A-Za-z]+\]\s*/gi, '');
        const cleanChunk = AudioProcessingEngine.stripEmojisAndMarkdown(noMood);
        if (cleanChunk) {
          fullReply += cleanChunk;
          sendEvent('delta', { text: cleanChunk });
        }
      };

      const resolvePrefix = (buf: string): string => {
        const trimmedLeft = buf.replace(/^\s+/, '');
        const moodMatch = trimmedLeft.match(/^\[MOOD:([A-Za-z]+)\]\s*/i);
        if (moodMatch) {
          const parsedMood = matchEmotionName(moodMatch[1]);
          if (parsedMood) {
            detectedTagEmotion = parsedMood;
            sendEvent('emotion', { emotion: parsedMood });
          }
          return trimmedLeft.slice(moodMatch[0].length);
        }
        return buf;
      };

      const stream = errorRecoveryEngine.executeWithFallback(
        {
          provider: modelConfig.provider,
          model: modelConfig.model,
          systemPrompt,
          messages: historyMessages,
          thinkingSpeed: modelConfig.thinkingSpeed,
          maxOutputTokens: modelConfig.maxOutputTokens,
        },
        {
          provider: modelConfig.fallbackProvider,
          model: modelConfig.fallbackModel,
        },
        (meta) => {
          providerUsed = meta.providerUsed;
          modelUsed = meta.modelUsed;
        }
      );

      for await (const chunk of stream) {
        if (!prefixResolved) {
          prefixBuffer += chunk;
          const trimmedLeft = prefixBuffer.replace(/^\s+/, '');
          if (trimmedLeft.length > 0 && !trimmedLeft.startsWith('[')) {
            prefixResolved = true;
            emitCleanText(prefixBuffer);
            prefixBuffer = '';
          } else if (trimmedLeft.startsWith('[') && trimmedLeft.includes(']')) {
            const remainder = resolvePrefix(prefixBuffer);
            prefixResolved = true;
            prefixBuffer = '';
            if (remainder) emitCleanText(remainder);
          } else if (prefixBuffer.length > 32) {
            prefixResolved = true;
            emitCleanText(prefixBuffer);
            prefixBuffer = '';
          }
        } else {
          emitCleanText(chunk);
        }
      }

      if (!prefixResolved && prefixBuffer) {
        const remainder = resolvePrefix(prefixBuffer);
        if (remainder) emitCleanText(remainder);
      }

      const latencyMs = Date.now() - startTime;
      const finalEmotion =
        appControl?.setMood ||
        detectedTagEmotion ||
        emotionEngine.detectFromContext(
          message,
          fullReply,
          effectivePersonality,
          settings.characterMoods[effectivePersonality] || 'Normal'
        );

      storageStore.update((draft) => {
        draft.settings.characterMoods[effectivePersonality] = finalEmotion;
        if (draft.settings.sleepState !== 'AWAKE') {
          draft.settings.sleepState = 'AWAKE';
        }
      });

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: fullReply.trim(),
        timestamp: new Date().toISOString(),
        personality: effectivePersonality,
        emotion: finalEmotion,
        detectedLanguage: parsedCommand.detectedLanguage,
        providerUsed,
        modelUsed,
        latencyMs,
        commandPlan: parsedCommand.steps.length > 0 || parsedCommand.blockedReason ? parsedCommand : undefined,
      };
      conversationManager.appendMessage(thread.id, assistantMsg);
      selfEvolutionEngine.processTurn(effectivePersonality, message, fullReply);

      sendEvent('done', {
        threadId: thread.id,
        assistantMessage: assistantMsg,
        emotion: finalEmotion,
        latencyMs,
      });
      res.end();
    } catch (error) {
      const messageText = formatFriendlyProviderError(error);
      loggingDiagnostics.record('AssistantStream', 'ERROR', messageText);
      sendEvent('error', { error: messageText });
      res.end();
    }
  });

  // Proactive Self-Initiated Conversation Endpoint
  app.post('/api/assistant/proactive', async (req, res) => {
    const startTime = Date.now();
    try {
      const { conversationId, personality = 'jarvis' } = req.body as {
        conversationId?: string;
        personality?: PersonalityId;
      };
      const safePersonality: PersonalityId = personality === 'girl' ? 'girl' : 'jarvis';
      const settings = storageStore.getState().settings;
      if (settings.sleepState !== 'AWAKE' || settings.proactiveTalkEnabled === false) {
        res.json({ skipped: true });
        return;
      }

      let thread = conversationId ? conversationManager.get(conversationId) : undefined;
      if (!thread || thread.personality !== safePersonality) {
        const list = conversationManager.list(safePersonality);
        thread = list[0] || conversationManager.create(safePersonality);
      }

      const modelConfig = modelSelectionManager.getConfig(safePersonality);
      const currentEmotion = settings.characterMoods[safePersonality] || 'Happy';
      const evolutionDirective = selfEvolutionEngine.buildEvolutionDirective(
        safePersonality,
        settings.playfulBanterEnabled !== false
      );
      const intel = PhoneIntelligenceManager.summarize();

      const proactivePrompt =
        safePersonality === 'girl'
          ? `${modelConfig.systemPrompt}${evolutionDirective}\n` +
            'Initiate a spontaneous, real-girlfriend check-in with your boyfriend ("baby" or "jaan") in 1-2 short natural Hinglish sentences! Ask logically where he went, why he is quiet, tease him playfully, or act slightly naraz/romantic. NEVER mention AI or Aria. Strictly NO emojis, NO emoticons, NO asterisks.'
          : `${modelConfig.systemPrompt}${evolutionDirective}\n` +
            'Initiate a brief, witty Tony-Stark Iron Man JARVIS check-in addressing Sir/Boss in 1-2 short natural sentences. NEVER say you are an AI. Strictly NO emojis, NO emoticons, NO asterisks.';

      const historyMessages = thread.messages.slice(-6).map((m) => ({
        role: (m.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
        content: m.content,
      }));

      let providerUsed: ProviderId = modelConfig.provider;
      let modelUsed = modelConfig.model;
      let text = '';

      const stream = errorRecoveryEngine.executeWithFallback(
        {
          provider: modelConfig.provider,
          model: settings.autoModelSelection ? 'auto' : modelConfig.model,
          systemPrompt: proactivePrompt,
          messages: [
            ...historyMessages,
            {
              role: 'user',
              content:
                safePersonality === 'girl'
                  ? `[System Auto-Check-In] Boyfriend thodi der se chup hai. Khud aakar apni girlfriend wali logical baat puchho (jaise aaj kahan the, itni der kyon laga rahe ho, khana khaya ya naraz/romantic mood mein puchho). Device: ${intel.batteryPercent}% battery.`
                  : `[System Auto-Check-In] User is idle. Deliver a brief, witty Iron Man JARVIS status check-in. Device note: ${intel.batteryPercent}% battery, ${intel.unreadNotifications.length} notifications.`,
            },
          ],
          thinkingSpeed: 'LOW',
          maxOutputTokens: 600,
        },
        {
          provider: modelConfig.fallbackProvider,
          model: modelConfig.fallbackModel,
        },
        (meta) => {
          providerUsed = meta.providerUsed;
          modelUsed = meta.modelUsed;
        }
      );

      for await (const chunk of stream) {
        text += AudioProcessingEngine.stripEmojisAndMarkdown(chunk);
      }

      let proactiveEmotion: EmotionType = currentEmotion;
      const moodMatch = text.trimStart().match(/^\[MOOD:([A-Za-z]+)\]\s*/i);
      if (moodMatch) {
        const parsed = matchEmotionName(moodMatch[1]);
        if (parsed) proactiveEmotion = parsed;
      }
      const cleanText = text.replace(/\[MOOD:[A-Za-z]+\]\s*/gi, '').trim();
      if (!cleanText) {
        res.json({ skipped: true });
        return;
      }

      if (proactiveEmotion !== currentEmotion) {
        storageStore.update((draft) => {
          draft.settings.characterMoods[safePersonality] = proactiveEmotion;
        });
      }

      const msg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: cleanText,
        timestamp: new Date().toISOString(),
        personality: safePersonality,
        emotion: proactiveEmotion,
        providerUsed,
        modelUsed,
        latencyMs: Date.now() - startTime,
      };
      conversationManager.appendMessage(thread.id, msg);
      res.json({ threadId: thread.id, assistantMessage: msg });
    } catch (error) {
      res.status(500).json({ error: formatFriendlyProviderError(error) });
    }
  });

  app.post('/api/automation/confirm', async (req, res) => {
    const { commandPlan } = req.body as { commandPlan: ParsedCommand };
    if (!commandPlan) {
      res.status(400).json({ error: 'commandPlan is required' });
      return;
    }
    const report = await TaskExecutionEngine.runCommandPlan(commandPlan, true);
    res.json(report);
  });

  app.get('/api/automation/screen', (_req, res) => {
    res.json(accessibilityController.getScreenState());
  });

  app.get('/api/automation/history', (_req, res) => {
    res.json(storageStore.getState().commandHistory);
  });

  app.get('/api/phone/intelligence', (req, res) => {
    const notificationsAuthorized = req.query.notificationsAuthorized !== 'false';
    const callLogAuthorized = req.query.callLogAuthorized !== 'false';
    res.json(PhoneIntelligenceManager.summarize({ notificationsAuthorized, callLogAuthorized }));
  });

  // Voice STT & TTS
  app.post('/api/voice/transcribe', async (req, res) => {
    try {
      const { audioBase64, mimeType, language, sttProvider } = req.body as {
        audioBase64: string;
        mimeType?: string;
        language?: 'auto' | 'en-US' | 'en-IN' | 'hi-IN';
        sttProvider?: SttProviderId;
      };
      if (!audioBase64) {
        res.status(400).json({ error: 'audioBase64 is required' });
        return;
      }
      const effectiveProvider = sttProvider || storageStore.getState().settings.sttProvider || 'auto';
      const result = await voiceRecognitionEngine.transcribeAudio(
        audioBase64,
        mimeType,
        language,
        effectiveProvider
      );
      res.json(result);
    } catch (error) {
      const msg = formatFriendlyProviderError(error);
      loggingDiagnostics.record('VoiceTranscribe', 'ERROR', msg);
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/voice/tts', async (req, res) => {
    try {
      const { text, personality = 'jarvis', emotion = 'Normal', voiceOverride } = req.body as {
        text: string;
        personality: PersonalityId;
        emotion?: EmotionType;
        voiceOverride?: Partial<VoiceSettings>;
      };
      const baseVoice = modelSelectionManager.getVoiceConfig(personality);
      const effectiveVoice: VoiceSettings = voiceOverride
        ? { ...baseVoice, ...voiceOverride }
        : baseVoice;
      const result = await textToSpeechEngine.synthesize(text, personality, effectiveVoice, emotion);
      res.json(result);
    } catch (error) {
      const msg = formatFriendlyProviderError(error);
      loggingDiagnostics.record('VoiceTTS', 'ERROR', msg);
      res.status(500).json({ error: msg });
    }
  });

  app.get('/api/permissions/catalog', (_req, res) => {
    res.json(PermissionManager.getDefaultCatalog());
  });

  app.get('/api/notifications', (_req, res) => {
    res.json(NotificationManager.list());
  });

  app.post('/api/notifications/:id/read', (req, res) => {
    NotificationManager.markRead(req.params.id);
    res.json({ ok: true });
  });

  app.get('/api/contacts', (req, res) => {
    res.json(ContactManager.search(req.query.q as string | undefined));
  });

  app.get('/api/diagnostics', (_req, res) => {
    res.json(loggingDiagnostics.list());
  });

  app.delete('/api/diagnostics', (_req, res) => {
    loggingDiagnostics.clear();
    res.json({ cleared: true });
  });

  app.get('/api/android-project', (_req, res) => {
    const androidDir = path.resolve(process.cwd(), 'android');
    const files = collectAndroidFiles(androidDir, androidDir);
    res.json({ root: 'android/', fileCount: files.length, files });
  });

  app.get('/api/android-project/download', (_req, res) => {
    const androidDir = path.resolve(process.cwd(), 'android');
    const zipBuffer = buildZipFromDirectory(androidDir);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="jarvis-ai-android.zip"');
    res.setHeader('Content-Length', String(zipBuffer.length));
    res.send(zipBuffer);
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
        watch: null,
      },
      plugins: [
        {
          name: 'jarvis-disable-client-hmr-ws',
          transform(code, id) {
            if (id.includes('vite/dist/client/client.mjs')) {
              return code.replace(
                /transport\.connect\(createHMRHandler\(handleMessage\)\);?/g,
                '/* HMR disabled: WebSocket skipped */'
              );
            }
            return null;
          },
        },
      ],
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    loggingDiagnostics.record('Server', 'INFO', `JARVIS AI server listening on http://0.0.0.0:${PORT}`);
    console.log(`JARVIS AI running at http://localhost:${PORT}`);
  });
}

bootstrap();
