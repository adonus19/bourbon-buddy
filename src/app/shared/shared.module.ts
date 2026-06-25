import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';

import { ComingSoonComponent } from './components/coming-soon/coming-soon.component';
import { WordmarkComponent } from './components/wordmark/wordmark.component';

/**
 * Shared declarations reused across feature modules (presentational
 * components, pipes, directives). Import into any feature module that needs
 * them. Keep singletons/services out of here — those belong in core.
 */
@NgModule({
  declarations: [ComingSoonComponent, WordmarkComponent],
  imports: [CommonModule, IonicModule],
  exports: [ComingSoonComponent, WordmarkComponent],
})
export class SharedModule {}
