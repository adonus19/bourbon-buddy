import { Component, inject } from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';

import { AuthService } from '../../../core/auth/auth.service';
import { authErrorMessage } from '../../../core/auth/auth-error';
import { OnboardingService } from '../../../core/services/onboarding.service';

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
  private readonly toast = inject(ToastController);
  private readonly onboarding = inject(OnboardingService);

  readonly form: FormGroup = this.fb.group({
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
      const { email, password } = this.form.value;
      await this.auth.signIn(email, password);
      await this.router.navigateByUrl(this.onboarding.postAuthRoute(), {
        replaceUrl: true,
      });
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
      // Redirects away; the result is handled by AppComponent on the return load.
      await this.auth.signInWithGoogle();
    } catch (err) {
      this.errorMessage = authErrorMessage(err);
      this.submitting = false;
    }
  }

  // Apple & Facebook providers are planned (BB-002) but not yet enabled in
  // Firebase. The buttons are present for layout; tapping explains the status.
  async providerNotReady(provider: string): Promise<void> {
    const t = await this.toast.create({
      message: `${provider} sign-in is coming soon.`,
      duration: 2000,
      position: 'top',
    });
    await t.present();
  }
}
