"use client";

import { toast } from "sonner";
import { createEditorToaster, type ToastKind } from "@/lib/magazine/editor-toast";

/**
 * 에디터 전용 토스트 — 단일 슬롯 + 중복 억제 (T2-34).
 * 에디터 영역의 모든 토스트는 `toast` 대신 이것을 사용한다.
 */
export const editorToast = createEditorToaster({
  show(kind: ToastKind, message: string, options: { id: string }) {
    return toast[kind](message, options);
  },
});
