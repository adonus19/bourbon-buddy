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

  // --- On-device diagnostics (temporary, BB-174 iOS debugging) ------------
  readonly diag = signal<string[]>([]);
  private readonly t0 = Date.now();
  private frames = 0;

  private log(msg: string): void {
    const line = `+${Date.now() - this.t0}ms ${msg}`;
    // eslint-disable-next-line no-console
    console.log('[scanner]', line);
    this.diag.update((lines) => [...lines, line].slice(-16));
  }

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

  async copyDiag(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.diag().join('\n'));
      this.log('diagnostics copied');
    } catch {
      this.log('clipboard unavailable — screenshot instead');
    }
  }

  private async start(): Promise<void> {
    const nav = navigator as Navigator & { standalone?: boolean };
    this.log(
      `env standalone=${nav.standalone ?? 'n/a'} secure=${window.isSecureContext} ` +
        `mediaDevices=${!!navigator.mediaDevices} ` +
        `getUserMedia=${!!navigator.mediaDevices?.getUserMedia} ` +
        `BarcodeDetector=${'BarcodeDetector' in globalThis}`
    );
    const video = this.videoRef?.nativeElement;
    if (!video) {
      this.log('no <video> element');
      this.status.set('error');
      return;
    }
    try {
      // Own the camera ourselves and wait for real dimensions BEFORE decoding.
      // On iOS Safari, video "plays" before loadedmetadata sets videoWidth, and
      // ZXing sizes its capture canvas once at loop start — so handing it a
      // not-yet-sized element yields a 0×0 canvas that never decodes.
      await this.startCamera(video);

      const Detector = (globalThis as Record<string, unknown>)[
        'BarcodeDetector'
      ] as BarcodeDetectorCtor | undefined;
      if (Detector) {
        this.log('decode path: native BarcodeDetector');
        this.startNativeLoop(video, Detector);
      } else {
        this.log('decode path: ZXing');
        await this.startZxing(video);
      }
      this.status.set('scanning');
      this.armManualHint();
    } catch (err) {
      const e = err as { name?: string; message?: string };
      this.log(`START ERROR ${e?.name ?? '?'}: ${e?.message ?? err}`);
      this.handleStartError(err);
    }
  }

  /** Acquire the back camera, attach it, and wait until it has real dimensions. */
  private async startCamera(video: HTMLVideoElement): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw Object.assign(new Error('getUserMedia unavailable'), {
        name: 'NotFoundError',
      });
    }
    // iOS requires an inline, muted video to autoplay a camera stream.
    video.setAttribute('playsinline', 'true');
    video.muted = true;
    this.log('requesting camera…');
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
    });
    const track = this.stream.getVideoTracks()[0];
    const s = track?.getSettings?.() ?? {};
    this.log(
      `stream ok tracks=${this.stream.getVideoTracks().length} ` +
        `facing=${s.facingMode ?? '?'} ${s.width ?? '?'}x${s.height ?? '?'}`
    );
    video.srcObject = this.stream;
    try {
      await video.play();
      this.log('video.play() ok');
    } catch (e) {
      this.log(`video.play() failed: ${(e as Error)?.name ?? e}`);
    }
    await this.waitForVideoDimensions(video);
    this.log(`video dims ${video.videoWidth}x${video.videoHeight}`);
    this.detectTorch();
  }

  /** Resolve once the video reports non-zero dimensions (bounded, never hangs). */
  private waitForVideoDimensions(video: HTMLVideoElement): Promise<void> {
    if (video.videoWidth > 0) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      let settled = false;
      const finish = (): void => {
        if (settled) {
          return;
        }
        settled = true;
        video.removeEventListener('loadedmetadata', check);
        clearInterval(poll);
        clearTimeout(safety);
        resolve();
      };
      const check = (): void => {
        if (video.videoWidth > 0) {
          finish();
        }
      };
      video.addEventListener('loadedmetadata', check);
      const poll = setInterval(check, 100);
      const safety = setTimeout(finish, 3000); // proceed regardless after 3s
    });
  }

  private startNativeLoop(
    video: HTMLVideoElement,
    Detector: BarcodeDetectorCtor
  ): void {
    this.detector = new Detector({
      formats: ['upc_a', 'upc_e', 'ean_13', 'ean_8'],
    });
    const tick = async (): Promise<void> => {
      if (this.done || !this.detector) {
        return;
      }
      try {
        const found = await this.detector.detect(video);
        this.frames++;
        if (this.frames === 1 || this.frames % 30 === 0) {
          this.log(`native frame ${this.frames} found=${found.length}`);
        }
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
    // Decode from the element we already started (does not re-attach/dispose the
    // stream), so the capture canvas is sized from a video that already has
    // real dimensions.
    this.zxingControls = await reader.decodeFromVideoElement(
      video,
      (result, error) => {
        this.frames++;
        // The callback fires every frame with either a result or a decode error;
        // sampling it confirms the loop is running and what it's seeing.
        if (this.frames === 1 || this.frames % 30 === 0) {
          this.log(
            `zxing frame ${this.frames} ${video.videoWidth}x${video.videoHeight} ` +
              `err=${error?.name ?? '-'}`
          );
        }
        if (this.done || !result) {
          return;
        }
        this.log(`DECODED ${result.getText()}`);
        const code = normalizeBarcode(result.getText());
        if (code) {
          this.finish(code, 'scan', BarcodeFormat[result.getBarcodeFormat()]);
        }
      }
    );
    this.log('zxing decode loop started');
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
