import { Component, inject } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService } from '../../../core/auth/auth.service';
import { authErrorMessage } from '../../../core/auth/auth-error';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: false,
})
export class LoginPage {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  submitting = false;
  errorMessage = '';

  async signIn(): Promise<void> {
    if (this.form.invalid || this.submitting) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting = true;
    this.errorMessage = '';
    try {
      const { email, password } = this.form.getRawValue();
      await this.auth.signIn(email ?? '', password ?? '');
      await this.router.navigateByUrl('/tabs', { replaceUrl: true });
    } catch (err) {
      this.errorMessage = authErrorMessage(err);
    } finally {
      this.submitting = false;
    }
  }

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
