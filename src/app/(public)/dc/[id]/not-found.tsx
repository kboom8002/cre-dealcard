import React from "react";

export default function DealCardNotFound() {
  return (
    <main
      data-testid="dealcard-notfound-screen"
      className="min-h-screen bg-[#FAF9F6] text-stone-900 flex items-center justify-center px-4 py-12"
    >
      <div className="max-w-md w-full bg-white rounded-3xl border border-stone-200 p-6 sm:p-8 text-center space-y-4 shadow-sm">
        <span className="inline-flex items-center px-3.5 py-1.5 rounded-full bg-stone-100 text-stone-700 border border-stone-200 text-sm font-bold">
          매물 안내 종료
        </span>
        <h1 className="text-xl sm:text-2xl font-extrabold text-stone-900 leading-snug break-keep">
          거래가 완료되었거나 비공개 전환된 매물입니다
        </h1>
        <p className="text-base text-stone-600 leading-relaxed break-keep">
          요청하신 매물은 중개 진행 상황에 따라 공개가 종료되었습니다. 유사 조건의 다른 매물 안내는 공유받으신 담당 공인중개사에게 문의해 주세요.
        </p>
      </div>
    </main>
  );
}
