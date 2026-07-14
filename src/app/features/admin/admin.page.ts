import { Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ToastController } from '@ionic/angular';

import { AdminAccessService } from '../../core/services/admin-access.service';
import { AllowlistEntry, UserProfile } from '../../models';
import { relativeTime } from '../../shared/utils/relative-time';

/** Validators.email on the TRIMMED value — pasted emails often carry spaces. */
function trimmedEmail(control: AbstractControl): ValidationErrors | null {
  const trimmed = String(control.value ?? '').trim();
  return trimmed
    ? Validators.email({ value: trimmed } as AbstractControl)
    : null;
}

/**
 * Owner tools (BB-212): the gated-access control panel.
 *
 * Two sections — the queue of accounts waiting on a decision (approve/deny via
 * the guarded callables) and the signup allowlist (direct Firestore ops under
 * the admin-only rules). Data loads as one-shot reads on view-enter plus
 * pull-to-refresh; approvals are rare, so no listeners (cost discipline).
 */
@Component({
  selector: 'app-admin',
  templateUrl: './admin.page.html',
  styleUrls: ['./admin.page.scss'],
  standalone: false,
})
export class AdminPage {
  private readonly admin = inject(AdminAccessService);
  private readonly toast = inject(ToastController);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly pending = signal<UserProfile[]>([]);
  readonly entries = signal<AllowlistEntry[]>([]);
  readonly loading = signal(false);
  /** uid (or allowlist doc id) of the row with an action in flight. */
  readonly busyId = signal<string | null>(null);

  readonly form = this.fb.group({
    email: ['', [Validators.required, trimmedEmail]],
    note: [''],
  });
  submittingAdd = false;

  ionViewWillEnter(): void {
    void this.reload();
  }

  async reload(refresher?: { complete: () => void }): Promise<void> {
    this.loading.set(true);
    try {
      const [pending, entries] = await Promise.all([
        this.admin.pendingUsers(),
        this.admin.allowlist(),
      ]);
      this.pending.set(pending);
      this.entries.set(entries);
    } catch {
      await this.present("Couldn't load. Pull to retry.");
    } finally {
      this.loading.set(false);
      refresher?.complete();
    }
  }

  async approve(user: UserProfile): Promise<void> {
    if (!user.id || this.busyId()) {
      return;
    }
    this.busyId.set(user.id);
    try {
      await this.admin.approve(user.id);
      this.pending.update((list) => list.filter((u) => u.id !== user.id));
      // Approval upserts their email into the allowlist server-side.
      this.entries.set(await this.admin.allowlist());
      await this.present(`${user.displayName} is in. 🥃`);
    } catch {
      await this.present("Couldn't approve. Try again.");
    } finally {
      this.busyId.set(null);
    }
  }

  async deny(user: UserProfile): Promise<void> {
    if (!user.id || this.busyId()) {
      return;
    }
    this.busyId.set(user.id);
    try {
      await this.admin.deny(user.id);
      this.pending.update((list) => list.filter((u) => u.id !== user.id));
      await this.present(`${user.displayName} denied.`);
    } catch {
      await this.present("Couldn't deny. Try again.");
    } finally {
      this.busyId.set(null);
    }
  }

  async addEmail(): Promise<void> {
    if (this.form.invalid || this.submittingAdd) {
      this.form.markAllAsTouched();
      return;
    }
    const { email, note } = this.form.getRawValue();
    const key = email.trim().toLowerCase();
    if (this.entries().some((e) => e.id === key)) {
      await this.present('Already on the allowlist.');
      return;
    }
    this.submittingAdd = true;
    try {
      await this.admin.addToAllowlist(email, note.trim() || null);
      this.entries.set(await this.admin.allowlist());
      this.form.reset();
      await this.present(`${key} can now sign up and walk right in.`);
    } catch {
      await this.present("Couldn't add that email. Try again.");
    } finally {
      this.submittingAdd = false;
    }
  }

  async remove(entry: AllowlistEntry): Promise<void> {
    if (!entry.id || this.busyId()) {
      return;
    }
    this.busyId.set(entry.id);
    try {
      await this.admin.removeFromAllowlist(entry.id);
      this.entries.update((list) => list.filter((e) => e.id !== entry.id));
    } catch {
      await this.present("Couldn't remove. Try again.");
    } finally {
      this.busyId.set(null);
    }
  }

  when(user: UserProfile): string {
    return relativeTime(user.createdAt?.toDate() ?? null);
  }

  private async present(message: string): Promise<void> {
    const t = await this.toast.create({
      message,
      duration: 2500,
      position: 'top',
    });
    await t.present();
  }
}
