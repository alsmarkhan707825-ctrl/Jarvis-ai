import type { PersonalityId, PersonalityModelConfig, VoiceSettings } from '../../src/types/jarvis.ts';
import { storageStore } from './storageStore.ts';

class ModelSelectionManager {
  getConfig(personality: PersonalityId): PersonalityModelConfig {
    const settings = storageStore.getState().settings;
    return personality === 'girl' ? settings.girlModel : settings.jarvisModel;
  }

  getVoiceConfig(personality: PersonalityId): VoiceSettings {
    const settings = storageStore.getState().settings;
    return personality === 'girl' ? settings.girlVoice : settings.jarvisVoice;
  }

  updateConfig(personality: PersonalityId, patch: Partial<PersonalityModelConfig>): PersonalityModelConfig {
    storageStore.update((draft) => {
      if (personality === 'girl') {
        draft.settings.girlModel = { ...draft.settings.girlModel, ...patch };
      } else {
        draft.settings.jarvisModel = { ...draft.settings.jarvisModel, ...patch };
      }
    });
    return this.getConfig(personality);
  }
}

export const modelSelectionManager = new ModelSelectionManager();
