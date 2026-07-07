import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OfflineSyncBadgeComponent } from './offline-sync-badge.component';
import { SightingOutboxService } from '../../../core/services/sighting-outbox.service';

describe('OfflineSyncBadgeComponent (BB-182)', () => {
  let fixture: ComponentFixture<OfflineSyncBadgeComponent>;
  const pending = signal(0);
  const flush = jest.fn();

  beforeEach(() => {
    pending.set(0);
    flush.mockClear();
    TestBed.configureTestingModule({
      declarations: [OfflineSyncBadgeComponent],
      providers: [
        {
          provide: SightingOutboxService,
          useValue: { pending: pending.asReadonly(), flush },
        },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    });
    fixture = TestBed.createComponent(OfflineSyncBadgeComponent);
    fixture.detectChanges();
  });

  it('renders nothing when the queue is empty', () => {
    expect(fixture.nativeElement.querySelector('.sync-badge')).toBeNull();
  });

  it('shows a singular count when one sighting is pending', () => {
    pending.set(1);
    fixture.detectChanges();
    const text = fixture.nativeElement.querySelector('.sync-badge__text')
      .textContent as string;
    expect(text).toContain('1 sighting waiting to sync');
  });

  it('pluralizes the count', () => {
    pending.set(3);
    fixture.detectChanges();
    const text = fixture.nativeElement.querySelector('.sync-badge__text')
      .textContent as string;
    expect(text).toContain('3 sightings waiting to sync');
  });

  it('flushes the outbox when tapped', () => {
    pending.set(2);
    fixture.detectChanges();
    fixture.nativeElement.querySelector('.sync-badge').click();
    expect(flush).toHaveBeenCalledTimes(1);
  });
});
