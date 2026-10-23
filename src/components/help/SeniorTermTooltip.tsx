"use client";

import React, { useState, useRef, useEffect } from "react";
import { BROKER_GLOSSARY_LIST, POSTURE_GUIDE_ROWS } from "@/lib/tutorial/broker-tutorial-data";
import { useSeniorHelp } from "./SeniorHelpContext";

export interface BuiltinTermEntry {
  title: string;
  easyMeaning: string;
  tip?: string;
}

export const BUILTIN_TERMS: Record<string, BuiltinTermEntry> = {
  // 1. 수신자 화면
  "수신자 화면": {
    title: "📱 수신자 화면 (고객 보호 블라인드 화면)",
    easyMeaning:
      "매수 고객님께 카카오톡으로 보냈을 때 고객님 휴대폰에 실제로 보이는 화면입니다. 상세 지번(예: 114번지)과 건물명, 호실별 임차인 실명은 자동으로 가려지고 '중구 쌍림동 역세권'처럼 안전하게 표시됩니다.",
    tip: "카톡으로 보내기 전에 [수신자 화면]을 눌러 지번이 잘 가려졌는지 5초만 확인하시면 매물 뺏길 걱정 없이 안심하고 보내실 수 있습니다.",
  },
  // 2. 안정화 수익률
  "안정화 수익률": {
    title: "📈 안정화 기대수익률 (공실·주인사용 층 임대 전환 시)",
    easyMeaning:
      "현재 비어 있는 층(공실)이나 건물주가 직접 쓰고 있는 층을 주변 시세대로 세놓았을 때 올라가는 예상 수익률입니다.",
    tip: "지금 당장 수익률이 2%대라 아쉬워하는 매수 고객님께 '공실 채우면 3.7%까지 올라갑니다'라고 설득할 수 있는 가장 강력한 무기입니다.",
  },
  // 3. 다필지
  "다필지": {
    title: "🗺️ 다필지 매물 (여러 번지가 함께 매각되는 건물)",
    easyMeaning:
      "건물 하나가 2개 이상의 번지(예: 양평동4가 117, 134, 125-2) 위에 지어졌거나 본건 옆 주차장 필지가 함께 매각되는 경우입니다.",
    tip: "메모에 '양평동4가 117 외 134, 125-2'처럼 쉼표로 함께 적어주시면 토지 면적을 합산하여 정확한 평당가를 계산합니다.",
  },
  // 4. 투자 포스처
  "투자 포스처": {
    title: "🎯 5대 투자 목적 (포스처)",
    easyMeaning:
      "이 건물을 어떤 매수자에게 브리핑할지 고르는 기준입니다. 선택하신 목적에 맞춰 12장 PPTX 제안서의 표지 문구와 분석 표가 자동으로 바뀝니다.",
    tip: "꼬마빌딩·근생은 [💰 임대수익], 법인 사옥용은 [🏢 자가사용(사옥)], 나대지·신축부지는 [🏗️ 신축·리모델링]을 고르시면 가장 알맞습니다.",
  },
  // 5. 모노 고대비
  "모노 고대비": {
    title: "🖨️ 모노 고대비 테마 (흑백 인쇄 · 팩스 전용)",
    easyMeaning:
      "배경 색깔을 모두 없애고 흰 종이 바탕에 진한 먹색 글씨와 굵은 테두리로만 만드는 인쇄 전용 테마입니다.",
    tip: "휴대폰 작은 글씨보다 종이 출력물이나 팩스를 선호하시는 60~70대 건물주·매수인 어르신께 드릴 때 선택하시면 숫자 하나 흐려지지 않고 또렷하게 인쇄됩니다.",
  },
  // 6. 렌트롤 AI 변환
  "렌트롤 AI 변환": {
    title: "🤖 엉망인 임대내역(렌트롤) AI 10초 자동 변환",
    easyMeaning:
      "매도인이 사진, 한글파일, 혹은 줄이 안 맞는 엑셀로 준 임대내역을 ChatGPT·Claude에 붙여넣어 크리딜 표준 표로 한 번에 바꾸는 기능입니다.",
    tip: "주의하실 점 딱 2가지! ① 금액 단위가 '천원'이면 원 단위로 바꿨는지, ② 공실 행의 (희망월세)는 비고란으로 옮겼는지만 확인해 주세요.",
  },
  // 7. G1~G3 비밀유지 승인
  "G1~G3 비밀유지 승인": {
    title: "🔒 G1~G3 비밀유지 승인 (단계별 매물 정보 공개)",
    easyMeaning:
      "매수 희망 고객의 신원과 매수 의향에 따라 매물 정보 공개 범위를 3단계(G1 기본 딜카드 → G2 일반 IM 요약 → G3 번지·상세 렌트롤 정밀 자료)로 나누어 중개인이 직접 승인하는 안전장치입니다.",
    tip: "매수자의 성함과 연락처를 확인하신 후 [승인] 버튼을 누르시면 상세 주소와 임대차 현황이 안전하게 공개됩니다.",
  },
  // 8. 고객 등급(VIP/잠재)
  "고객 등급(VIP/잠재)": {
    title: "👥 고객 관리 등급 (VIP · 일반 · 잠재 · 휴면)",
    easyMeaning:
      "매수·매도 의향과 자금력에 따라 고객을 4단계로 구분하여, 신규 급매물이나 주간 소식지를 우선적으로 발송할 수 있도록 분류하는 기준입니다.",
    tip: "자금력이 확실하고 1개월 이내 매수 의향이 있는 고객은 [VIP]로 등록해 두시면, AI 매칭과 주간 소식지 1순위 발송 대상이 됩니다.",
  },
  // 9. 열람 온도(3회 이상 열람)
  "열람 온도(3회 이상 열람)": {
    title: "🔥 고객 열람 온도 (3회 이상 반복 열람 감지)",
    easyMeaning:
      "내가 카카오톡으로 보낸 딜카드나 IM 제안서를 고객님이 3번 이상 반복해서 열어보셨을 때 시스템이 '매수 관심도가 매우 높음'으로 감지해 알려주는 기능입니다.",
    tip: "열람 온도가 높은 고객께는 즉시 [상황 6 카톡 멘트]나 안부 전화를 걸어 '보시면서 궁금하신 점이 있으셨는지' 여쭤보시면 미팅 성사율이 3배 이상 높아집니다.",
  },
  // 10. 완성도 점수
  "완성도 점수": {
    title: "📊 홍보 완성도 점수 (100점 만점)",
    easyMeaning:
      "매물의 필수 정보(소재지, 매매가, 대지면적, 임대료)와 렌트롤, 현장 사진이 얼마나 충실히 채워졌는지를 평가하는 점수입니다. 80점 이상이어야 모바일 IM과 정식 PPTX 제안서를 생성할 수 있습니다.",
    tip: "사진 3장 이상과 렌트롤만 추가하셔도 점수가 80점 이상으로 훌쩍 올라갑니다.",
  },
  // 11. 중개사무소 등록번호 인쇄 위치
  "중개사무소 등록번호 인쇄 위치": {
    title: "🏛️ 중개사무소 등록번호 및 명함 인쇄 위치",
    easyMeaning:
      "공인중개사법에 따라 제안서에 반드시 들어가야 하는 상호, 대표자 성함, 개설등록번호, 직통 연락처가 인쇄되는 위치입니다.",
    tip: "PPTX 제안서 01번 표지 우측 하단, 10번 문의/유의사항 슬라이드, 그리고 모바일 딜카드와 주간 소식지 상단에 자동으로 인쇄되므로 프로필에서 한 번만 정확히 적어두시면 됩니다.",
  },
  // 12. 딜카드
  "딜카드": {
    title: "⚡ 1분 딜카드 (모바일 매물 요약 카드)",
    easyMeaning:
      "상세 지번과 건물명을 가린 채 핵심 사진, 권역, 매매가, 3대 투자 포인트만 담아 카카오톡으로 1초 만에 보낼 수 있는 첫 접촉용 모바일 매물 소개서입니다.",
    tip: "첫 상담 시에는 지번이 보호되는 딜카드를 먼저 보내시고, 고객님이 관심을 보이시면 정식 모바일 IM이나 PPTX 제안서를 보내세요.",
  },
  // 13. 모바일 IM
  "모바일 IM": {
    title: "📑 모바일 IM (정식 모바일 투자설명서)",
    easyMeaning:
      "지적도, 층별 렌트롤, 10년 공시지가, 주변 시세 비교 등 매수 결정에 필요한 모든 분석이 포함된 8~12면 분량의 디지털 투자설명서입니다.",
    tip: "고객 휴대폰 화면에 맞춰 세로 스크롤로 읽기 편하게 제공되며, PC에서는 파워포인트(PPTX) 파일로 다운로드할 수도 있습니다.",
  },
  // 14. 외관/대표 사진
  "외관/대표 사진": {
    title: "🏢 외관 및 대표 사진 지정 (📌대표 · 🏢외관 · 🚫제외)",
    easyMeaning:
      "업로드한 여러 장의 사진 중 제안서의 얼굴이 될 '표지 대표 사진(📌대표)'과 건물 개요에 들어갈 '외관 사진(🏢외관)'을 지정하고, 불필요한 사진은 숨기는 기능입니다.",
    tip: "맑은 낮에 찍은 반듯한 건물 정면 사진을 [📌 대표]로 선택하시고, 흐린 사진이나 어두운 화장실/계단 사진은 [🚫 제외]를 눌러주세요.",
  },
  // 15. 고객 유형(매도/매수/양쪽)
  "고객 유형(매도/매수/양쪽)": {
    title: "🎯 고객 유형 (매도자 · 매수자 · 매도/매수 양쪽)",
    easyMeaning:
      "이 고객님이 건물을 팔려고 내놓으신 [매도자(건물주)]인지, 살 건물을 찾고 계신 [매수자(투자자/법인)]인지, 아니면 두 가지를 다 하시는 [양쪽]인지 분류하는 기준입니다.",
    tip: "매수자 고객은 희망 매수가와 관심 지역을 등록해 두시면 신규 딜카드가 등록될 때 자동으로 매칭 추천됩니다.",
  },
  // 16. 주간 소식지
  "주간 소식지": {
    title: "📰 주간 고객 소식지 (모바일 매거진)",
    easyMeaning:
      "대표님의 현장 코멘트와 엄선된 추천 매물 3선, 주간 부동산 뉴스를 묶어 매주 월요일 단골 고객께 발송하는 모바일 뉴스레터입니다.",
    tip: "바쁜 월요일 아침 5분이면 발행할 수 있으며, 발송 후에도 오타를 고쳐 [정정 발행]을 누르면 고객 화면에 즉시 수정 반영됩니다.",
  },
  // 17. 안전한 삭제 규칙
  "안전한 삭제 규칙": {
    title: "🗑️ 딜카드 vs IM 안전 삭제 규칙",
    easyMeaning:
      "물건 자체를 삭제하는 것과 특정 IM 문서만 삭제하는 것의 차이입니다. 물건을 삭제하면 연결된 모든 IM과 딜카드가 함께 삭제되지만, IM 목록에서 IM만 삭제하시면 원본 물건 데이터는 안전하게 보존됩니다.",
    tip: "IM 제안서만 다시 작성하고 싶으실 때는 IM 탭에서 해당 문서만 삭제하시고, 딜카드 탭의 원본 물건은 그대로 남겨두세요.",
  },
  // 18. 권역/유형/가격 검색 팁
  "권역/유형/가격 검색 팁": {
    title: "🔍 내 물건 빠른 검색 팁",
    easyMeaning:
      "검색창에 '성수', '역세권', '오피스', '100억' 등 지역명, 건물 용도, 매매가격을 한 단어만 입력해도 일치하는 물건을 0.1초 만에 찾아줍니다.",
    tip: "띄어쓰기 없이 '성수동' 또는 '오피스'로 검색하시면 가장 빠르고 정확하게 찾으실 수 있습니다.",
  },
  // 19. 고객 문의함
  "고객 문의함": {
    title: "🔔 고객 문의함 (실시간 소통 관리)",
    easyMeaning:
      "딜카드나 IM을 받아본 고객님이 보낸 열람 알림, 비밀유지 승인(NDA) 요청, 카카오톡 상담 메시지를 한곳에 모아 보여주는 소통 창구입니다.",
    tip: "미확인 문의나 3회 이상 열람 알림이 뜨면 10분 이내에 팔로업 메시지(상황 6 템플릿)를 보내시는 것이 계약 성사율을 가장 높입니다.",
  },
  // 20. 매물 진행 단계
  "매물 진행 단계": {
    title: "🔄 매물 파이프라인 진행 단계 (초안 → 승인 → 협상 → 계약)",
    easyMeaning:
      "매물이 접수된 후 최종 계약 체결까지 현재 어떤 단계에 와 있는지를 한눈에 추적하는 관리 상태입니다.",
    tip: "초안(임시저장) 상태에서는 지번 보호 딜카드만 생성되며, 80점 이상 충족 후 승인 완료 시 정식 IM 및 PPTX 배포가 가능해집니다.",
  },
  // 21. 필수 데이터 4항목
  "필수 데이터 4항목": {
    title: "📋 제안서 필수 4대 핵심 데이터 점검",
    easyMeaning:
      "상업용 부동산 제안서에 누락되면 고객 신뢰가 떨어지는 4대 기본 요소(정확한 지번/소재지, 공적장부 면적, 매각 희망가, 월 임대료/수익률)의 충족 여부입니다.",
    tip: "4개 항목에 모두 초록색 불(✓)이 들어와야 기관 투자자나 자산가에게 제출할 수 있는 고품질 PPTX가 완성됩니다.",
  },
  // 22. 준비도 점수
  "준비도 점수": {
    title: "⭐ IM 제안서 준비도 점수 (Readiness Score)",
    easyMeaning:
      "필수 데이터와 사진, 렌트롤 분석이 충실히 갖추어져 바이어에게 즉시 발송 가능한 수준인지를 나타내는 지표입니다.",
    tip: "준비도 점수가 90점 이상이면 '상용화 최우수' 등급으로 자동 판정되어 제안서 표지에 신뢰 인증 마크가 부여됩니다.",
  },
  // 23. 딜 매칭 연동
  "딜 매칭 연동": {
    title: "🤝 고객 매수 성향 ↔ 신규 매물 AI 자동 매칭",
    easyMeaning:
      "고객님이 희망하시는 매수 예산, 관심 권역, 선호 포스처(수익형/사옥형)를 등록해 두면 조건에 맞는 새 건물이 등록될 때 즉시 추천해 주는 기능입니다.",
    tip: "고객 카드에 희망 가격대(예: 50억~100억)와 관심 지역을 꼭 입력해 두세요. 새 물건이 올라오면 1초 만에 매칭 알림이 뜹니다.",
  },
  // 24. 소식지 구독 연동
  "소식지 구독 연동": {
    title: "📬 주간 고객 소식지 자동 발송 연동",
    easyMeaning:
      "등록하신 고객님을 '소식지 구독자'로 연결하여, 매주 월요일 아침 발행되는 모바일 부동산 매거진을 원클릭으로 일괄 전달하는 기능입니다.",
    tip: "신규 고객 등록 시 [이 고객을 매거진 구독자로도 등록]을 체크해 두시면 별도 연락 없이도 매주 꾸준한 안부 영업이 가능합니다.",
  },
  // 25. 대표자 성함 인쇄 위치
  "대표자 성함 인쇄 위치": {
    title: "✍️ 대표자 성함 자동 인쇄 위치",
    easyMeaning:
      "공인중개사 대표님의 실명이 제안서 표지 우측 하단, 10번 문의처 슬라이드, 딜카드 모바일 하단 명함 영역에 정확히 표기되는 위치입니다.",
    tip: "프로필 설정에서 대표자 성함을 한 번만 입력해 두시면 모든 출력물에 법정 규격으로 자동 인쇄됩니다.",
  },
  // 26. 직통 연락처 인쇄 위치
  "직통 연락처 인쇄 위치": {
    title: "📞 직통 연락처(휴대폰/유선) 자동 인쇄 위치",
    easyMeaning:
      "고객이 제안서를 읽다가 원클릭으로 전화나 카톡 상담을 연결할 수 있도록 표지와 문의처 슬라이드에 인쇄되는 전화번호입니다.",
    tip: "휴대폰 번호를 적어두시면 모바일 딜카드 수신 화면에서 고객이 [전화 걸기] 버튼을 눌렀을 때 대표님 폰으로 즉시 연결됩니다.",
  },
  // 27. 중개법인 상호 인쇄 위치
  "중개법인 상호 인쇄 위치": {
    title: "🏢 중개법인 상호 및 로고 인쇄 위치",
    easyMeaning:
      "등록관청에 정식 신고된 부동산 중개법인/사무소 상호가 제안서 표지와 매 슬라이드 상단 헤더, 모바일 명함에 인쇄되는 위치입니다.",
    tip: "법인 상호와 로고 이미지를 등록하시면 일반 개인 부동산과 차별화되는 대형 하우스 스타일의 고급 제안서가 완성됩니다.",
  },
  // 28. 개설등록번호 인쇄 위치
  "개설등록번호 인쇄 위치": {
    title: "📜 중개사무소 개설등록번호 인쇄 위치",
    easyMeaning:
      "공인중개사법 제18조의2(중개대상물의 표시·광고)에 따른 법정 의무 표기 사항으로, 제안서 표지 및 면책 공고 슬라이드 하단에 인쇄되는 번호입니다.",
    tip: "등록관청(구청)에서 발급받은 11~14자리 개설등록번호를 입력하시면 허위 매물 단속 걱정 없이 안전하게 제안서를 배포하실 수 있습니다.",
  },
  // 29. 프로필 사진 인쇄 위치
  "프로필 사진 인쇄 위치": {
    title: "🖼️ 대표 공인중개사 프로필 사진 인쇄 위치",
    easyMeaning:
      "단정한 정장 차림의 대표님 인물 사진이 모바일 딜카드 하단 디지털 명함과 PPTX 제안서 10번 슬라이드에 원형 배지로 인쇄되는 위치입니다.",
    tip: "얼굴이 또렷하게 나온 사진을 등록하시면 처음 제안서를 받아보는 고객에게 신뢰감을 주고 중개사 도용을 방지할 수 있습니다.",
  },
  // 30. 공인중개사 자격증 번호
  "공인중개사 자격증 번호": {
    title: "🎖️ 공인중개사 자격증 등록 번호",
    easyMeaning:
      "시·도지사가 교부한 공인중개사 자격증 고유 번호로, 전문성과 공신력을 고객에게 입증하는 정보입니다.",
    tip: "프로필에 자격증 번호와 개업 연도를 함께 기재하시면 20~30년 경력의 베테랑 전문성이 제안서에 돋보이게 됩니다.",
  },
  // Aliases & screen variations
  "1분 딜카드": {
    title: "⚡ 1분 딜카드 (모바일 매물 요약 카드)",
    easyMeaning:
      "상세 지번과 건물명을 가린 채 핵심 사진, 권역, 매매가, 3대 투자 포인트만 담아 카카오톡으로 1초 만에 보낼 수 있는 첫 접촉용 모바일 매물 소개서입니다.",
    tip: "첫 상담 시에는 지번이 보호되는 딜카드를 먼저 보내시고, 고객님이 관심을 보이시면 정식 모바일 IM이나 PPTX 제안서를 보내세요.",
  },
  "3분 기본 IM": {
    title: "📑 3분 기본 IM (정식 모바일 투자설명서)",
    easyMeaning:
      "지적도, 층별 렌트롤, 10년 공시지가, 주변 시세 비교 등 매수 결정에 필요한 모든 분석이 포함된 8~12면 분량의 디지털 투자설명서입니다.",
    tip: "고객 휴대폰 화면에 맞춰 세로 스크롤로 읽기 편하게 제공되며, PC에서는 파워포인트(PPTX) 파일로 다운로드할 수도 있습니다.",
  },
  "5분 주간 소식지": {
    title: "📰 5분 주간 소식지 (모바일 매거진)",
    easyMeaning:
      "대표님의 현장 코멘트와 엄선된 추천 매물 3선, 주간 부동산 뉴스를 묶어 매주 월요일 단골 고객께 발송하는 모바일 뉴스레터입니다.",
    tip: "바쁜 월요일 아침 5분이면 발행할 수 있으며, 발송 후에도 오타를 고쳐 [정정 발행]을 누르면 고객 화면에 즉시 수정 반영됩니다.",
  },
  "고객 유형(매도/매수)": {
    title: "🎯 고객 유형 (매도자 · 매수자 · 매도/매수 양쪽)",
    easyMeaning:
      "이 고객님이 건물을 팔려고 내놓으신 [매도자(건물주)]인지, 살 건물을 찾고 계신 [매수자(투자자/법인)]인지, 아니면 두 가지를 다 하시는 [양쪽]인지 분류하는 기준입니다.",
    tip: "매수자 고객은 희망 매수가와 관심 지역을 등록해 두시면 신규 딜카드가 등록될 때 자동으로 매칭 추천됩니다.",
  },
  "안전 삭제 규칙": {
    title: "🗑️ 딜카드 vs IM 안전 삭제 규칙",
    easyMeaning:
      "물건 자체를 삭제하는 것과 특정 IM 문서만 삭제하는 것의 차이입니다. 물건을 삭제하면 연결된 모든 IM과 딜카드가 함께 삭제되지만, IM 목록에서 IM만 삭제하시면 원본 물건 데이터는 안전하게 보존됩니다.",
    tip: "IM 제안서만 다시 작성하고 싶으실 때는 IM 탭에서 해당 문서만 삭제하시고, 딜카드 탭의 원본 물건은 그대로 남겨두세요.",
  },
  "📌 대표": {
    title: "📌 표지 대표 사진 (제안서 얼굴 사진)",
    easyMeaning:
      "PPTX 제안서 1번 표지와 모바일 딜카드 첫 화면에 가장 크고 선명하게 노출되는 대표 이미지입니다.",
    tip: "하늘이 푸르고 맑은 낮에 건물 전체가 반듯하게 나온 정면 사진을 선택해 주세요.",
  },
  "🏢 외관": {
    title: "🏢 건물 외관 사진 (건물 개요 슬라이드용)",
    easyMeaning:
      "PPTX 제안서 4번 건물 개요 및 입지 슬라이드에 삽입되는 건물 측면·진입로·전경 사진입니다.",
    tip: "주변 도로와의 접도 조건이나 건물 웅장함이 잘 드러나는 각도의 사진을 지정하시면 효과적입니다.",
  },
  "🚫 제외": {
    title: "🚫 사진 제안서 노출 제외",
    easyMeaning:
      "현장 실측 중 촬영한 어두운 기계실, 화장실, 복도 등 매수자 브리핑에 적합하지 않은 사진을 제안서 출력에서 숨기는 기능입니다.",
    tip: "불필요한 사진을 제외하시면 제안서 지면이 훨씬 고급스럽고 깔끔해집니다.",
  },
};

export interface SeniorTermTooltipProps {
  /** 내장 용어 키 또는 BROKER_GLOSSARY_LIST 검색어 */
  termKey?: string;
  /** 버튼 라벨 (기본값: "❓ 쉬운 설명") */
  buttonLabel?: string;
  /** 직접 지정할 제목 */
  title?: string;
  /** 직접 지정할 쉬운 설명 */
  easyMeaning?: string;
  /** 실무 중개 팁 */
  tip?: string;
  /** 5대 투자 포스처 비교표를 함께 보여줄지 여부 */
  showPostureTable?: boolean;
  /** 실행 버튼 라벨 (선택) */
  actionLabel?: string;
  /** 실행 버튼 클릭 핸들러 (선택) */
  onAction?: () => void;
  className?: string;
}

/**
 * 60대 대표공인중개사 맞춤형 클릭 고정형(Click-to-Pin) 고대비 용어·개념 툴팁 (Tier 1)
 * - 마우스 호버가 아닌 클릭/터치 고정 방식
 * - 16px~17px 큰 글씨 & 따뜻한 크림/앰버 고대비 카드 (#FFFBEB + #0F172A)
 */
export function SeniorTermTooltip({
  termKey,
  buttonLabel = "❓ 쉬운 설명",
  title,
  easyMeaning,
  tip,
  showPostureTable = false,
  actionLabel,
  onAction,
  className = "",
}: SeniorTermTooltipProps) {
  const { helperEnabled } = useSeniorHelp();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [open]);

  if (!helperEnabled) return null;

  // Resolve content from BUILTIN_TERMS or BROKER_GLOSSARY_LIST
  const builtin = termKey ? BUILTIN_TERMS[termKey] : undefined;
  const glossaryMatch = termKey
    ? BROKER_GLOSSARY_LIST.find(
        (g) =>
          g.term.toLowerCase().includes(termKey.toLowerCase()) ||
          termKey.toLowerCase().includes(g.term.split("(")[0].trim().toLowerCase())
      )
    : undefined;

  const resolvedTitle = title || builtin?.title || glossaryMatch?.term || termKey || "쉬운 용어 설명";
  const resolvedMeaning =
    easyMeaning ||
    builtin?.easyMeaning ||
    glossaryMatch?.easyMeaning ||
    "이 항목에 대한 쉬운 설명입니다.";
  const resolvedTip = tip || builtin?.tip || (glossaryMatch?.whereUsed ? `활용 위치: ${glossaryMatch.whereUsed}` : undefined);

  return (
    <span ref={containerRef} className={`relative inline-flex items-center align-middle ${className}`}>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        aria-expanded={open}
        data-testid={`senior-tooltip-trigger-${termKey || "custom"}`}
        className="inline-flex items-center gap-1 px-2.5 py-1 min-h-[32px] rounded-full bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-400 text-[13px] font-extrabold shadow-2xs transition-colors cursor-pointer shrink-0"
      >
        <span>{buttonLabel}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={resolvedTitle}
          onClick={(e) => e.stopPropagation()}
          className="fixed sm:absolute left-4 right-4 sm:left-0 sm:right-auto bottom-6 sm:bottom-auto sm:top-full sm:mt-2 z-[9999] sm:w-[400px] max-w-[92vw] rounded-2xl border-2 border-amber-500 bg-[#FFFBEB] text-[#0F172A] p-4 sm:p-5 shadow-2xl space-y-3 text-left animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="flex items-start justify-between gap-2 border-b border-amber-300 pb-2.5">
            <p className="text-[16px] sm:text-[17px] font-black text-amber-950 leading-snug">
              {resolvedTitle}
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-2.5 py-1 rounded-lg bg-amber-200/80 hover:bg-amber-300 text-amber-950 text-[13px] font-extrabold shrink-0 cursor-pointer"
            >
              ✕ 닫기
            </button>
          </div>

          <p className="text-[15px] sm:text-[16px] font-semibold text-slate-900 leading-relaxed">
            {resolvedMeaning}
          </p>

          {resolvedTip && (
            <div className="rounded-xl bg-white border border-amber-300 p-3 text-[14px] text-slate-800 leading-relaxed">
              <span className="font-extrabold text-amber-900">💡 실무 팁: </span>
              <span>{resolvedTip}</span>
            </div>
          )}

          {showPostureTable && (
            <div className="space-y-1.5 pt-1 max-h-[220px] overflow-y-auto">
              <p className="text-[13px] font-extrabold text-amber-950">
                👇 5가지 투자 목적별 추천 매물 한눈에 보기
              </p>
              {POSTURE_GUIDE_ROWS.map((row) => (
                <div
                  key={row.postureName}
                  className="rounded-xl bg-white border border-amber-200 p-2.5 text-[13px] space-y-0.5"
                >
                  <p className="font-black text-slate-900">{row.postureName}</p>
                  <p className="text-slate-700">{row.recommendedFor}</p>
                </div>
              ))}
            </div>
          )}

          {actionLabel && onAction && (
            <button
              type="button"
              onClick={() => {
                onAction();
                setOpen(false);
              }}
              className="w-full py-2.5 px-4 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-[14px] font-extrabold shadow-xs transition-colors cursor-pointer"
            >
              {actionLabel}
            </button>
          )}
        </div>
      )}
    </span>
  );
}
