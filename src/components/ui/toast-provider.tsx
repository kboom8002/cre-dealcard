'use client';
import { Toaster } from 'sonner';

export function ToastProvider() {
  return (
    <Toaster
      position="bottom-right"
      duration={8000}
      richColors
      closeButton
      visibleToasts={3}
      toastOptions={{
        duration: 8000,
        style: {
          background: '#FFFFFF',
          border: '1px solid #CBD5E1',
          color: '#0F172A',
          fontFamily: 'var(--font-noto-kr), system-ui, sans-serif',
          fontSize: 'max(14px, 0.875rem)',
          boxShadow: '0 8px 24px rgba(15, 23, 42, 0.12)',
        },
      }}
    />
  );
}
