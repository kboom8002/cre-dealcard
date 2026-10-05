"use client";

/**
 * PreviewReceiver — 에디터 iframe 미리보기 수신기 (E-03, U-02 브리지의 뷰어 측)
 *
 * `/magazine/{slug}/{date}?preview=1&edition={id}` 진입 시:
 *  1) 마운트 후 `cre-preview:ready` 를 부모(window.parent)로 보낸다 (초안 수신 전까지 1초 간격 재시도, 최대 20회).
 *  2) 부모의 `cre-preview:draft` 를 받아 그 content 로 뷰어(MagazineView, preview 모드)를 렌더하고 `ack` 로 응답한다.
 *
 * 보안/격리:
 *  - 같은 origin 이면서 `event.source === window.parent` 인 메시지만 수락 (isAllowedOrigin).
 *  - editionId 불일치·형식 오류(parsePreviewMessage=null)·오래된 seq(shouldApplyDraft)는 무시 → seq 역전 방지.
 *  - 서버는 공개 데이터를 바꾸지 않는다. 초안은 메시지로만 들어오므로 URL 만으로는 아무것도 보이지 않는다.
 *  - MagazineView 는 `preview` 로 렌더 → 분석 비콘(enabled:false)·설문·구독·전달하기 제출 비활성, 하단 바는 정적 목업.
 */
import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { MagazineView } from "@/app/(magazine)/magazine/[brokerId]/[date]/magazine-view";
import {
  buildAckMessage,
  buildReadyMessage,
  isAllowedOrigin,
  parsePreviewMessage,
  PREVIEW_MSG_DRAFT,
  shouldApplyDraft,
} from "@/lib/magazine/preview-bridge";

interface PreviewReceiverProps {
  /** `?edition=` — 없으면 초안을 받을 수 없다 */
  editionId: string | null;
  brokerId: string;
  brokerSlug: string | null;
  date: string;
  dateLabel: string;
  target?: string;
}

const READY_RETRY_MS = 1000;
const READY_RETRY_MAX = 20;

const subscribeNoop = () => () => {};

export function PreviewReceiver({ editionId, brokerId, brokerSlug, date, dateLabel, target }: PreviewReceiverProps) {
  const [draft, setDraft] = useState<Record<string, unknown> | null>(null);
  const lastSeqRef = useRef(0);
  // 서버 스냅샷은 true(대기 문구) — hydration 불일치 없이 클라이언트에서 실제 값으로 갱신된다.
  const embedded = useSyncExternalStore(subscribeNoop, () => window.parent !== window, () => true);

  useEffect(() => {
    if (!editionId || window.parent === window) return;
    const selfOrigin = window.location.origin;
    const parent = window.parent;

    const onMessage = (ev: MessageEvent) => {
      if (ev.source !== parent) return;
      if (!isAllowedOrigin(ev.origin, selfOrigin)) return;
      const msg = parsePreviewMessage(ev.data);
      if (!msg || msg.type !== PREVIEW_MSG_DRAFT || msg.editionId !== editionId) return;
      if (!shouldApplyDraft(lastSeqRef.current, msg)) return; // 늦게 도착한 오래된 draft 무시
      lastSeqRef.current = msg.seq;
      setDraft(msg.content);
      parent.postMessage(buildAckMessage(editionId, msg.seq), selfOrigin);
    };
    window.addEventListener("message", onMessage);

    const sendReady = () => parent.postMessage(buildReadyMessage(editionId), selfOrigin);
    sendReady();
    let tries = 1;
    const timer = window.setInterval(() => {
      if (lastSeqRef.current > 0 || tries >= READY_RETRY_MAX) {
        window.clearInterval(timer);
        return;
      }
      tries += 1;
      sendReady();
    }, READY_RETRY_MS);

    return () => {
      window.removeEventListener("message", onMessage);
      window.clearInterval(timer);
    };
  }, [editionId]);

  if (draft) {
    return (
      <MagazineView
        data={draft}
        brokerId={brokerId}
        brokerSlug={brokerSlug}
        date={date}
        dateLabel={dateLabel}
        target={target}
        preview
      />
    );
  }

  const message = !editionId
    ? "미리보기할 에디션이 지정되지 않았습니다. 에디터의 미리보기 화면에서 열어 주세요."
    : !embedded
      ? "이 화면은 에디터 미리보기 전용입니다. 에디터에서 열어 주세요."
      : "에디터의 초안을 불러오는 중입니다…";

  return (
    <div className="min-h-screen w-full" style={{ background: "linear-gradient(180deg, #050510 0%, #0a0a1a 40%, #080814 100%)" }}>
      <main id="magazine-main" className="mx-auto max-w-[440px] px-4 py-24 text-center">
        <h1 className="text-title font-extrabold text-white">매거진 미리보기</h1>
        <p role="status" className="mt-3 text-label text-ink-muted">{message}</p>
      </main>
    </div>
  );
}
