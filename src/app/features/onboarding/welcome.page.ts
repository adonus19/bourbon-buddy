import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';

import { OnboardingService } from '../../core/services/onboarding.service';

@Component({
  selector: 'app-welcome',
  templateUrl: './welcome.page.html',
  styleUrls: ['./welcome.page.scss'],
  standalone: false,
})
export class WelcomePage {
  private readonly onboarding = inject(OnboardingService);
  private readonly router = inject(Router);

  enter(): void {
    this.onboarding.markSeen();
    void this.router.navigateByUrl('/tabs', { replaceUrl: true });
  }
}
