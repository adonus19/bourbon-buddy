import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ModalController } from '@ionic/angular';
import {
  BrowserMultiFormatReader,
  IScannerControls,
} from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';

import type { BarcodeScanResult } from '../../core/services/barcode-scanner.service';
import { normalizeBarcode } from '../utils/barcode';

type ScanStatus =
  | 'starting'
  | 'scanning'
  | 'denied'
  | 'unavailable'
  | 'error';

// BarcodeDetector isn't in the TS DOM lib yet — declare just the slice we use.
interface DetectedBarcode {
  rawValue: string;
  format: string;
}
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
interface BarcodeDetectorCtor {
  new (opts?: { formats?: string[] }): BarcodeDetectorLike;
}

// Torch is a real but not-yet-typed MediaTrack capability/constraint.
interface TorchCapabilities {
  torch?: boolean;
}

const MANUAL_HINT_DELAY_MS = 15000;

/**
 * Camera barcode scanner (BB-174). Prefers the native BarcodeDetector API;
 * falls back to @zxing/browser. Manual entry is always available so the modal
 * resolves to a usable result on every platform (including iOS Safari, which
 * lacks BarcodeDetector).
 */
@Component({
  selector: 'app-scanner-modal',
  templateUrl: './scanner-modal.component.html',
  styleUrls: ['./scanner-modal.component.scss'],
  standalone: false,
})
export class ScannerModalComponent implements AfterViewInit, OnDestroy {
  private readonly modalCtrl = inject(ModalController);

  @ViewChild('video') private videoRef?: ElementRef<HTMLVideoElement>;

  readonly status = signal<ScanStatus>('starting');
  readonly manualCode = signal('');
  readonly torchOn = signal(false);
  readonly torchAvailable = signal(false);
  readonly showManualHint = signal(false);

  readonly manualValid = computed(
    () => normalizeBarcode(this.manualCode()) !== null
  );

  private stream: MediaStream | null = null;
  private zxingControls: IScannerControls | null = null;
  private rafId: number | null = null;
  private detector: BarcodeDetectorLike | null = null;
  private hintTimer: ReturnType<typeof setTimeout> | null = null;
  private done = false;

  async ngAfterViewInit(): Promise<void> {
    await this.start();
  }

  ngOnDestroy(): void {
    this.done = true;
    this.teardown();
  }

  onManualInput(value: string): void {
    this.manualCode.set(value);
  }

  private async start(): Promise<void> {
    const video = this.videoRef?.nativeElement;
    if (!video) {
      this.status.set('error');
      return;
    }
    try {
      const Detector = (globalThis as Record<string, unknown>)[
        'BarcodeDetector'
      ] as BarcodeDetectorCtor | undefined;
      if (Detector) {
        await this.startNative(video, Detector);
      } else {
        await this.startZxing(video);
      }
      this.status.set('scanning');
      this.armManualHint();
    } catch (err) {
      this.handleStartError(err);
    }
  }

  private async startNative(
    video: HTMLVideoElement,
    Detector: BarcodeDetectorCtor
  ): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
    });
    video.srcObject = this.stream;
    await video.play();
    this.detectTorch();

    this.detector = new Detector({
      formats: ['upc_a', 'upc_e', 'ean_13', 'ean_8'],
    });

    const tick = async (): Promise<void> => {
      if (this.done || !this.detector) {
        return;
      }
      try {
        const found = await this.detector.detect(video);
        for (const b of found) {
          const code = normalizeBarcode(b.rawValue);
          if (code) {
            this.finish(code, 'scan', b.format);
            return;
          }
        }
      } catch {
        // transient decode error — keep looping
      }
      this.rafId = requestAnimationFrame(() => void tick());
    };
    this.rafId = requestAnimationFrame(() => void tick());
  }

  private async startZxing(video: HTMLVideoElement): Promise<void> {
    const hints = new Map<DecodeHintType, unknown>();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
    ]);
    const reader = new BrowserMultiFormatReader(hints);
    this.zxingControls = await reader.decodeFromVideoDevice(
      undefined,
      video,
      (result) => {
        if (this.done || !result) {
          return;
        }
        const code = normalizeBarcode(result.getText());
        if (code) {
          this.finish(code, 'scan', BarcodeFormat[result.getBarcodeFormat()]);
        }
      }
    );
    // ZXing attaches the stream to the video element; grab it for torch control.
    this.stream = (video.srcObject as MediaStream) ?? null;
    this.detectTorch();
  }

  private detectTorch(): void {
    const track = this.stream?.getVideoTracks()[0];
    const caps = track?.getCapabilities?.() as TorchCapabilities | undefined;
    this.torchAvailable.set(!!caps?.torch);
  }

  async toggleTorch(): Promise<void> {
    const track = this.stream?.getVideoTracks()[0];
    if (!track) {
      return;
    }
    const next = !this.torchOn();
    try {
      await track.applyConstraints({
        advanced: [{ torch: next } as unknown as MediaTrackConstraintSet],
      });
      this.torchOn.set(next);
    } catch {
      // torch not actually controllable on this device
      this.torchAvailable.set(false);
    }
  }

  submitManual(): void {
    const code = normalizeBarcode(this.manualCode());
    if (!code) {
      return;
    }
    this.finish(code, 'manual');
  }

  cancel(): void {
    this.done = true;
    this.teardown();
    void this.modalCtrl.dismiss(null);
  }

  private finish(
    code: string,
    source: 'scan' | 'manual',
    format?: string
  ): void {
    if (this.done) {
      return;
    }
    this.done = true;
    this.teardown();
    const result: BarcodeScanResult = { code, source, format };
    void this.modalCtrl.dismiss(result);
  }

  private armManualHint(): void {
    this.hintTimer = setTimeout(
      () => this.showManualHint.set(true),
      MANUAL_HINT_DELAY_MS
    );
  }

  private handleStartError(err: unknown): void {
    const name = (err as { name?: string })?.name;
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      this.status.set('denied');
    } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
      this.status.set('unavailable');
    } else {
      this.status.set('error');
    }
  }

  private teardown(): void {
    if (this.rafId != null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.hintTimer) {
      clearTimeout(this.hintTimer);
      this.hintTimer = null;
    }
    try {
      this.zxingControls?.stop();
    } catch {
      // reader already stopped
    }
    this.zxingControls = null;
    this.detector = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }
}
