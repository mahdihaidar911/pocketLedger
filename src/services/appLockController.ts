// Platform-independent lock state machine. Financial screens are mounted only
// while canAccess is true; neither navigation nor authentication cancellation
// grants access. Native adapters live in appLockService.ts.
export interface AppLockAdapter {
  readEnabled(): Promise<boolean>;
  writeEnabled(enabled: boolean): Promise<void>;
  authenticate(): Promise<{ success: boolean; message?: string }>;
}

export interface AppLockState {
  ready: boolean;
  enabled: boolean;
  locked: boolean;
  busy: boolean;
  canAccess: boolean;
  error: string | null;
}

export class AppLockController {
  private state: AppLockState = { ready: false, enabled: false, locked: true, busy: false, canAccess: false, error: null };
  private listeners = new Set<() => void>();
  private foreground: boolean;
  private authorizedForResume = false;

  constructor(private adapter: AppLockAdapter, initialAppState: string = 'active') {
    this.foreground = initialAppState === 'active';
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private update(patch: Partial<AppLockState>) {
    const next = { ...this.state, ...patch };
    next.canAccess = next.ready && !next.locked && (!next.enabled || this.foreground);
    this.state = next;
    this.listeners.forEach((listener) => listener());
  }

  async initialize(): Promise<void> {
    if (this.state.busy || this.state.ready) return;
    this.update({ busy: true, locked: true, error: null });
    try {
      const enabled = await this.adapter.readEnabled();
      this.update({ ready: true, enabled, locked: enabled });
    } catch {
      // Unknown preference is not the same as disabled. Never fail open.
      this.update({ ready: false, locked: true, error: 'Unable to read security settings. Retry to continue.' });
    } finally {
      this.update({ busy: false });
    }
  }

  setAppState(next: string): void {
    this.foreground = next === 'active';
    if (!this.foreground) {
      this.authorizedForResume = false;
      if (this.state.enabled) this.update({ locked: true });
    } else if (this.authorizedForResume) {
      // The native credential activity can finish just before the app resumes.
      // This one-use authorization is consumed on that first foreground event.
      this.authorizedForResume = false;
      this.update({ locked: false });
    } else {
      this.update({});
    }
  }

  lockNow(): void {
    this.authorizedForResume = false;
    if (this.state.enabled) this.update({ locked: true, error: null });
  }

  unlock = () => this.authenticateAndChange();
  setEnabled = (enabled: boolean) => this.authenticateAndChange(enabled);

  private async authenticateAndChange(enabled?: boolean): Promise<void> {
    if (this.state.busy || !this.state.ready || !this.foreground) return;
    if (enabled !== undefined && (!this.state.canAccess || enabled === this.state.enabled)) return;
    if (enabled === undefined && !this.state.enabled) return;
    this.update({ busy: true, error: null });
    try {
      const result = await this.adapter.authenticate();
      if (!result.success) {
        this.update({ error: result.message ?? 'Authentication was not completed. Try again.' });
        return;
      }
      if (enabled !== undefined) {
        try {
          await this.adapter.writeEnabled(enabled);
        } catch {
          // A failed write may have an uncertain outcome: re-read it behind
          // the gate instead of assuming the lock is off.
          this.update({ ready: false, locked: true, error: 'Unable to save security settings. Retry to check the saved state.' });
          return;
        }
        this.update({ enabled });
      }
      this.authorizedForResume = this.state.enabled && !this.foreground;
      this.update({ locked: this.state.enabled && !this.foreground, error: null });
    } catch {
      this.update({ error: 'Device authentication is unavailable. Check your device security settings and try again.' });
    } finally {
      this.update({ busy: false });
    }
  }
}
