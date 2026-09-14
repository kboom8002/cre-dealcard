'use client';

import React from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ko">
      <body style={{ margin: 0, padding: 0, fontFamily: 'system-ui, -apple-system, sans-serif', background: '#09090b', color: '#f4f4f5' }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <div style={{ maxWidth: '440px', width: '100%', textAlign: 'center', background: '#18181b', border: '1px solid #27272a', borderRadius: '16px', padding: '32px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', margin: '0 auto 16px auto' }}>
              ⚠️
            </div>
            <h1 style={{ fontSize: '18px', fontWeight: 'bold', margin: '0 0 8px 0', color: '#ffffff' }}>
              시스템 오류가 발생했습니다
            </h1>
            <p style={{ fontSize: '13px', color: '#a1a1aa', margin: '0 0 20px 0', lineHeight: '1.5' }}>
              {error.message || '애플리케이션을 초기화하는 중 문제가 발생했습니다. 일시적인 현상일 수 있으니 다시 시도해 주세요.'}
            </p>
            {error.digest && (
              <p style={{ fontSize: '11px', color: '#71717a', fontFamily: 'monospace', margin: '0 0 20px 0' }}>
                Error Code: {error.digest}
              </p>
            )}
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button
                onClick={() => reset()}
                style={{ padding: '8px 16px', background: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}
              >
                다시 시도
              </button>
              <button
                onClick={() => { window.location.href = '/'; }}
                style={{ padding: '8px 16px', background: '#27272a', color: '#e4e4e7', border: '1px solid #3f3f46', borderRadius: '8px', fontSize: '13px', fontWeight: '500', cursor: 'pointer' }}
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
