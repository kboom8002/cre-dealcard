"use client";

import React from "react";
import { Building2 } from "lucide-react";
import { AiCommentRecommendButton } from "@/components/broker/studio/AiCommentRecommendButton";

export interface AssignableDealItem {
  id: string;
  title: string;
  address: string;
  price: string;
  yield: string;
  photoUrl: string | null;
  areaSignal?: string;
}

export interface DealSlotAssignerProps {
  deals: AssignableDealItem[];
  selectedDealIds: string[];
  onToggleDeal: (dealId: string) => void;
  dealComments?: Record<string, string>;
  onChangeDealComment?: (dealId: string, comment: string) => void;
}

export function DealSlotAssigner({
  deals,
  selectedDealIds,
  onToggleDeal,
  dealComments = {},
  onChangeDealComment,
}: DealSlotAssignerProps) {
  return (
    <section
      data-testid="deal-slot-assigner"
      aria-label="뉴스레터 추천 매물 고르기"
      className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xs space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-blue-700" aria-hidden="true" />
          <h3 className="text-base font-extrabold text-slate-900">
            추천 매물 고르기
          </h3>
        </div>
        <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-bold text-blue-900">
          선택됨 {selectedDealIds.length}건
        </span>
      </div>

      {deals.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center space-y-1">
          <p className="text-base font-bold text-slate-800">
            아직 등록된 매물이 없습니다
          </p>
          <p className="text-sm font-medium text-slate-600">
            매물 카드 작업공간에서 매물을 등록하면 이곳에서 바로 선택해 넣을 수 있습니다.
          </p>
        </div>
      ) : (
        <ul className="space-y-3" role="list">
          {deals.map((deal) => {
            const isSelected = selectedDealIds.includes(deal.id);
            const currentComment = dealComments[deal.id] ?? "";
            const commentInputId = `deal-comment-input-${deal.id}`;
            const fallbackSeed = [deal.title, deal.address, deal.price, deal.yield]
              .filter((v) => v && v !== "-")
              .join(" · ");

            return (
              <li
                key={deal.id}
                data-testid={`deal-slot-item-${deal.id}`}
                className={`rounded-2xl border p-4 transition-all space-y-3 ${
                  isSelected
                    ? "border-blue-600 bg-blue-50/40 shadow-2xs"
                    : "border-slate-200 bg-white hover:bg-slate-50"
                }`}
              >
                <label
                  htmlFor={`deal-checkbox-${deal.id}`}
                  className="flex min-h-[48px] w-full cursor-pointer items-center justify-between gap-3"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <input
                      id={`deal-checkbox-${deal.id}`}
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleDeal(deal.id)}
                      aria-label={`${deal.title} 매물 선택`}
                      className="h-5 w-5 shrink-0 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                    />
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                      {deal.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={deal.photoUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <Building2
                          className="h-6 w-6 text-slate-500"
                          aria-hidden="true"
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-extrabold text-slate-900">
                        {deal.title}
                      </p>
                      <p className="truncate text-sm font-medium text-slate-600">
                        {deal.address} · 매매가 {deal.price}
                        {deal.yield && deal.yield !== "-" ? ` · 연 수익률 ${deal.yield}` : ""}
                      </p>
                    </div>
                  </div>

                  <span
                    aria-hidden="true"
                    className={`shrink-0 inline-flex min-h-[40px] items-center rounded-xl border px-3.5 py-1.5 text-sm font-extrabold transition ${
                      isSelected
                        ? "border-blue-700 bg-blue-700 text-white"
                        : "border-slate-300 bg-white text-slate-800"
                    }`}
                  >
                    {isSelected ? "✓ 선택됨" : "+ 담기"}
                  </span>
                </label>

                {isSelected && onChangeDealComment && (
                  <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label
                        htmlFor={commentInputId}
                        className="text-sm font-extrabold text-slate-800"
                      >
                        이 매물 한 줄 추천글
                      </label>
                      <AiCommentRecommendButton
                        currentValue={currentComment}
                        fallbackContext={fallbackSeed}
                        onChangeValue={(next) => onChangeDealComment(deal.id, next)}
                        label="AI로 추천글 쓰기"
                        ariaLabel={`${deal.title} AI로 추천글 쓰기`}
                      />
                    </div>
                    <input
                      id={commentInputId}
                      type="text"
                      value={currentComment}
                      onChange={(e) => onChangeDealComment(deal.id, e.target.value)}
                      placeholder="예: 역세권 도보 3분 코너 건물로 임차 수요가 꾸준합니다."
                      className="w-full min-h-[48px] rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base font-medium text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
