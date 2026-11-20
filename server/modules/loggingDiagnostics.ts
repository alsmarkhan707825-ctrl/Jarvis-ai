import crypto from 'crypto';
import type { DiagnosticLogEntry } from '../../src/types/jarvis.ts';
import { ApiSecurityManager } from './apiSecurityManager.ts';

const MAX_LOGS = 200;

class LoggingDiagnostics {
  private logs: DiagnosticLogEntry[] = [];

  record(
    module: string,
    level: 'INFO' | 'WARN' | 'ERROR',
    message: string,
    details?: string
  ): DiagnosticLogEntry {
    const entry: DiagnosticLogEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      module,
      level,
      message: ApiSecurityManager.redactSecrets(message),
      details: details ? ApiSecurityManager.redactSecrets(details) : undefined,
    };
    this.logs.unshift(entry);
    if (this.logs.length > MAX_LOGS) {
      this.logs.length = MAX_LOGS;
    }
    return entry;
  }

  list(level?: 'INFO' | 'WARN' | 'ERROR'): DiagnosticLogEntry[] {
    if (!level) return [...this.logs];
    return this.logs.filter((l) => l.level === level);
  }

  clear(): void {
    this.logs = [];
  }
}

export const loggingDiagnostics = new LoggingDiagnostics();
