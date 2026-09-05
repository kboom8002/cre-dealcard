import { randomUUID } from 'crypto';

export type PhotoCategory = 'facade' | 'common_area' | 'interior' | 'floor_plan' | 'surroundings';

export interface PhotoAsset {
  id: string;
  dealId: string;
  category: PhotoCategory;
  fileUrl: string;
  rawHash: string;
  widthPx: number;
  heightPx: number;
  effectiveDpi: number;
  maskingApproved: boolean; // G20 Photo PII masking
  capturedAt?: string;
}

export class PhotoAssetManager {
  private assets: Map<string, PhotoAsset> = new Map();

  registerPhoto(asset: Omit<PhotoAsset, 'id'>): PhotoAsset {
    const photo: PhotoAsset = {
      ...asset,
      id: randomUUID(),
    };
    this.assets.set(photo.id, photo);
    return photo;
  }

  getDealPhotos(dealId: string): PhotoAsset[] {
    return Array.from(this.assets.values()).filter((a) => a.dealId === dealId);
  }

  validateMinDpi(assetId: string, minDpi = 150): boolean {
    const asset = this.assets.get(assetId);
    if (!asset) return false;
    return asset.effectiveDpi >= minDpi;
  }

  validateMaskingApproved(assetId: string): boolean {
    const asset = this.assets.get(assetId);
    if (!asset) return false;
    return asset.maskingApproved === true;
  }
}
