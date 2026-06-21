<!-- BEGIN:deploy-rules -->
# CI/CD Deployment Rules
- 본 프로젝트의 주요 배포 프로세스는 Vercel 자동 배포(`git push origin main`)를 통해 이루어집니다.
- 배포를 진행하기 전에 반드시 `npm run build`를 통해 로컬에서 타입스크립트 오류 및 빌드 성공 여부를 사전에 확인해야 합니다.
- 사용자가 배포를 요청할 경우, 위와 같이 빌드 무결성을 점검한 뒤, `git push`를 통해 원격 저장소에 반영함으로써 Vercel 자동 배포를 트리거합니다. (또는 상황에 따라 `npx vercel --prod` 활용)
<!-- END:deploy-rules -->
