export type ChangeKind =
  | 'raw_data_update'
  | 'correction_added'
  | 'formula_changed'
  | 'opinion_edited'
  | 'photo_asset_changed'
  | 'photo_cropped'
  | 'mobile_layout_changed'
  | 'pptx_template_changed'
  | 'gate_rule_changed'
  | 'disclosure_policy'
  | 'terminology_policy'
  | 'channel_policy'
  | 'copy_text_changed';

export interface InvalidationScope {
  changeKind: ChangeKind;
  description: string;
  invalidatedChannels: Array<'core' | 'mobile' | 'pptx' | 'dealcard'>;
  affectedStages: string[];
  requiresSnapshotRebuild: boolean;
  requiresFullReapproval: boolean;
}

export class InvalidationEngine {
  resolveScope(change: ChangeKind): InvalidationScope {
    switch (change) {
      case 'raw_data_update':
        return {
          changeKind: change,
          description: '공부/원자료 개정: 유효기준본 및 양 채널 전면 무효화',
          invalidatedChannels: ['core', 'mobile', 'pptx', 'dealcard'],
          affectedStages: [
            'P10', 'P20', 'P30', 'P40', 'P50', 'P60',
            'M00', 'M10', 'M20', 'M30', 'M40', 'M50',
            'S00', 'S10', 'S20', 'S30', 'S40', 'S50', 'S60', 'S70'
          ],
          requiresSnapshotRebuild: true,
          requiresFullReapproval: true,
        };

      case 'correction_added':
        return {
          changeKind: change,
          description: '정정 승인 등록: 스냅샷 및 하류 발행묶음 무효화',
          invalidatedChannels: ['core', 'mobile', 'pptx', 'dealcard'],
          affectedStages: [
            'P30', 'P40', 'P50', 'P60',
            'M00', 'M10', 'M20', 'M30', 'M40', 'M50',
            'S00', 'S10', 'S20', 'S30', 'S40', 'S50', 'S60', 'S70'
          ],
          requiresSnapshotRebuild: true,
          requiresFullReapproval: true,
        };

      case 'formula_changed':
        return {
          changeKind: change,
          description: '계산 공식 개정: 산출항목 재계산 및 양 채널 무효화',
          invalidatedChannels: ['core', 'mobile', 'pptx'],
          affectedStages: [
            'P40', 'P60',
            'M20', 'M30', 'M40', 'M50',
            'S20', 'S30', 'S40', 'S50', 'S60', 'S70'
          ],
          requiresSnapshotRebuild: false,
          requiresFullReapproval: true,
        };

      case 'mobile_layout_changed':
        return {
          changeKind: change,
          description: '모바일 순서/카드 변경: 모바일만 재조립 (PPTX 및 CORE 무영향)',
          invalidatedChannels: ['mobile'],
          affectedStages: ['M10', 'M20', 'M30', 'M40', 'M50'],
          requiresSnapshotRebuild: false,
          requiresFullReapproval: false,
        };

      case 'pptx_template_changed':
        return {
          changeKind: change,
          description: 'PPTX 테마/레이아웃 변경: PPTX만 재렌더 (모바일 및 CORE 무영향)',
          invalidatedChannels: ['pptx'],
          affectedStages: ['S30', 'S40', 'S50', 'S60', 'S70'],
          requiresSnapshotRebuild: false,
          requiresFullReapproval: false,
        };

      case 'opinion_edited':
        return {
          changeKind: change,
          description: '중개인 의견 변경: 제안단위 소비 채널 재승인 필요',
          invalidatedChannels: ['mobile', 'pptx'],
          affectedStages: [
            'P50', 'P60',
            'M20', 'M30', 'M40',
            'S20', 'S30', 'S40', 'S50', 'S60'
          ],
          requiresSnapshotRebuild: false,
          requiresFullReapproval: true,
        };

      case 'photo_asset_changed':
        return {
          changeKind: change,
          description: '사진 자산 교체: 양 채널 렌더 및 DPI 검사 재실행',
          invalidatedChannels: ['mobile', 'pptx'],
          affectedStages: ['M20', 'M30', 'S30', 'S40', 'S50', 'S70'],
          requiresSnapshotRebuild: false,
          requiresFullReapproval: false,
        };

      case 'photo_cropped':
        return {
          changeKind: change,
          description: '사진 크롭 비율 변경: 해당 채널 렌더 단계만 재실행',
          invalidatedChannels: ['mobile', 'pptx'],
          affectedStages: ['M20', 'S70'],
          requiresSnapshotRebuild: false,
          requiresFullReapproval: false,
        };

      case 'disclosure_policy':
        return {
          changeKind: change,
          description: '공시 정책 변경: 공시 관련 섹션 재생성 및 게이트 재평가',
          invalidatedChannels: ['mobile', 'pptx'],
          affectedStages: ['M10', 'M20', 'M30', 'S20', 'S30', 'S50'],
          requiresSnapshotRebuild: false,
          requiresFullReapproval: true,
        };

      case 'terminology_policy':
        return {
          changeKind: change,
          description: '용어 정책 변경: CRE 용어집 필터 재적용 및 문안 재정제',
          invalidatedChannels: ['mobile', 'pptx'],
          affectedStages: ['M20', 'M30', 'S20', 'S50'],
          requiresSnapshotRebuild: false,
          requiresFullReapproval: false,
        };

      case 'channel_policy':
        return {
          changeKind: change,
          description: '채널 정책 변경: 해당 채널 조립 및 게이트 전면 재실행',
          invalidatedChannels: ['mobile', 'pptx'],
          affectedStages: ['M00', 'M10', 'M20', 'M30', 'M40', 'M50', 'S00', 'S10', 'S20', 'S30', 'S40', 'S50', 'S60', 'S70'],
          requiresSnapshotRebuild: false,
          requiresFullReapproval: true,
        };

      case 'copy_text_changed':
        return {
          changeKind: change,
          description: '문안 텍스트 직접 수정: 해당 채널 문안 단계 재실행',
          invalidatedChannels: ['mobile', 'pptx'],
          affectedStages: ['M20', 'M30', 'S20', 'S50'],
          requiresSnapshotRebuild: false,
          requiresFullReapproval: false,
        };

      case 'gate_rule_changed':
      default:
        return {
          changeKind: change,
          description: '품질 게이트 규칙 변경: 하네스 재평가만 실행',
          invalidatedChannels: ['mobile', 'pptx'],
          affectedStages: ['M30', 'S50'],
          requiresSnapshotRebuild: false,
          requiresFullReapproval: false,
        };
    }
  }
}
