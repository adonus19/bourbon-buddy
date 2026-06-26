import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';

import { NewsService } from '../../core/services/news.service';
import { NEWS_CATEGORIES } from '../../shared/utils/news-filter';

@Component({
  selector: 'app-feed-settings',
  templateUrl: './feed-settings.page.html',
  styleUrls: ['./feed-settings.page.scss'],
  standalone: false,
})
export class FeedSettingsPage implements OnInit {
  private readonly news = inject(NewsService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastController);

  readonly categories = NEWS_CATEGORIES;

  readonly watchKeywords = signal<string[]>([]);
  readonly watchDistilleries = signal<string[]>([]);
  readonly excludeKeywords = signal<string[]>([]);
  readonly activeCategories = signal<string[]>([]);
  saving = false;

  async ngOnInit(): Promise<void> {
    const p = await this.news.loadPreferencesOnce();
    this.watchKeywords.set([...p.watchKeywords]);
    this.watchDistilleries.set([...p.watchDistilleries]);
    this.excludeKeywords.set([...p.excludeKeywords]);
    this.activeCategories.set([...p.activeCategories]);
  }

  isCategoryOn(value: string): boolean {
    return this.activeCategories().includes(value);
  }
  toggleCategory(value: string): void {
    this.activeCategories.update((cats) =>
      cats.includes(value) ? cats.filter((c) => c !== value) : [...cats, value]
    );
  }

  async save(): Promise<void> {
    if (this.saving) {
      return;
    }
    this.saving = true;
    try {
      await this.news.savePreferences({
        watchKeywords: this.watchKeywords(),
        watchDistilleries: this.watchDistilleries(),
        activeCategories: this.activeCategories(),
        excludeKeywords: this.excludeKeywords(),
      });
      await this.presentToast('Feed updated.');
      await this.router.navigateByUrl('/tabs/dispatch', { replaceUrl: true });
    } catch {
      await this.presentToast("Couldn't save. Try again.");
    } finally {
      this.saving = false;
    }
  }

  private async presentToast(message: string): Promise<void> {
    const t = await this.toast.create({
      message,
      duration: 2000,
      position: 'top',
    });
    await t.present();
  }
}
