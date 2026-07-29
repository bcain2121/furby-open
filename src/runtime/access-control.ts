import type { PreferenceStore } from '../storage/preferences.js';
import { accessScopeSummary, type AccessScope } from './access-policy.js';

export interface AccessControlResult {
  scope: AccessScope;
  changed: boolean;
  resetSessions: boolean;
  message: string;
}

function outsideWarning() {
  return [
    '⚠️ Outside access is ON and persists across restarts.',
    '',
    'Furby can now read, modify, or delete files available to this OS account and run host shell commands. Scheduled tasks also use outside access.',
    '',
    'Return to confined project access at any time:',
    '/project',
  ].join('\n');
}

function projectNotice() {
  return '✅ Project access is ON. Furby is confined to the Furby Open project and host shell commands are unavailable.';
}

export class AccessControl {
  constructor(private readonly preferences: PreferenceStore) {}

  status(userId: number): AccessControlResult {
    const scope = this.preferences.getAccessScope(userId);
    return {
      scope,
      changed: false,
      resetSessions: false,
      message: `Current access: ${scope}\n${accessScopeSummary(scope)}`,
    };
  }

  activateOutside(userId: number) {
    return this.activate(userId, 'outside');
  }

  activateProject(userId: number) {
    return this.activate(userId, 'project');
  }

  private activate(userId: number, scope: AccessScope): AccessControlResult {
    const changed = this.preferences.getAccessScope(userId) !== scope;
    if (changed) this.preferences.setAccessScope(userId, scope);
    return {
      scope,
      changed,
      resetSessions: changed,
      message: scope === 'outside' ? outsideWarning() : projectNotice(),
    };
  }
}
