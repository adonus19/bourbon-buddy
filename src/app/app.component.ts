import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';

import { AuthService } from './core/auth/auth.service';
import { OnboardingService } from './core/services/onboarding.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly onboarding = inject(OnboardingService);
  private readonly router = inject(Router);

  async ngOnInit(): Promise<void> {
    // Finish a Google redirect sign-in if this load is returning from one.
    const user = await this.auth.completeRedirectSignIn();
    if (user) {
      await this.router.navigateByUrl(this.onboarding.postAuthRoute(), {
        replaceUrl: true,
      });
    }
  }
}
