import { Component, computed, inject } from '@angular/core';
import { ChartConfiguration } from 'chart.js';

import { StatsService } from '../../core/services/stats.service';
import { cssVarValue } from '../../shared/utils/css-var';

@Component({
  selector: 'app-numbers',
  templateUrl: './numbers.page.html',
  styleUrls: ['./numbers.page.scss'],
  standalone: false,
})
export class NumbersPage {
  private readonly stats = inject(StatsService);

  readonly hasData = this.stats.hasData;
  readonly summary = this.stats.summary;
  readonly topDistilleries = this.stats.topDistilleries;
  readonly topFlavorTags = this.stats.topFlavorTags;

  /** Highest single flavor-tag count, for sizing the bar fills. */
  readonly maxFlavorCount = computed(() =>
    Math.max(1, ...this.topFlavorTags().map((t) => t.count))
  );

  readonly ratingChartData = computed<ChartConfiguration<'bar'>['data']>(() => {
    const bins = this.stats.ratingDistribution();
    return {
      labels: bins.map((b) => b.label),
      datasets: [
        {
          data: bins.map((b) => b.count),
          backgroundColor: cssVarValue('--color-amber'),
          hoverBackgroundColor: cssVarValue('--color-amber-light'),
          borderRadius: 4,
          maxBarThickness: 26,
        },
      ],
    };
  });

  readonly ratingChartOptions: ChartConfiguration<'bar'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: cssVarValue('--color-text-secondary'), font: { size: 11 } },
      },
      y: {
        beginAtZero: true,
        ticks: {
          color: cssVarValue('--color-text-secondary'),
          precision: 0,
          font: { size: 11 },
        },
        grid: { color: cssVarValue('--color-border') },
      },
    },
  };

  readonly categoryChartData = computed<ChartConfiguration<'doughnut'>['data']>(
    () => {
      const slices = this.stats.categoryBreakdown();
      return {
        labels: slices.map((s) => s.label),
        datasets: [
          {
            data: slices.map((s) => s.count),
            backgroundColor: slices.map((s) => cssVarValue(s.accentVar)),
            borderColor: cssVarValue('--color-bg-surface'),
            borderWidth: 2,
          },
        ],
      };
    }
  );

  readonly categoryChartOptions: ChartConfiguration<'doughnut'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '60%',
    plugins: {
      legend: {
        position: 'right',
        labels: {
          color: cssVarValue('--color-text-secondary'),
          boxWidth: 12,
          font: { size: 12 },
          padding: 10,
        },
      },
    },
  };

  spent(): string {
    return `$${Math.round(this.summary().totalSpent).toLocaleString()}`;
  }

  avg(): string {
    const a = this.summary().avgRating;
    return a == null ? '—' : `${a.toFixed(1)}★`;
  }
}
