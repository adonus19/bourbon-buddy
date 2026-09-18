import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';

import { AppMenuComponent } from './components/app-menu/app-menu.component';
import { MenuButtonComponent } from './components/menu-button/menu-button.component';

/**
 * The app menu drawer (BB-247) and the header trigger that opens it.
 *
 * Kept in its own small module — like OnboardingModule — so the eager AppModule
 * can mount the drawer at the app root without dragging the much heavier
 * SharedModule into the initial bundle. IonicModule is already eager via
 * `IonicModule.forRoot()`, so this adds nothing new there.
 *
 * SharedModule re-exports it, and the two Social page modules (which don't
 * import SharedModule) import it directly.
 */
@NgModule({
  declarations: [AppMenuComponent, MenuButtonComponent],
  imports: [CommonModule, IonicModule],
  exports: [AppMenuComponent, MenuButtonComponent],
})
export class AppMenuModule {}
