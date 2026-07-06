import { Component, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import * as L from 'leaflet';

import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth/auth.service';
import { FriendService } from '../../core/services/friend.service';
import { SightingService } from '../../core/services/sighting.service';
import { GeolocationService } from '../../core/services/geolocation.service';
import { WishlistService } from '../../core/services/wishlist.service';
import { ACTIVE_WISHLIST_STATUSES, Sighting } from '../../models';
import { isSightingStale } from '../../shared/utils/sighting';
import { isWithinMiles } from '../../shared/utils/geo';

const MILES_TO_METERS = 1609.34;
const DEFAULT_RADIUS_MILES = 50;

interface BaseArea {
  center: [number, number];
  label: string | null;
  radiusMiles: number;
}

// Geographic center of the contiguous US — a sane fallback when we have no
// base location, no device location, and no plotted sightings.
const US_CENTER: [number, number] = [39.5, -98.35];

/**
 * Nearby-sightings map (BB-179). Plots friends' shared + your own sightings that
 * have coordinates and are non-stale, on MapTiler tiles via Leaflet. Data comes
 * from two bounded reads (no per-marker fan-out); tapping a marker shows the
 * sighting and links to the bottle when it's on your Hunt List.
 */
@Component({
  selector: 'app-sightings-map',
  templateUrl: './sightings-map.page.html',
  styleUrls: ['./sightings-map.page.scss'],
  standalone: false,
})
export class SightingsMapPage {
  private readonly auth = inject(AuthService);
  private readonly friends = inject(FriendService);
  private readonly sightings = inject(SightingService);
  private readonly geo = inject(GeolocationService);
  private readonly wishlist = inject(WishlistService);
  private readonly router = inject(Router);

  @ViewChild('mapEl') private mapEl?: ElementRef<HTMLDivElement>;

  readonly hasKey = !!environment.maptilerKey;
  readonly loading = signal(true);
  readonly count = signal(0);
  // Radius-filter context for the info bar / empty states (BB-179 Pass 2).
  readonly radiusMiles = signal<number | null>(null);
  readonly baseLabel = signal<string | null>(null);
  readonly hiddenByRadius = signal(0);

  private map?: L.Map;
  private center: [number, number] | null = null;
  private built = false;

  async ionViewDidEnter(): Promise<void> {
    if (this.built) {
      this.map?.invalidateSize();
      return;
    }
    if (!this.hasKey) {
      this.loading.set(false);
      return;
    }
    this.built = true;
    await this.build();
  }

  ionViewWillLeave(): void {
    this.map?.remove();
    this.map = undefined;
    this.built = false;
  }

  private async build(): Promise<void> {
    const el = this.mapEl?.nativeElement;
    if (!el) {
      this.loading.set(false);
      return;
    }

    const [base, allMappable, names, huntIndex] = await Promise.all([
      this.resolveBase(),
      this.loadSightings(),
      this.friendNames(),
      Promise.resolve(this.buildHuntIndex()),
    ]);

    // Radius filter (BB-178/179): only when a base location is set. Without one
    // we can't anchor a radius, so we show everything with coordinates.
    const mappable = base
      ? allMappable.filter((s) =>
          isWithinMiles(
            { lat: base.center[0], lng: base.center[1] },
            { lat: s.lat as number, lng: s.lng as number },
            base.radiusMiles
          )
        )
      : allMappable;

    const center = base?.center ?? (await this.deviceCenter());
    this.center = center;
    this.count.set(mappable.length);
    this.hiddenByRadius.set(base ? allMappable.length - mappable.length : 0);
    this.radiusMiles.set(base?.radiusMiles ?? null);
    this.baseLabel.set(base?.label ?? null);

    const map = L.map(el, { zoomControl: true }).setView(
      center ?? US_CENTER,
      center ? 11 : 4
    );
    L.tileLayer(
      `https://api.maptiler.com/maps/streets-v2/256/{z}/{x}/{y}.png?key=${environment.maptilerKey}`,
      {
        attribution:
          '© <a href="https://www.maptiler.com/">MapTiler</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 20,
      }
    ).addTo(map);

    // Visualize the base location + radius.
    if (base) {
      L.circle(base.center, {
        radius: base.radiusMiles * MILES_TO_METERS,
        color: '#c8873a',
        weight: 1,
        fillColor: '#c8873a',
        fillOpacity: 0.06,
      }).addTo(map);
      L.circleMarker(base.center, {
        radius: 6,
        weight: 2,
        color: '#f0e8dc',
        fillColor: '#141210',
        fillOpacity: 1,
      })
        .bindPopup('Your base location')
        .addTo(map);
    }

    const markers: L.CircleMarker[] = [];
    for (const s of mappable) {
      const marker = L.circleMarker([s.lat as number, s.lng as number], {
        radius: 8,
        weight: 2,
        color: '#c8873a',
        fillColor: '#c8873a',
        fillOpacity: 0.85,
      });
      const entryId = huntIndex.get(s.bourbonId) ?? null;
      marker.bindPopup(this.popupHtml(s, names, entryId));
      if (entryId) {
        marker.on('popupopen', (e) => this.wireViewLink(e, entryId));
      }
      marker.addTo(map);
      markers.push(marker);
    }

    // Frame all markers when we weren't given a base/device location to center on.
    if (!center && markers.length) {
      map.fitBounds(L.featureGroup(markers).getBounds().pad(0.2));
    }

    this.map = map;
    // The container often finishes sizing after the page transition.
    setTimeout(() => map.invalidateSize(), 150);
    this.loading.set(false);
  }

  /** The user's opt-in base location + alert radius (BB-178), if set. */
  private resolveBase(): BaseArea | null {
    const p = this.auth.profile();
    if (p?.baseLat == null || p?.baseLng == null) {
      return null;
    }
    return {
      center: [p.baseLat, p.baseLng],
      label: p.baseLocationLabel ?? null,
      radiusMiles: p.alertRadiusMiles ?? DEFAULT_RADIUS_MILES,
    };
  }

  /** Device location, used to center when there's no base location set. */
  private async deviceCenter(): Promise<[number, number] | null> {
    const c = await this.geo.getCurrentPosition();
    return c ? [c.lat, c.lng] : null;
  }

  /** Recenter the map on the base/device location (BB-179 Pass 2). */
  recenter(): void {
    if (this.map && this.center) {
      this.map.setView(this.center, 11);
    }
  }

  private async loadSightings(): Promise<Sighting[]> {
    const uid = this.auth.snapshotUser?.uid;
    if (!uid) {
      return [];
    }
    const friends = await this.friends.friendsOnce();
    const items = await this.sightings.nearbySightings(
      friends.map((f) => f.uid),
      uid
    );
    return items.filter(
      (s) => s.lat != null && s.lng != null && !isSightingStale(s)
    );
  }

  private async friendNames(): Promise<Map<string, string>> {
    const friends = await this.friends.friendsOnce();
    const map = new Map<string, string>();
    for (const f of friends) {
      map.set(f.uid, f.displayName ?? 'A friend');
    }
    const me = this.auth.snapshotUser?.uid;
    if (me) {
      map.set(me, 'You');
    }
    return map;
  }

  private buildHuntIndex(): Map<string, string> {
    const index = new Map<string, string>();
    for (const e of this.wishlist.entries()) {
      if (
        e.bourbonId &&
        e.id &&
        ACTIVE_WISHLIST_STATUSES.includes(e.status) &&
        !index.has(e.bourbonId)
      ) {
        index.set(e.bourbonId, e.id);
      }
    }
    return index;
  }

  private popupHtml(
    s: Sighting,
    names: Map<string, string>,
    entryId: string | null
  ): string {
    const esc = (v: unknown) =>
      String(v ?? '').replace(
        /[&<>"']/g,
        (c) =>
          ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
          })[c] as string
      );
    const place = [s.city, s.state].filter(Boolean).map(esc).join(', ');
    const who = esc(names.get(s.spotterUid) ?? 'Someone');
    // Native-app deep link handles directions; a plain <a> avoids popup blockers.
    const dir = this.directionsUrl(s.lat as number, s.lng as number);
    return `
      <div class="map-popup">
        <div class="map-popup__bottle">${esc(s.bourbonName || 'A bottle')}</div>
        <div class="map-popup__price">$${esc(s.price)}</div>
        <div class="map-popup__store">${esc(s.storeName)}${place ? ' &middot; ' + place : ''}</div>
        <div class="map-popup__who">Spotted by ${who}</div>
        <a class="map-popup__directions" href="${dir}" target="_blank" rel="noopener">Directions</a>
        ${entryId ? '<button type="button" class="map-popup__view">View on Hunt List</button>' : ''}
      </div>`;
  }

  /** Directions deep link: Apple Maps on iOS, Google Maps elsewhere. */
  private directionsUrl(lat: number, lng: number): string {
    return this.isIos()
      ? `https://maps.apple.com/?daddr=${lat},${lng}`
      : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  }

  private isIos(): boolean {
    const ua = navigator.userAgent;
    return (
      /iPad|iPhone|iPod/.test(ua) ||
      // iPadOS reports as MacIntel with touch.
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    );
  }

  private wireViewLink(e: L.PopupEvent, entryId: string): void {
    const btn = e.popup
      .getElement()
      ?.querySelector<HTMLButtonElement>('.map-popup__view');
    btn?.addEventListener('click', () => {
      void this.router.navigateByUrl(`/wishlist/${entryId}`);
    });
  }
}
