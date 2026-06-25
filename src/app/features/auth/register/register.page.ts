import { Component, inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService } from '../../../core/auth/auth.service';
import { authErrorMessage } from '../../../core/auth/auth-error';
import { OnboardingService } from '../../../core/services/onboarding.service';

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
  private readonly onboarding = inject(OnboardingService);

  readonly form: FormGroup = this.fb.group({
    displayName: ['', [Validators.required, Validators.maxLength(60)]],
    email: ['', [Validators.required, Validators.email]],
    // Firebase requires 6+, but the brief/AC specifies an 8-char minimum.
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  submitting = false;
  errorMessage = '';

  get passwordTooShort(): boolean {
    const ctrl = this.form.get('password');
    return !!ctrl && ctrl.touched && ctrl.hasError('minlength');
  }

  async register(): Promise<void> {
    if (this.form.invalid || this.submitting) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting = true;
    this.errorMessage = '';
    try {
      const { email, password, displayName } = this.form.value;
      await this.auth.register(email, password, displayName.trim());
      await this.router.navigateByUrl(this.onboarding.postAuthRoute(), {
        replaceUrl: true,
      });
    } catch (err) {
      this.errorMessage = authErrorMessage(err);
    } finally {
      this.submitting = false;
    }
  }
}
