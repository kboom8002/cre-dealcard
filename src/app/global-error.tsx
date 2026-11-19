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
          background: '#F8FAFC',
          color: '#0F172A',
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
              background: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: '16px',
              padding: '32px',
              boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.08)',
            }}
          >
            <div
              aria-hidden="true"
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: '#FEF2F2',
                border: '1px solid #FECACA',
                color: '#DC2626',
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
                color: '#0F172A',
              }}
            >
              시스템 오류가 발생했습니다
            </h1>
            <p
              style={{
                fontSize: '15px',
                color: '#334155',
                margin: '0 0 16px 0',
                lineHeight: '1.6',
              }}
            >
              일시적인 화면 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.
            </p>
            <p
              style={{
                fontSize: '14px',
                color: '#475569',
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
                  background: '#2563EB',
                  color: '#FFFFFF',
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
                  background: '#F1F5F9',
                  color: '#0F172A',
                  border: '1px solid #CBD5E1',
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
