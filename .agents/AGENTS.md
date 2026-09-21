# CRE DealCard Agent Rules

## CI/CD Deployment Rules
- Vercel 자동 배포: `git push origin main`
- 배포 전 `npm run build` 로컬 검증 필수
- `npx vercel --prod` 대안 가능

## Rule 모듈 인덱스
| 모듈 | Rules | 적용 대상 |
|:---|:---|:---|
| [01-cre-lexicon](rules/01-cre-lexicon.md) | 1~4 | 용어/페르소나/비중복 렌더링 |
| [02-pipeline-engineering](rules/02-pipeline-engineering.md) | 5~10 | 게이트/단언/임계값/면수 |
| [03-im-core-domain](rules/03-im-core-domain.md) | 11~16 | im-core 도메인 계층 |
| [04-production-web](rules/04-production-web.md) | 17~25 | 타임아웃/해시/사진/Playwright |
| [05-posture-isolation](rules/05-posture-isolation.md) | 26~30 | 포스처별 격리/게이트 |
| [06-preflight-audit](rules/06-preflight-audit.md) | 31~46 | 파싱/면적/더미/문구/Sharp/API/렌더러/검증선행/Allowlist |
| [07-basic-im-ssot](rules/07-basic-im-ssot.md) | 45~47, 61~65 | Basic IM 표준/imlib/레이아웃/지적도/렌트롤/Sharp |
| [08-e2e-golden-test](rules/08-e2e-golden-test.md) | 41~44, 48~60 | 골든 E2E/감사/RCA |
| [09-subagent-hygiene](rules/09-subagent-hygiene.md) | 41~42 | 서브에이전트 위생/대형파일 금지 |
| [10-powershell-git](rules/10-powershell-git.md) | 43~45 | PowerShell Git 규칙 |

> **Note to Agents**: This hub replaces the monolithic AGENTS.md. When you need specific rules, use the `view_file` tool to read the appropriate module in `.agents/rules/`.
