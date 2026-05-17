# Career-Navigator-in-Social-Impact
Ask anything about a career in social impact. This agent, powered by Jeongtae Kim’s published articles and insights, is here to understand your needs and offer thoughtful perspectives.
# 에이블 커리어 상담 에이전트

소셜임팩트 생태계에 진입하려는 주니어들을 위한 AI 커리어 상담 에이전트.
김정태 MYSC 대표의 2019~2026년 칼럼 53편을 기반으로 합니다.

## 기술 스택
- Claude Sonnet 4 (Anthropic)
- React (Artifact)
- Supabase pgvector (RAG)
- OpenAI Embeddings

## 로컬 실행
1. `cp .env.example .env` → API 키 입력
2. `node scripts/ingest.js` → 칼럼 임베딩 생성
3. Claude.ai Artifact에 `src/App.jsx` 붙여넣기
