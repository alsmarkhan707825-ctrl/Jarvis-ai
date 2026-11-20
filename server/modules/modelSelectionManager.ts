import type { PersonalityId, PersonalityModelConfig, VoiceSettings } from '../../src/types/jarvis.ts';
import { storageStore } from './storageStore.ts';

class ModelSelectionManager {
  getConfig(personality: PersonalityId): PersonalityModelConfig {
    const settings = storageStore.getState().settings;
    if (personality === 'normal') return settings.normalModel;
    if (personality === 'jadavis') return settings.jadavisModel;
    if (personality === 'girl') return settings.girlModel;
    return settings.jarvisModel;
  }

  getVoiceConfig(personality: PersonalityId): VoiceSettings {
    const settings = storageStore.getState().settings;
    if (personality === 'normal') return settings.normalVoice;
    if (personality === 'jadavis') return settings.jadavisVoice;
    if (personality === 'girl') return settings.girlVoice;
    return settings.jarvisVoice;
  }

  updateConfig(personality: PersonalityId, patch: Partial<PersonalityModelConfig>): PersonalityModelConfig {
    storageStore.update((draft) => {
      if (personality === 'normal') {
        draft.settings.normalModel = { ...draft.settings.normalModel, ...patch };
      } else if (personality === 'jadavis') {
        draft.settings.jadavisModel = { ...draft.settings.jadavisModel, ...patch };
      } else if (personality === 'girl') {
        draft.settings.girlModel = { ...draft.settings.girlModel, ...patch };
      } else {
        draft.settings.jarvisModel = { ...draft.settings.jarvisModel, ...patch };
      }
    });
    return this.getConfig(personality);
  }
}

export const modelSelectionManager = new ModelSelectionManager();
