import crypto from 'crypto';
import type { MemoryCategory, MemoryEntry, PersonalityId } from '../../src/types/jarvis.ts';
import { loggingDiagnostics } from './loggingDiagnostics.ts';
import { storageStore } from './storageStore.ts';

const SENSITIVE_PATTERN = /\b(password|passcode|pin|otp|cvv|credit card|ssn|aadhaar|bank account|secret key|private key)\b/i;

class MemoryManager {
  list(personality?: PersonalityId, query?: string): MemoryEntry[] {
    let items = [...storageStore.getState().memories];
    if (personality) {
      items = items.filter((m) => m.personality === personality);
    }
    if (query && query.trim()) {
      const tokens = query
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length > 1);
      items = items
        .map((m) => {
          const hay = `${m.key} ${m.value} ${m.category}`.toLowerCase();
          const score = tokens.reduce((acc, tk) => (hay.includes(tk) ? acc + 1 : acc), 0);
          return { m, score };
        })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((x) => x.m);
    }
    return items;
  }

  retrieveRelevant(personality: PersonalityId, promptText: string): string {
    const all = storageStore.getState().memories.filter((m) => m.personality === personality && m.userApproved);
    if (all.length === 0) return '';
    const tokens = promptText
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 2);

    const scored = all
      .map((m) => {
        const hay = `${m.key} ${m.value}`.toLowerCase();
        const hits = tokens.reduce((acc, tk) => (hay.includes(tk) ? acc + 1 : acc), 0);
        return { m, hits };
      })
      .sort((a, b) => b.hits - a.hits || b.m.updatedAt.localeCompare(a.m.updatedAt))
      .slice(0, 10)
      .map((x) => `- [${x.m.category}] ${x.m.key}: ${x.m.value}`);

    return `\n\nCharacter Memory (${personality.toUpperCase()}):\n${scored.join('\n')}`;
  }

  add(params: {
    personality: PersonalityId;
    category: MemoryCategory;
    key: string;
    value: string;
    userApproved: boolean;
  }): MemoryEntry {
    if (!params.userApproved) {
      throw new Error('Explicit user permission is required before saving memory.');
    }
    if (SENSITIVE_PATTERN.test(params.key) || SENSITIVE_PATTERN.test(params.value)) {
      throw new Error('Sensitive credentials (passwords, OTPs, financial IDs) cannot be stored in memory.');
    }

    const normKey = params.key.trim().toLowerCase();
    const normVal = params.value.trim().toLowerCase();
    const existing = storageStore
      .getState()
      .memories.find(
        (m) =>
          m.personality === params.personality &&
          (m.key.trim().toLowerCase() === normKey || m.value.trim().toLowerCase() === normVal)
      );

    if (existing) {
      return this.update(existing.id, {
        key: params.key,
        value: params.value,
        category: params.category,
      });
    }

    const now = new Date().toISOString();
    const entry: MemoryEntry = {
      id: crypto.randomUUID(),
      personality: params.personality,
      category: params.category,
      key: params.key.trim().slice(0, 80),
      value: params.value.trim().slice(0, 500),
      userApproved: true,
      createdAt: now,
      updatedAt: now,
    };
    storageStore.update((draft) => {
      draft.memories.unshift(entry);
    });
    loggingDiagnostics.record('MemoryManager', 'INFO', `Saved ${params.personality} memory: ${entry.key}`);
    return entry;
  }

  update(id: string, patch: { key?: string; value?: string; category?: MemoryCategory }): MemoryEntry {
    if (
      (patch.key && SENSITIVE_PATTERN.test(patch.key)) ||
      (patch.value && SENSITIVE_PATTERN.test(patch.value))
    ) {
      throw new Error('Sensitive credentials cannot be stored in memory.');
    }
    let updated: MemoryEntry | undefined;
    storageStore.update((draft) => {
      const target = draft.memories.find((m) => m.id === id);
      if (target) {
        if (patch.key !== undefined) target.key = patch.key.trim().slice(0, 80);
        if (patch.value !== undefined) target.value = patch.value.trim().slice(0, 500);
        if (patch.category !== undefined) target.category = patch.category;
        target.updatedAt = new Date().toISOString();
        updated = target;
      }
    });
    if (!updated) throw new Error('Memory entry not found.');
    return updated;
  }

  delete(id: string): boolean {
    let removed = false;
    storageStore.update((draft) => {
      const before = draft.memories.length;
      draft.memories = draft.memories.filter((m) => m.id !== id);
      removed = draft.memories.length < before;
    });
    return removed;
  }

  exportJson(personality?: PersonalityId): string {
    const list = this.list(personality);
    return JSON.stringify({ exportedAt: new Date().toISOString(), entries: list }, null, 2);
  }
}

export const memoryManager = new MemoryManager();
