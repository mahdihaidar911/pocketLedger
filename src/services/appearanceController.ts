import { isAppearancePreference, type AppearancePreference } from '../theme/appearance';

export interface AppearanceAdapter {
  read(): Promise<AppearancePreference>;
  write(preference: AppearancePreference): Promise<void>;
}

export interface AppearanceState {
  preference: AppearancePreference;
  ready: boolean;
  saving: boolean;
  error: string | null;
}

export class AppearanceController {
  private state: AppearanceState = { preference: 'system', ready: false, saving: false, error: null };
  private initializing = false;
  private listeners = new Set<() => void>();

  constructor(private adapter: AppearanceAdapter) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private update(patch: Partial<AppearanceState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  async initialize(): Promise<void> {
    if (this.initializing || this.state.ready) return;
    this.initializing = true;
    try {
      const preference = await this.adapter.read();
      this.update({ preference: isAppearancePreference(preference) ? preference : 'system', ready: true });
    } catch {
      // A cosmetic preference must never bypass the independent app-lock gate.
      // Continue using System; the settings screen lets the user retry saving.
      this.update({ ready: true, error: 'Could not load appearance. Using System for now. Choose a mode to save it again.' });
    } finally {
      this.initializing = false;
    }
  }

  setPreference = async (preference: AppearancePreference): Promise<void> => {
    if (!this.state.ready || this.state.saving) return;
    if (!isAppearancePreference(preference)) {
      this.update({ error: 'Choose System, Light, or Dark.' });
      return;
    }
    if (preference === this.state.preference && !this.state.error) return;
    this.update({ saving: true, error: null });
    try {
      await this.adapter.write(preference);
      // Commit only after storage succeeds; failed saves retain the prior mode.
      this.update({ preference });
    } catch {
      this.update({ error: 'Could not save appearance. Your previous mode is still active. Try again.' });
    } finally {
      this.update({ saving: false });
    }
  };
}
