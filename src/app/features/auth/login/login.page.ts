import { Component, inject } from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { User } from '@angular/fire/auth';

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
      await this.router.navigateByUrl('/tabs', { replaceUrl: true });
    } catch (err) {
      this.errorMessage = authErrorMessage(err);
    } finally {
      this.submitting = false;
    }
  }

  signInWithGoogle(): Promise<void> {
    return this.socialSignIn(() => this.auth.signInWithGoogle());
  }

  signInWithFacebook(): Promise<void> {
    return this.socialSignIn(() => this.auth.signInWithFacebook());
  }

  /** Shared flow for the federated providers: sign in, then land on /tabs. */
  private async socialSignIn(run: () => Promise<User>): Promise<void> {
    if (this.submitting) {
      return;
    }
    this.submitting = true;
    this.errorMessage = '';
    try {
      await run();
      await this.router.navigateByUrl('/tabs', { replaceUrl: true });
    } catch (err) {
      this.errorMessage = authErrorMessage(err);
    } finally {
      this.submitting = false;
    }
  }
}
