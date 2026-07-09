import { Component, inject } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService } from '../../../core/auth/auth.service';
import { authErrorMessage } from '../../../core/auth/auth-error';

@Component({
  selector: 'app-register',
  templateUrl: './register.page.html',
  styleUrls: ['./register.page.scss'],
  standalone: false,
})
export class RegisterPage {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly form = this.fb.group({
    displayName: ['', [Validators.required, Validators.maxLength(60)]],
    email: ['', [Validators.required, Validators.email]],
    // Firebase requires 6+, but the brief/AC specifies an 8-char minimum.
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  submitting = false;
  errorMessage = '';

  async register(): Promise<void> {
    if (this.form.invalid || this.submitting) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting = true;
    this.errorMessage = '';
    try {
      const { email, password, displayName } = this.form.getRawValue();
      await this.auth.register(email ?? '', password ?? '', (displayName ?? '').trim());
      await this.router.navigateByUrl('/tabs', { replaceUrl: true });
    } catch (err) {
      this.errorMessage = authErrorMessage(err);
    } finally {
      this.submitting = false;
    }
  }

  /** Google sign-in doubles as sign-up: authenticate, then land on /tabs. */
  async signInWithGoogle(): Promise<void> {
    if (this.submitting) {
      return;
    }
    this.submitting = true;
    this.errorMessage = '';
    try {
      await this.auth.signInWithGoogle();
      await this.router.navigateByUrl('/tabs', { replaceUrl: true });
    } catch (err) {
      this.errorMessage = authErrorMessage(err);
    } finally {
      this.submitting = false;
    }
  }
}
