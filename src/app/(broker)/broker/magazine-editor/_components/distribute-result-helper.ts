export interface DistributeOutcomeCardData {
  tone: 'success' | 'warning' | 'info' | 'error';
  title: string;
  message: string;
  sent: number;
  queued: number;
  recorded: number;
  failed: number;
  blockedTotal: number;
  blockedReasons: Array<{ code: string; label: string; count: number }>;
  dryRun: boolean;
}

const DISTRIBUTE_BLOCK_LABELS: Readonly<Record<string, string>> = {
  SEND_DISABLED: '발송 기능 일시 중지(관리자 설정)',
  NOT_ALLOWLISTED: '허용 목록 외 수신자 제외',
  NO_CONSENT: '수신 동의 기록 없음',
  PENDING_CONFIRM: '수신자 확인 링크 클릭 대기 중',
  CHANNEL_NOT_CONSENTED: '해당 채널 수신 미동의',
  CHANNEL_NOT_AVAILABLE: '유료 요금제 전용 채널(알림톡)',
  QUIET_HOURS: '야간 발송 제한 시간(21:00~08:00 KST)',
  MISSING_UNSUB_LINK: '수신거부 링크 미설정',
  MISSING_AD_LABEL: '(광고) 표기 누락',
  MISSING_SENDER: '발신자 명칭·연락처 누락',
  DUPLICATE: '동일 회차 중복 발송 방지',
  DAILY_CAP: '일일 발송 상한 초과',
  UNSUBSCRIBED: '수신거부·차단 수신자',
  SUPPRESSED: '반송·스팸신고 차단 수신자',
  NO_PROVIDER: '발송 수단(API 키) 미설정',
  LEDGER_UNAVAILABLE: '발송 원장 점검 필요',
  STATUTORY_DISCLOSURE_INCOMPLETE: '공인중개사법 필수 표시 정보 누락',
};

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0;
}

export function formatDistributeOutcomeBanner(
  distJson: Record<string, unknown> | null,
  statusCode: number,
  publicUrl?: string,
): DistributeOutcomeCardData {
  const j = distJson ?? {};
  const result = (j.result && typeof j.result === 'object' ? j.result : {}) as Record<string, unknown>;
  const sent = num(j.sent ?? result.sent);
  const queued = num(j.queued ?? result.queued);
  const recorded = num(j.recorded ?? result.recorded);
  const failed = num(j.failed ?? result.failed);
  const dryRun = j.dryRun === true || result.dryRun === true;

  const blockedByCode = new Map<string, { code: string; label: string; count: number }>();
  const rawBlockedMap =
    (result.blocked && typeof result.blocked === 'object' ? result.blocked : null) ??
    (j.blocked && typeof j.blocked === 'object' ? j.blocked : null) ??
    {};
  for (const [code, cnt] of Object.entries(rawBlockedMap as Record<string, unknown>)) {
    const c = num(cnt);
    if (c > 0) {
      const existing = blockedByCode.get(code);
      blockedByCode.set(code, {
        code,
        label: DISTRIBUTE_BLOCK_LABELS[code] ?? code,
        count: existing ? Math.max(existing.count, c) : c,
      });
    }
  }
  if (typeof j.blocked === 'string' && j.blocked && !blockedByCode.has(j.blocked)) {
    blockedByCode.set(j.blocked, {
      code: j.blocked,
      label: DISTRIBUTE_BLOCK_LABELS[j.blocked] ?? j.blocked,
      count: 1,
    });
  }
  const blockedReasons = Array.from(blockedByCode.values());
  const blockedTotal = blockedReasons.reduce((sum, r) => sum + r.count, 0);
  const reasonText = blockedReasons.map((r) => `${r.label}${r.count > 1 ? ` ${r.count}건` : ''}`).join(', ');

  const errObj = j.error && typeof j.error === 'object' ? (j.error as Record<string, unknown>) : null;
  if (
    statusCode === 422 ||
    j.code === 'STATUTORY_DISCLOSURE_INCOMPLETE' ||
    errObj?.code === 'STATUTORY_DISCLOSURE_INCOMPLETE'
  ) {
    const errMsg =
      typeof j.error === 'string'
        ? j.error
        : typeof errObj?.message === 'string'
          ? errObj.message
          : '프로필 설정에서 중개사무소 개설등록번호 등 5대 법정 표시 항목을 먼저 등록해 주세요.';
    return {
      tone: 'error',
      title: '법정 표시 정보 미비로 발송할 수 없습니다',
      message: errMsg,
      sent: 0,
      queued: 0,
      recorded: 0,
      failed: 0,
      blockedTotal: Math.max(1, blockedTotal),
      blockedReasons:
        blockedReasons.length > 0
          ? blockedReasons
          : [{ code: 'STATUTORY_DISCLOSURE_INCOMPLETE', label: DISTRIBUTE_BLOCK_LABELS.STATUTORY_DISCLOSURE_INCOMPLETE, count: 1 }],
      dryRun,
    };
  }

  if (j.asyncQueued === true && queued > 0) {
    return {
      tone: 'success',
      title: '대량 발송 대기열에 등록되었습니다',
      message: `구독자 발송 대상 ${queued.toLocaleString('ko-KR')}건을 백그라운드 대기열에 안전하게 등록했습니다.${dryRun ? ' (드라이런 모드: 실제 발송 없음)' : ' 1분 단위로 순차 발송됩니다.'}`,
      sent,
      queued,
      recorded,
      failed,
      blockedTotal,
      blockedReasons,
      dryRun,
    };
  }

  if (sent > 0) {
    const suffix = [
      blockedTotal > 0 ? `차단 ${blockedTotal}건(${reasonText})` : '',
      failed > 0 ? `실패 ${failed}건` : '',
    ]
      .filter(Boolean)
      .join(' · ');
    return {
      tone: 'success',
      title: `구독자 ${sent.toLocaleString('ko-KR')}건 발송 완료`,
      message: suffix
        ? `구독자 ${sent.toLocaleString('ko-KR')}건에 뉴스레터를 발송했습니다. (${suffix})`
        : `구독자 ${sent.toLocaleString('ko-KR')}건에 뉴스레터를 발송했습니다.`,
      sent,
      queued,
      recorded,
      failed,
      blockedTotal,
      blockedReasons,
      dryRun,
    };
  }

  if (dryRun && recorded > 0) {
    return {
      tone: 'info',
      title: '시험 발송(드라이런) 기록 완료 — 실제 발송 0건',
      message: `드라이런 모드로 대상 ${recorded.toLocaleString('ko-KR')}건의 발송 시뮬레이션만 원장에 기록했습니다.${blockedTotal > 0 ? ` 차단 ${blockedTotal}건: ${reasonText}` : ''}`,
      sent: 0,
      queued: 0,
      recorded,
      failed,
      blockedTotal,
      blockedReasons,
      dryRun: true,
    };
  }

  const fallbackMsg =
    reasonText
      ? `웹 발행은 완료되었으나 자동 발송은 실행되지 않았습니다. (사유: ${reasonText})`
      : failed > 0
        ? `발송 중 실패 ${failed}건이 발생하여 자동 발송이 완료되지 않았습니다.${publicUrl ? ' 필요 시 아래 링크를 직접 전달해 주세요.' : ''}`
        : '웹 발행은 완료되었으나 발송 가능한 활성 수신 동의 구독자가 없어 0건 처리되었습니다.';

  return {
    tone: 'warning',
    title: '웹 발행 완료 · 자동 발송 0건(차단/미발송)',
    message: fallbackMsg,
    sent: 0,
    queued: 0,
    recorded,
    failed,
    blockedTotal,
    blockedReasons,
    dryRun,
  };
}
