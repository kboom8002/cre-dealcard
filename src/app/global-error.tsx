'use client';

import React, { useEffect } from 'react';
import {
  generateErrorReferenceCode,
  reportClientOrServerError,
} from '@/lib/observability/error-reporter';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const refCode = generateErrorReferenceCode(error);

  useEffect(() => {
    void reportClientOrServerError(error, {
      boundary: 'global-error',
      digest: error?.digest,
    });
  }, [error]);

  return (
    <html lang="ko">
      <body
        style={{
          margin: 0,
          padding: 0,
          fontFamily: 'system-ui, -apple-system, sans-serif',
          background: '#09090b',
          color: '#f4f4f5',
        }}
      >
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
          }}
        >
          <div
            style={{
              maxWidth: '440px',
              width: '100%',
              textAlign: 'center',
              background: '#18181b',
              border: '1px solid #27272a',
              borderRadius: '16px',
              padding: '32px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
            }}
          >
            <div
              aria-hidden="true"
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: 'rgba(239, 68, 68, 0.1)',
                color: '#ef4444',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '24px',
                margin: '0 auto 16px auto',
              }}
            >
              ⚠️
            </div>
            <h1
              style={{
                fontSize: '20px',
                fontWeight: 'bold',
                margin: '0 0 8px 0',
                color: '#ffffff',
              }}
            >
              시스템 오류가 발생했습니다
            </h1>
            <p
              style={{
                fontSize: '15px',
                color: '#d4d4d8',
                margin: '0 0 16px 0',
                lineHeight: '1.6',
              }}
            >
              일시적인 화면 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.
            </p>
            <p
              style={{
                fontSize: '12px',
                color: '#a1a1aa',
                fontFamily: 'monospace',
                margin: '0 0 24px 0',
              }}
            >
              오류 참조코드: {refCode}
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => reset()}
                className="min-h-[48px] px-5 rounded-xl font-semibold"
                style={{
                  minHeight: '48px',
                  padding: '12px 20px',
                  background: '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '15px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                다시 시도하기
              </button>
              <button
                type="button"
                onClick={() => {
                  window.location.href = '/';
                }}
                className="min-h-[48px] px-5 rounded-xl font-medium"
                style={{
                  minHeight: '48px',
                  padding: '12px 20px',
                  background: '#27272a',
                  color: '#e4e4e7',
                  border: '1px solid #3f3f46',
                  borderRadius: '10px',
                  fontSize: '15px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                홈으로 이동
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
