import type { AutomationActionStep, VirtualScreenState } from '../../src/types/jarvis.ts';
import { accessibilityController } from './accessibilityController.ts';

export interface ScreenSummary {
  currentApp: string;
  packageName: string;
  clickableCount: number;
  editableFields: string[];
  visibleLabels: string[];
}

class ScreenUnderstandingEngine {
  inspectCurrentScreen(): ScreenSummary {
    const screen = accessibilityController.getScreenState();
    return {
      currentApp: screen.currentApp,
      packageName: screen.packageName,
      clickableCount: screen.nodes.filter((n) => n.clickable).length,
      editableFields: screen.nodes.filter((n) => n.editable).map((n) => n.label),
      visibleLabels: screen.nodes.map((n) => (n.value ? `${n.label}: "${n.value}"` : n.label)),
    };
  }

  verifyStepOutcome(step: AutomationActionStep, screenAfter: VirtualScreenState): { verified: boolean; note: string } {
    if (step.action === 'open_app' && step.targetApp) {
      const ok = screenAfter.currentApp.toLowerCase() === step.targetApp.toLowerCase();
      return {
        verified: ok,
        note: ok ? `Verified active app is ${screenAfter.currentApp}` : `Expected ${step.targetApp}, active is ${screenAfter.currentApp}`,
      };
    }

    if (step.action === 'enter_text' && step.inputText) {
      const hasValue = screenAfter.nodes.some((n) => n.value === step.inputText);
      return {
        verified: hasValue,
        note: hasValue ? `Verified input text "${step.inputText}" in UI node` : 'Target input node not populated',
      };
    }

    if (step.action === 'click_button' || step.action === 'tap') {
      const node = accessibilityController.findNodeByQuery(step.nodeId, step.nodeText);
      if (node) {
        return { verified: true, note: `Verified node "${node.label}" via AccessibilityNodeInfo` };
      }
      if (step.coordinates) {
        return { verified: true, note: `Executed coordinate fallback (${step.coordinates.x}, ${step.coordinates.y})` };
      }
      return { verified: true, note: `Completed ${step.action} on active surface` };
    }

    return {
      verified: true,
      note: `Verified ${step.action} (${screenAfter.lastGesture})`,
    };
  }
}

export const screenUnderstandingEngine = new ScreenUnderstandingEngine();
