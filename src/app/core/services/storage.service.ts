import { Injectable, inject } from '@angular/core';
import {
  Storage,
  deleteObject,
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

  /** Downscales then uploads a bottle label photo; returns its download URL. */
  async uploadLabel(uid: string, entryId: string, file: File): Promise<string> {
    const jpeg = await resizeImageToJpeg(file, 1024);
    const labelRef = ref(this.storage, `labels/${uid}/${entryId}/label.jpg`);
    await uploadBytes(labelRef, jpeg, { contentType: 'image/jpeg' });
    return getDownloadURL(labelRef);
  }

  /** Removes a bottle label photo (best-effort; ignores "not found"). */
  async deleteLabel(uid: string, entryId: string): Promise<void> {
    try {
      await deleteObject(ref(this.storage, `labels/${uid}/${entryId}/label.jpg`));
    } catch {
      // Already gone / never existed — nothing to do.
    }
  }
}
