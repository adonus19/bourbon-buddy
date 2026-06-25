import { Component, inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';

import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-forgot-password',
  templateUrl: './forgot-password.page.html',
  styleUrls: ['./forgot-password.page.scss'],
  standalone: false,
})
export class ForgotPasswordPage {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);

  readonly form: FormGroup = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
  });

  submitting = false;
  sent = false;
  errorMessage = '';

  async submit(): Promise<void> {
    if (this.form.invalid || this.submitting) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting = true;
    this.errorMessage = '';
    try {
      await this.auth.resetPassword(this.form.value.email);
      this.sent = true;
    } catch (err) {
      // No account enumeration: a non-existent address still shows success.
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code: unknown }).code)
          : '';
      if (code === 'auth/user-not-found' || code === 'auth/invalid-credential') {
        this.sent = true;
      } else if (code === 'auth/network-request-failed') {
        this.errorMessage =
          "Couldn't send. Check your connection and try again.";
      } else {
        this.errorMessage = 'Something went wrong. Try again.';
      }
    } finally {
      this.submitting = false;
    }
  }
}
