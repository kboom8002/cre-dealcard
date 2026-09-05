import type { PhotoAsset } from '../../im-core/proposals/photo-asset-manager';

export type AdaptiveLayoutMode =
  | 'no_photos'
  | 'single_hero'
  | 'tri_grid'
  | 'gallery_swipe'
  | 'tabbed_gallery';

export function determinePhotoLayoutMode(photos: PhotoAsset[]): AdaptiveLayoutMode {
  const count = photos.length;
  if (count === 0) return 'no_photos';
  if (count === 1) return 'single_hero';
  if (count <= 4) return 'tri_grid';
  if (count <= 9) return 'gallery_swipe';
  return 'tabbed_gallery';
}

export interface AdaptivePhotoLayoutProps {
  photos: PhotoAsset[];
  propertyTitle: string;
}

export const AdaptivePhotoLayout: React.FC<AdaptivePhotoLayoutProps> = ({
  photos,
  propertyTitle,
}) => {
  const mode = determinePhotoLayoutMode(photos);

  if (mode === 'no_photos') {
    return (
      <div data-testid="layout-no-photos" className="p-6 bg-muted/40 rounded-xl border text-center">
        <p className="text-sm font-medium text-muted-foreground">
          사진 정보 미제공 매물 (공부 및 제원 정보 중심 제공)
        </p>
      </div>
    );
  }

  if (mode === 'single_hero') {
    return (
      <div data-testid="layout-single-hero" className="rounded-xl overflow-hidden shadow">
        <img
          src={photos[0].fileUrl}
          alt={propertyTitle}
          className="w-full h-64 object-cover"
        />
      </div>
    );
  }

  if (mode === 'tri_grid') {
    return (
      <div data-testid="layout-tri-grid" className="grid grid-cols-2 gap-2">
        <img
          src={photos[0].fileUrl}
          alt="메인 외관"
          className="col-span-2 w-full h-48 object-cover rounded-lg"
        />
        {photos.slice(1, 3).map((p, idx) => (
          <img
            key={p.id ?? idx}
            src={p.fileUrl}
            alt={`보조 사진 ${idx + 1}`}
            className="w-full h-24 object-cover rounded-lg"
          />
        ))}
      </div>
    );
  }

  return (
    <div data-testid={`layout-${mode}`} className="relative">
      <div className="flex overflow-x-auto gap-2 snap-x">
        {photos.map((p, idx) => (
          <img
            key={p.id ?? idx}
            src={p.fileUrl}
            alt={`갤러리 사진 ${idx + 1}`}
            className="w-72 h-48 object-cover rounded-xl snap-center flex-shrink-0"
          />
        ))}
      </div>
      <p className="text-xs text-right text-muted-foreground mt-1">총 {photos.length}장의 사진</p>
    </div>
  );
};
