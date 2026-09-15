import 'pptxgenjs';

declare module 'pptxgenjs' {
  interface PptxGenJS {
    slides: PptxGenJS.Slide[];
    _slides?: PptxGenJS.Slide[];
  }
}
