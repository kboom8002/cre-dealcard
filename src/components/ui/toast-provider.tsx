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
          background: '#1a2332',
          border: '1px solid #2d3748',
          color: '#e7ecf2',
          fontFamily: 'Pretendard, sans-serif',
          fontSize: '14px',
        },
      }}
    />
  );
}
