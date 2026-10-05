"use client";

/**
 * BrokerAvatar — 중개사 사진 로드 실패 시 이니셜 아바타로 폴백하는 클라이언트 섬 (E-03 U-06).
 * onError 핸들러가 필요해 서버 컴포넌트(BrokerProfileSection)에서 분리했다.
 * 사진은 임의 외부 URL 이라 next/image(remotePatterns 제한)를 쓰지 않고 크기를 명시한 지연 로드 <img> 를 쓴다.
 */
import React, { useState } from "react";
import { InitialAvatar } from "@/components/magazine/InitialAvatar";

export function BrokerAvatar({ name, photoUrl }: { name: string; photoUrl?: string | null }) {
  const [failed, setFailed] = useState(false);
  if (photoUrl && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt={`${name} 프로필`}
        width={56}
        height={56}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className="h-14 w-14 shrink-0 rounded-full object-cover"
      />
    );
  }
  return <InitialAvatar name={name} size={56} />;
}
