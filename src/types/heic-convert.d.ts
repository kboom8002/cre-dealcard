declare module "heic-convert" {
  export interface HeicConvertOptions {
    buffer: Buffer | Uint8Array | ArrayBuffer;
    format: "JPEG" | "PNG";
    quality?: number;
  }

  export default function heicConvert(
    options: HeicConvertOptions
  ): Promise<ArrayBuffer | Buffer | Uint8Array>;
}
