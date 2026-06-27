import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';

import { ComingSoonComponent } from './components/coming-soon/coming-soon.component';
import { WordmarkComponent } from './components/wordmark/wordmark.component';
import { RatingWidgetComponent } from './components/rating-widget/rating-widget.component';
import { FlavorTagSelectorComponent } from './components/flavor-tag-selector/flavor-tag-selector.component';
import { BourbonAutocompleteComponent } from './components/bourbon-autocomplete/bourbon-autocomplete.component';
import { LogEntryCardComponent } from './components/log-entry-card/log-entry-card.component';
import { LabelPhotoPickerComponent } from './components/label-photo-picker/label-photo-picker.component';
import { WishlistCardComponent } from './components/wishlist-card/wishlist-card.component';
import { SightingFormComponent } from './components/sighting-form/sighting-form.component';
import { PourFormComponent } from './components/pour-form/pour-form.component';
import { ChipInputComponent } from './components/chip-input/chip-input.component';
import { MetricCardComponent } from './components/metric-card/metric-card.component';

/**
 * Shared declarations reused across feature modules (presentational
 * components, pipes, directives). Import into any feature module that needs
 * them. Keep singletons/services out of here — those belong in core.
 */
const COMPONENTS = [
  ComingSoonComponent,
  WordmarkComponent,
  RatingWidgetComponent,
  FlavorTagSelectorComponent,
  BourbonAutocompleteComponent,
  LogEntryCardComponent,
  LabelPhotoPickerComponent,
  WishlistCardComponent,
  SightingFormComponent,
  PourFormComponent,
  ChipInputComponent,
  MetricCardComponent,
];

@NgModule({
  declarations: COMPONENTS,
  imports: [CommonModule, ReactiveFormsModule, IonicModule],
  exports: COMPONENTS,
})
export class SharedModule {}
