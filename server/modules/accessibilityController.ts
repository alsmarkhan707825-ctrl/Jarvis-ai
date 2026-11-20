import type { VirtualScreenNode, VirtualScreenState } from '../../src/types/jarvis.ts';
import { loggingDiagnostics } from './loggingDiagnostics.ts';

const APP_TEMPLATES: Record<string, { packageName: string; activityName: string; nodes: VirtualScreenNode[] }> = {
  Home: {
    packageName: 'com.google.android.apps.nexuslauncher',
    activityName: 'LauncherActivity',
    nodes: [
      { nodeId: 'home:search', type: 'input', label: 'Search apps & web', bounds: { x: 40, y: 120, w: 320, h: 48 }, clickable: true, editable: true },
      { nodeId: 'home:yt', type: 'button', label: 'YouTube', bounds: { x: 40, y: 220, w: 72, h: 72 }, clickable: true, editable: false },
      { nodeId: 'home:chrome', type: 'button', label: 'Chrome', bounds: { x: 140, y: 220, w: 72, h: 72 }, clickable: true, editable: false },
      { nodeId: 'home:ig', type: 'button', label: 'Instagram', bounds: { x: 240, y: 220, w: 72, h: 72 }, clickable: true, editable: false },
      { nodeId: 'home:msg', type: 'button', label: 'Messages', bounds: { x: 40, y: 310, w: 72, h: 72 }, clickable: true, editable: false },
    ],
  },
  YouTube: {
    packageName: 'com.google.android.youtube',
    activityName: 'HomeActivity',
    nodes: [
      { nodeId: 'com.google.android.youtube:id/menu_item_search', type: 'button', label: 'Search', bounds: { x: 320, y: 56, w: 48, h: 48 }, clickable: true, editable: false },
      { nodeId: 'com.google.android.youtube:id/search_edit_text', type: 'input', label: 'Search YouTube', bounds: { x: 64, y: 56, w: 280, h: 48 }, clickable: true, editable: true },
      { nodeId: 'com.google.android.youtube:id/feed_list', type: 'list_item', label: 'Trending Technology & Music Feed', bounds: { x: 16, y: 140, w: 368, h: 180 }, clickable: true, editable: false },
    ],
  },
  Chrome: {
    packageName: 'com.android.chrome',
    activityName: 'Main',
    nodes: [
      { nodeId: 'com.android.chrome:id/url_bar', type: 'input', label: 'Search or type URL', bounds: { x: 32, y: 56, w: 320, h: 48 }, clickable: true, editable: true },
      { nodeId: 'com.android.chrome:id/tab_switcher', type: 'button', label: 'Tabs', bounds: { x: 360, y: 56, w: 40, h: 48 }, clickable: true, editable: false },
    ],
  },
  Instagram: {
    packageName: 'com.instagram.android',
    activityName: 'MainActivity',
    nodes: [
      { nodeId: 'com.instagram.android:id/search_tab', type: 'tab', label: 'Search', bounds: { x: 96, y: 740, w: 48, h: 48 }, clickable: true, editable: false },
      { nodeId: 'com.instagram.android:id/action_bar_search_edit_text', type: 'input', label: 'Search bar', bounds: { x: 48, y: 64, w: 300, h: 44 }, clickable: true, editable: true },
      { nodeId: 'com.instagram.android:id/follow_button', type: 'button', label: 'Follow (Requires Confirmation)', bounds: { x: 240, y: 210, w: 120, h: 40 }, clickable: true, editable: false },
    ],
  },
  Messages: {
    packageName: 'com.google.android.apps.messaging',
    activityName: 'ConversationListActivity',
    nodes: [
      { nodeId: 'com.google.android.apps.messaging:id/search_bar', type: 'input', label: 'Search messages', bounds: { x: 24, y: 64, w: 340, h: 48 }, clickable: true, editable: true },
      { nodeId: 'com.google.android.apps.messaging:id/thread_1', type: 'list_item', label: 'Aarav Sharma · Robotics Demo at 6 PM', bounds: { x: 16, y: 140, w: 368, h: 72 }, clickable: true, editable: false },
      { nodeId: 'com.google.android.apps.messaging:id/compose_message_text', type: 'input', label: 'Text message', bounds: { x: 24, y: 720, w: 270, h: 48 }, clickable: true, editable: true },
    ],
  },
};

class AccessibilityController {
  private screenState: VirtualScreenState = {
    currentApp: 'Home',
    packageName: APP_TEMPLATES.Home.packageName,
    activityName: APP_TEMPLATES.Home.activityName,
    scrollOffset: 0,
    lastGesture: 'none',
    brightnessPercent: 75,
    volumePercent: 60,
    flashlightOn: false,
    batteryPercent: 86,
    networkStatus: 'Wi-Fi Connected',
    nodes: [...APP_TEMPLATES.Home.nodes],
  };

  getScreenState(): VirtualScreenState {
    return {
      ...this.screenState,
      nodes: this.screenState.nodes.map((n) => ({ ...n })),
    };
  }

  openApp(appName: string): VirtualScreenState {
    const key = Object.keys(APP_TEMPLATES).find((k) => k.toLowerCase() === appName.toLowerCase()) || appName;
    const template = APP_TEMPLATES[key];
    if (template) {
      this.screenState = {
        ...this.screenState,
        currentApp: key,
        packageName: template.packageName,
        activityName: template.activityName,
        scrollOffset: 0,
        lastGesture: `launch(${key})`,
        nodes: template.nodes.map((n) => ({ ...n })),
      };
    } else {
      this.screenState = {
        ...this.screenState,
        currentApp: appName,
        packageName: `com.android.app.${appName.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
        activityName: 'MainActivity',
        scrollOffset: 0,
        lastGesture: `launch(${appName})`,
        nodes: [
          { nodeId: 'generic:search', type: 'input', label: `Search ${appName}`, bounds: { x: 24, y: 64, w: 340, h: 48 }, clickable: true, editable: true },
          { nodeId: 'generic:content', type: 'text', label: `${appName} Main Interface`, bounds: { x: 24, y: 140, w: 340, h: 200 }, clickable: false, editable: false },
        ],
      };
    }
    loggingDiagnostics.record('AccessibilityController', 'INFO', `Opened app ${this.screenState.currentApp}`);
    return this.getScreenState();
  }

  setBrightness(percent: number): number {
    const clamped = Math.max(5, Math.min(100, Math.round(percent)));
    this.screenState.brightnessPercent = clamped;
    this.screenState.lastGesture = `brightness(${clamped}%)`;
    loggingDiagnostics.record('AccessibilityController', 'INFO', `Adjusted brightness to ${clamped}%`);
    return clamped;
  }

  setVolume(percent: number): number {
    const clamped = Math.max(0, Math.min(100, Math.round(percent)));
    this.screenState.volumePercent = clamped;
    this.screenState.lastGesture = `volume(${clamped}%)`;
    loggingDiagnostics.record('AccessibilityController', 'INFO', `Adjusted media volume to ${clamped}%`);
    return clamped;
  }

  toggleFlashlight(on?: boolean): boolean {
    this.screenState.flashlightOn = on !== undefined ? on : !this.screenState.flashlightOn;
    this.screenState.lastGesture = `flashlight(${this.screenState.flashlightOn ? 'ON' : 'OFF'})`;
    return this.screenState.flashlightOn;
  }

  lockDevice(): VirtualScreenState {
    this.screenState.deviceLocked = true;
    this.screenState.lastGesture = 'lock_device(GLOBAL_ACTION_LOCK_SCREEN)';
    loggingDiagnostics.record('AccessibilityController', 'INFO', 'Device lock requested via Accessibility global action');
    return this.getScreenState();
  }

  findNodeByQuery(nodeId?: string, nodeText?: string): VirtualScreenNode | undefined {
    if (nodeId) {
      const byId = this.screenState.nodes.find((n) => n.nodeId === nodeId);
      if (byId) return byId;
    }
    if (nodeText) {
      const q = nodeText.toLowerCase();
      return this.screenState.nodes.find((n) => n.label.toLowerCase().includes(q));
    }
    return undefined;
  }

  performGesture(gesture: string): VirtualScreenState {
    if (gesture === 'scroll' || gesture === 'swipe_up') {
      this.screenState.scrollOffset += 420;
    } else if (gesture === 'micro_scroll_down') {
      this.screenState.scrollOffset += 160;
    } else if (gesture === 'micro_scroll_up') {
      this.screenState.scrollOffset = Math.max(0, this.screenState.scrollOffset - 160);
    } else if (gesture === 'swipe_down') {
      this.screenState.scrollOffset = Math.max(0, this.screenState.scrollOffset - 420);
    } else if (gesture === 'scroll_hold') {
      this.screenState.scrollOffset += 240;
    } else if (gesture === 'home') {
      return this.openApp('Home');
    } else if (gesture === 'back') {
      if (this.screenState.currentApp !== 'Home') {
        return this.openApp('Home');
      }
    }
    this.screenState.lastGesture = gesture;
    loggingDiagnostics.record('AccessibilityController', 'INFO', `Performed gesture/action: ${gesture}`);
    return this.getScreenState();
  }

  enterTextIntoNode(nodeId: string | undefined, nodeText: string | undefined, inputText: string): boolean {
    const node = this.findNodeByQuery(nodeId, nodeText) || this.screenState.nodes.find((n) => n.editable);
    if (!node) return false;
    node.value = inputText;
    this.screenState.lastGesture = `enter_text("${inputText}")`;
    if (
      this.screenState.currentApp === 'Instagram' ||
      this.screenState.currentApp === 'YouTube' ||
      this.screenState.currentApp === 'Chrome'
    ) {
      this.screenState.nodes.push({
        nodeId: `${this.screenState.packageName}:id/search_result_1`,
        type: 'list_item',
        label: `Result for "${inputText}"`,
        bounds: { x: 24, y: 150, w: 340, h: 64 },
        clickable: true,
        editable: false,
      });
    }
    loggingDiagnostics.record('AccessibilityController', 'INFO', `Entered text into node ${node.nodeId}`);
    return true;
  }
}

export const accessibilityController = new AccessibilityController();
