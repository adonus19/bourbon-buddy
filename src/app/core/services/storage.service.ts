import { Injectable, inject } from '@angular/core';
import {
  Storage,
  getDownloadURL,
  ref,
  uploadBytes,
} from '@angular/fire/storage';

import { resizeImageToJpeg } from '../../shared/utils/image';

/**
 * Firebase Storage uploads. Stateless action service — no listeners/state.
 * Paths follow the data model: /avatars/{uid}/...  /labels/{uid}/{entryId}/...
 */
@Injectable({ providedIn: 'root' })
export class StorageService {
  private readonly storage = inject(Storage);

  /** Downscales then uploads an avatar; returns its download URL. */
  async uploadAvatar(uid: string, file: File): Promise<string> {
    const jpeg = await resizeImageToJpeg(file, 512);
    const avatarRef = ref(this.storage, `avatars/${uid}/avatar.jpg`);
    await uploadBytes(avatarRef, jpeg, { contentType: 'image/jpeg' });
    return getDownloadURL(avatarRef);
  }
}
