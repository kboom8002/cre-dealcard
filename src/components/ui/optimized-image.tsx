import Image from 'next/image';

interface OptimizedImageProps {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  className?: string;
  fill?: boolean;
}

export function OptimizedImage({ src, alt, width, height, className, fill }: OptimizedImageProps) {
  if (!src) return null;
  
  // 외부 URL (Supabase Storage 등)
  if (src.startsWith('http')) {
    return fill
      ? <Image src={src} alt={alt} fill className={className} sizes="100vw" />
      : <Image src={src} alt={alt} width={width || 400} height={height || 300} className={className} />;
  }
  
  return fill
    ? <Image src={src} alt={alt} fill className={className} sizes="100vw" />
    : <Image src={src} alt={alt} width={width || 400} height={height || 300} className={className} />;
}
