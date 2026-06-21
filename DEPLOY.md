# CI/CD Deployment Guide

## 1. Vercel 자동 배포 (권장)
본 프로젝트는 GitHub 저장소의 `main` 브랜치에 코드가 푸시되면 Vercel에 의해 자동으로 프로덕션 빌드 및 배포가 진행됩니다.

### 배포 절차
1. 로컬에서 코드 수정 및 동작 테스트 (`npm run dev`)
2. 로컬 빌드 테스트로 무결성 검증 (`npm run build`)
3. 변경 사항 커밋 및 푸시
   ```bash
   git add .
   git commit -m "feat: 설명"
   git push origin main
   ```
4. Vercel 대시보드에서 배포 상태 확인

## 2. Vercel CLI 수동 배포
긴급한 수정사항 반영이나 직접 배포가 필요한 경우 Vercel CLI를 사용할 수 있습니다.

```bash
npx vercel --prod
```

## 주의 사항
- 항상 로컬에서 `npm run build`를 실행하여 타입스크립트 에러(TypeScript type check) 및 린트(Lint) 오류가 없는지 완벽하게 확인 후 푸시해야 합니다.
- 환경 변수가 새로 추가된 경우 Vercel 대시보드의 환경 변수(Environment Variables) 설정에 반드시 추가해야 빌드가 실패하지 않습니다.
