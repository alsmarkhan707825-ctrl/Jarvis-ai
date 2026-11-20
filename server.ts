import 'dotenv/config';
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
import { conversationManager } from './server/modules/conversationManager.ts';
import {
  ContactManager,
  NotificationManager,
  PermissionManager,
  PhoneIntelligenceManager,
  TaskExecutionEngine,
} from './server/modules/deviceManagers.ts';
import { emotionEngine } from './server/modules/emotionEngine.ts';
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

const PORT = Number(process.env.PORT || 3000);

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
      if (patch.characterMoods) {
        draft.settings.characterMoods = { ...draft.settings.characterMoods, ...patch.characterMoods };
      }
      if (patch.jarvisModel) draft.settings.jarvisModel = { ...draft.settings.jarvisModel, ...patch.jarvisModel };
      if (patch.normalModel) draft.settings.normalModel = { ...draft.settings.normalModel, ...patch.normalModel };
      if (patch.jadavisModel) draft.settings.jadavisModel = { ...draft.settings.jadavisModel, ...patch.jadavisModel };
      if (patch.girlModel) draft.settings.girlModel = { ...draft.settings.girlModel, ...patch.girlModel };
      if (patch.jarvisVoice) draft.settings.jarvisVoice = { ...draft.settings.jarvisVoice, ...patch.jarvisVoice };
      if (patch.normalVoice) draft.settings.normalVoice = { ...draft.settings.normalVoice, ...patch.normalVoice };
      if (patch.jadavisVoice) draft.settings.jadavisVoice = { ...draft.settings.jadavisVoice, ...patch.jadavisVoice };
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
      if (patch.customProviderBaseUrl !== undefined) draft.settings.customProviderBaseUrl = patch.customProviderBaseUrl;
      if (patch.customProviderModel !== undefined) draft.settings.customProviderModel = patch.customProviderModel;
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
    res.json(aiProviderManager.getVoiceKeyStatuses());
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
      let thread = conversationId ? conversationManager.get(conversationId) : undefined;
      if (!thread || thread.personality !== personality) {
        thread = conversationManager.create(personality);
      }

      const parsedCommand = await intentDetectionEngine.parse(message);
      const appControl = VoiceAppControlEngine.parseAndApply(message);

      const effectivePersonality = appControl?.switchPersonality || personality;

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
          personality,
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
      const modelConfig = modelSelectionManager.getConfig(personality);
      const voiceConfig = modelSelectionManager.getVoiceConfig(personality);
      const memoryContext = memoryManager.retrieveRelevant(personality, message);

      const currentEmotion =
        moodOverride ||
        emotionEngine.detectFromContext(
          message,
          '',
          personality,
          settings.characterMoods[personality] || 'Normal'
        );

      const emotionDirective = emotionEngine.buildPromptDirective(
        currentEmotion,
        voiceConfig.emotionIntensity ?? 0.8
      );

      const evolutionDirective = selfEvolutionEngine.buildEvolutionDirective(
        personality,
        settings.playfulBanterEnabled !== false
      );

      const systemPrompt =
        `${modelConfig.systemPrompt}\n${emotionDirective}${memoryContext}${evolutionDirective}` +
        (contextNotes.length > 0 ? `\n\nReal-Time Device & Task Context:\n${contextNotes.join('\n')}` : '');

      const historyMessages = thread.messages.slice(-14).map((m) => ({
        role: (m.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
        content: m.content,
      }));

      let providerUsed: ProviderId = modelConfig.provider;
      let modelUsed = modelConfig.model;
      let fullReply = '';

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
        fullReply += chunk;
        sendEvent('delta', { text: chunk });
      }

      const latencyMs = Date.now() - startTime;
      const finalEmotion =
        moodOverride ||
        emotionEngine.detectFromContext(
          message,
          fullReply,
          personality,
          settings.characterMoods[personality] || 'Normal'
        );

      storageStore.update((draft) => {
        draft.settings.characterMoods[personality] = finalEmotion;
        if (draft.settings.sleepState !== 'AWAKE') {
          draft.settings.sleepState = 'AWAKE';
        }
      });

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: fullReply.trim(),
        timestamp: new Date().toISOString(),
        personality,
        emotion: finalEmotion,
        detectedLanguage: parsedCommand.detectedLanguage,
        providerUsed,
        modelUsed,
        latencyMs,
        commandPlan: parsedCommand.steps.length > 0 || parsedCommand.blockedReason ? parsedCommand : undefined,
      };
      conversationManager.appendMessage(thread.id, assistantMsg);
      selfEvolutionEngine.processTurn(personality, message, fullReply);

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
      const settings = storageStore.getState().settings;
      if (settings.sleepState !== 'AWAKE' || settings.proactiveTalkEnabled === false) {
        res.json({ skipped: true });
        return;
      }

      let thread = conversationId ? conversationManager.get(conversationId) : undefined;
      if (!thread || thread.personality !== personality) {
        const list = conversationManager.list(personality);
        thread = list[0] || conversationManager.create(personality);
      }

      const modelConfig = modelSelectionManager.getConfig(personality);
      const currentEmotion = settings.characterMoods[personality] || 'Happy';
      const evolutionDirective = selfEvolutionEngine.buildEvolutionDirective(
        personality,
        settings.playfulBanterEnabled !== false
      );
      const intel = PhoneIntelligenceManager.summarize();

      const proactivePrompt =
        `${modelConfig.systemPrompt}${evolutionDirective}\n` +
        'Initiate a brief, natural, spontaneous conversation check-in (1-2 sentences max) in Hinglish or English. ' +
        'Tease the user lightly, share a playful thought, ask what they are up to, or tease them about taking a break—stay warm, fun, and natural.';

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
                `[System Auto-Check-In Trigger] Initiate a spontaneous, playful chat with the user right now. Device note: ${intel.batteryPercent}% battery, ${intel.unreadNotifications.length} notifications.`,
            },
          ],
          thinkingSpeed: 'LOW',
          maxOutputTokens: 160,
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
        text += chunk;
      }

      const cleanText = text.trim();
      if (!cleanText) {
        res.json({ skipped: true });
        return;
      }

      const msg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: cleanText,
        timestamp: new Date().toISOString(),
        personality,
        emotion: currentEmotion,
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

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
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
