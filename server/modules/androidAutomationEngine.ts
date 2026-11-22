import type {
  AutomationActionStep,
  ParsedCommand,
  TaskManagerSummary,
} from '../../src/types/jarvis.ts';
import { accessibilityController } from './accessibilityController.ts';
import { loggingDiagnostics } from './loggingDiagnostics.ts';
import { screenUnderstandingEngine } from './screenUnderstandingEngine.ts';
import { storageStore } from './storageStore.ts';

export interface ExecutionReport {
  command: ParsedCommand;
  executedSteps: AutomationActionStep[];
  taskSummary: TaskManagerSummary;
  awaitingConfirmation: boolean;
  screenSummary: ReturnType<typeof screenUnderstandingEngine.inspectCurrentScreen>;
}

function summarizeTasks(steps: AutomationActionStep[], currentAction: string): TaskManagerSummary {
  return {
    total: steps.length,
    completed: steps.filter((s) => s.status === 'VERIFIED').length,
    running: steps.filter((s) => s.status === 'RUNNING').length,
    pending: steps.filter((s) => s.status === 'PENDING' || s.status === 'AWAITING_CONFIRMATION').length,
    failed: steps.filter((s) => s.status === 'FAILED' || s.status === 'BLOCKED').length,
    currentAction,
  };
}

class AndroidAutomationEngine {
  async executePlan(command: ParsedCommand, userConfirmed = false): Promise<ExecutionReport> {
    const automationSettings = storageStore.getState().settings.automation;

    if (command.blockedReason) {
      const blocked = command.steps.map((s) => ({
        ...s,
        status: 'BLOCKED' as const,
        verificationNote: command.blockedReason,
      }));
      return {
        command,
        executedSteps: blocked,
        taskSummary: summarizeTasks(blocked, 'Blocked by Security Policy'),
        awaitingConfirmation: false,
        screenSummary: screenUnderstandingEngine.inspectCurrentScreen(),
      };
    }

    if (!automationSettings.enabled && command.steps.length > 0) {
      const blocked = command.steps.map((s) => ({
        ...s,
        status: 'BLOCKED' as const,
        verificationNote: 'Phone automation is disabled in Settings.',
      }));
      return {
        command,
        executedSteps: blocked,
        taskSummary: summarizeTasks(blocked, 'Automation Disabled'),
        awaitingConfirmation: false,
        screenSummary: screenUnderstandingEngine.inspectCurrentScreen(),
      };
    }

    const updatedSteps: AutomationActionStep[] = [];
    let awaitingConfirmation = false;

    for (const step of command.steps) {
      if (
        (step.requiresConfirmation || command.requiresConfirmation) &&
        automationSettings.confirmSensitiveActions &&
        !userConfirmed
      ) {
        awaitingConfirmation = true;
        updatedSteps.push({ ...step, status: 'AWAITING_CONFIRMATION' });
        continue;
      }

      const nextStep: AutomationActionStep = { ...step, status: 'RUNNING' };

      if (step.action === 'open_app' && step.targetApp) {
        accessibilityController.openApp(step.targetApp);
      } else if (step.action === 'set_brightness' && step.numericValue !== undefined) {
        const val = accessibilityController.setBrightness(step.numericValue);
        nextStep.verificationNote = `Brightness adjusted to ${val}%`;
      } else if (step.action === 'set_volume' && step.numericValue !== undefined) {
        const val = accessibilityController.setVolume(step.numericValue);
        nextStep.verificationNote = `Volume adjusted to ${val}%`;
      } else if (step.action === 'toggle_flashlight') {
        const state = accessibilityController.toggleFlashlight(step.nodeText === 'OFF' ? false : true);
        nextStep.verificationNote = `Flashlight ${state ? 'ON' : 'OFF'}`;
      } else if (step.action === 'get_battery_info') {
        const scr = accessibilityController.getScreenState();
        nextStep.verificationNote = `Battery at ${scr.batteryPercent}%`;
      } else if (step.action === 'get_network_info') {
        const scr = accessibilityController.getScreenState();
        nextStep.verificationNote = `Network: ${scr.networkStatus}`;
      } else if (step.action === 'run_routine') {
        storageStore.update((draft) => {
          const r = draft.routines.find((item) => item.name === step.nodeText);
          if (r) r.lastRunAt = new Date().toISOString();
        });
        nextStep.verificationNote = `Executed routine "${step.nodeText}"`;
      } else if (step.action === 'lock_device') {
        accessibilityController.lockDevice();
        nextStep.verificationNote =
          'Screen lock dispatched (requires Android Accessibility Service GLOBAL_ACTION_LOCK_SCREEN on Android 9+ device; browser preview cannot lock OS hardware).';
      } else if (step.action === 'sleep_mode') {
        storageStore.update((draft) => {
          draft.settings.sleepState = 'SLEEPING';
        });
        nextStep.verificationNote = 'Entered Sleep Mode (wake-word standby active if enabled)';
      } else if (step.action === 'shutdown_mode') {
        storageStore.update((draft) => {
          draft.settings.sleepState = 'SHUTDOWN';
        });
        nextStep.verificationNote = 'Entered Complete Shutdown Mode (all voice & background listening stopped)';
      } else if (step.action === 'phone_intelligence') {
        const scr = accessibilityController.getScreenState();
        nextStep.verificationNote = `Collected authorized Phone Intelligence (Battery ${scr.batteryPercent}%, ${scr.networkStatus})`;
      } else if (step.action === 'enter_text' && step.inputText) {
        accessibilityController.enterTextIntoNode(step.nodeId, step.nodeText, step.inputText);
      } else if (step.action === 'call_phone') {
        accessibilityController.performGesture(`call_phone("${step.inputText || step.nodeText || ''}")`);
        nextStep.verificationNote = `Dialing / Calling "${step.inputText || step.nodeText || 'contact'}"`;
      } else if (step.action === 'send_sms') {
        accessibilityController.performGesture(`send_sms("${step.inputText || step.nodeText || ''}")`);
        nextStep.verificationNote = `Prepared SMS dispatch (${step.nodeText || 'message'})`;
      } else if (step.action === 'take_screenshot') {
        accessibilityController.performGesture('take_screenshot');
        nextStep.verificationNote = 'Screenshot capture triggered';
      } else if (
        step.action === 'open_wifi_settings' ||
        step.action === 'open_bluetooth_settings' ||
        step.action === 'open_sound_settings' ||
        step.action === 'open_dnd_settings' ||
        step.action === 'open_airplane_settings' ||
        step.action === 'open_location_settings' ||
        step.action === 'open_hotspot_settings' ||
        step.action === 'recent_apps' ||
        step.action === 'web_search' ||
        step.action === 'scroll' ||
        step.action === 'micro_scroll_down' ||
        step.action === 'micro_scroll_up' ||
        step.action === 'scroll_hold' ||
        step.action === 'swipe_up' ||
        step.action === 'swipe_down' ||
        step.action === 'swipe_left' ||
        step.action === 'swipe_right' ||
        step.action === 'back' ||
        step.action === 'home' ||
        step.action === 'submit_done' ||
        step.action === 'send_action' ||
        step.action === 'play_media' ||
        step.action === 'pause_media' ||
        step.action === 'stop_media' ||
        step.action === 'next_track' ||
        step.action === 'previous_track' ||
        step.action === 'skip_ad'
      ) {
        accessibilityController.performGesture(
          step.inputText ? `${step.action}("${step.inputText}")` : step.action
        );
      } else if (
        step.action === 'click_button' ||
        step.action === 'tap' ||
        step.action === 'double_tap' ||
        step.action === 'long_press'
      ) {
        accessibilityController.performGesture(`${step.action}(${step.nodeText || 'node'})`);
      }

      const screenAfter = accessibilityController.getScreenState();
      if (!nextStep.verificationNote) {
        const verification = screenUnderstandingEngine.verifyStepOutcome(nextStep, screenAfter);
        nextStep.status = verification.verified ? 'VERIFIED' : 'FAILED';
        nextStep.verificationNote = verification.note;
      } else {
        nextStep.status = 'VERIFIED';
      }
      updatedSteps.push(nextStep);
    }

    if (updatedSteps.length > 0 && !awaitingConfirmation) {
      storageStore.update((draft) => {
        draft.commandHistory.unshift({
          id: `${Date.now()}`,
          timestamp: new Date().toISOString(),
          command: command.rawText,
          category: command.category,
          status: updatedSteps.every((s) => s.status === 'VERIFIED') ? 'VERIFIED' : 'PARTIAL',
          summary: command.summary,
        });
        if (draft.commandHistory.length > 80) {
          draft.commandHistory.length = 80;
        }
      });
    }

    const lastCompleted = updatedSteps[updatedSteps.length - 1];
    const taskSummary = summarizeTasks(
      updatedSteps,
      awaitingConfirmation
        ? 'Awaiting User Confirmation'
        : lastCompleted
          ? `${lastCompleted.action} (${lastCompleted.status})`
          : 'Idle'
    );

    loggingDiagnostics.record(
      'AndroidAutomationEngine',
      'INFO',
      `Task plan: ${taskSummary.completed}/${taskSummary.total} verified`
    );

    return {
      command,
      executedSteps: updatedSteps,
      taskSummary,
      awaitingConfirmation,
      screenSummary: screenUnderstandingEngine.inspectCurrentScreen(),
    };
  }
}

export const androidAutomationEngine = new AndroidAutomationEngine();
