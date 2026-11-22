import crypto from 'crypto';
import type { ChatMessage, ConversationThread, PersonalityId } from '../../src/types/jarvis.ts';
import { storageStore } from './storageStore.ts';

class ConversationManager {
  list(personality?: PersonalityId, query?: string): ConversationThread[] {
    let items = [...storageStore.getState().conversations];
    if (personality) {
      items = items.filter((c) => c.personality === personality);
    }
    if (query && query.trim()) {
      const q = query.trim().toLowerCase();
      items = items.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.messages.some((m) => m.content.toLowerCase().includes(q))
      );
    }
    return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  get(id: string): ConversationThread | undefined {
    return storageStore.getState().conversations.find((c) => c.id === id);
  }

  create(personality: PersonalityId, initialTitle?: string): ConversationThread {
    const now = new Date().toISOString();
    const defaultTitle = personality === 'girl' ? 'New AI Girl Session' : 'New JARVIS Session';
    const thread: ConversationThread = {
      id: crypto.randomUUID(),
      title: initialTitle?.trim() || defaultTitle,
      personality,
      createdAt: now,
      updatedAt: now,
      messages: [],
    };
    storageStore.update((draft) => {
      draft.conversations.unshift(thread);
    });
    return thread;
  }

  appendMessage(threadId: string, message: ChatMessage): ConversationThread {
    let updated: ConversationThread | undefined;
    storageStore.update((draft) => {
      const target = draft.conversations.find((c) => c.id === threadId);
      if (!target) return;
      target.messages.push(message);
      target.updatedAt = message.timestamp;
      if (
        message.role === 'user' &&
        (target.title === 'New JARVIS Session' ||
          target.title === 'New AI Girl Session' ||
          target.title === 'New Companion Chat')
      ) {
        target.title = message.content.slice(0, 48).trim() || target.title;
      }
      updated = target;
    });
    if (!updated) throw new Error('Conversation thread not found.');
    return updated;
  }

  rename(id: string, title: string): ConversationThread {
    let updated: ConversationThread | undefined;
    storageStore.update((draft) => {
      const target = draft.conversations.find((c) => c.id === id);
      if (target) {
        target.title = title.trim().slice(0, 80) || target.title;
        target.updatedAt = new Date().toISOString();
        updated = target;
      }
    });
    if (!updated) throw new Error('Conversation not found.');
    return updated;
  }

  delete(id: string): boolean {
    let removed = false;
    storageStore.update((draft) => {
      const before = draft.conversations.length;
      draft.conversations = draft.conversations.filter((c) => c.id !== id);
      removed = draft.conversations.length < before;
    });
    return removed;
  }
}

export const conversationManager = new ConversationManager();
