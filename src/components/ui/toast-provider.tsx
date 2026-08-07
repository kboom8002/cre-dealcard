'use client';
import { Toaster } from 'sonner';

export function ToastProvider() {
  return (
    <Toaster
      position="top-center"
      richColors
      toastOptions={{
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
