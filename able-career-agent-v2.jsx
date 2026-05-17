/**
 * able-career-agent — 에이블(김정태) 소셜임팩트 커리어 상담 에이전트
 *
 * 기능:
 *   1. RAG: Supabase pgvector로 관련 칼럼 단락 검색 → 프롬프트 주입
 *   2. 대화 저장: window.storage API로 세션 영구 저장
 *   3. 질문 분류기: 유형 A~F 배지 표시 + 유형별 응답 전략 적용
 *
 * 환경변수 (Artifact 상단 CONFIG에서 직접 수정):
 *   SUPABASE_URL, SUPABASE_ANON_KEY, OPENAI_API_KEY
 *   (RAG 없이 기본 모드로 쓰려면 USE_RAG = false)
 */

import { useState, useRef, useEffect, useCallback } from "react";

// ── CONFIG ────────────────────────────────────────────────────────
const USE_RAG = false; // Supabase 연결 시 true로 변경
const SUPABASE_URL = "https://YOUR_PROJECT.supabase.co";
const SUPABASE_ANON_KEY = "YOUR_ANON_KEY";
const OPENAI_API_KEY = ""; // RAG용 임베딩 키

// ── 상담 유형 정의 ─────────────────────────────────────────────────
const QUESTION_TYPES = {
  A: { label: "투자사 진입", color: "#3B6D11", bg: "#EAF3DE" },
  B: { label: "소셜벤처 창업", color: "#0C447C", bg: "#E6F1FB" },
  C: { label: "직무 선택", color: "#3C3489", bg: "#EEEDFE" },
  D: { label: "번아웃·멘탈", color: "#993C1D", bg: "#FAECE7" },
  E: { label: "연봉·처우", color: "#854F0B", bg: "#FAEEDA" },
  F: { label: "생태계 공부", color: "#0F6E56", bg: "#E1F5EE" },
};

const STARTER_QUESTIONS = [
  ["A", "임팩트투자사 심사역이 되고 싶은데, 무엇부터 준비해야 할까요?"],
  ["B", "소셜벤처를 창업하고 싶은데 어디서부터 시작해야 할지 모르겠어요"],
  ["C", "컨설팅이 맞을지, 소셜벤처가 맞을지 도무지 모르겠어요"],
  ["D", "이 일을 계속해야 할지 모르겠어요. 요즘 너무 지쳐있어요"],
  ["E", "솔직히 연봉이 너무 낮아서 현실적으로 고민이에요"],
  ["F", "임팩트 생태계에 진입하려면 무엇을 공부해야 하나요?"],
];

// ── 시스템 프롬프트 ────────────────────────────────────────────────
const SYSTEM_PROMPT = `당신은 '에이블'입니다. 김정태 MYSC(엠와이소셜컴퍼니) 대표이사이자, 한국 소셜임팩트 생태계의 선구자입니다.

당신은 2019년부터 2026년까지 한겨레, 전남일보, 더나은미래(조선일보), 더버터에 총 53편의 칼럼을 써왔습니다.

지금 당신은 소셜임팩트 생태계에 진입하고 싶은 주니어들의 커리어 상담가 역할을 합니다.

## 핵심 철학과 칼럼 원문

**임팩트와 시대**
- "처음의 시도가 어색하지, 우리가 살아갈 시대에 임팩트란 더 이상 어색하지 않은 시대가 되었다." [전남일보 2022.12]
- "'소셜'이란 단어가 필요 없는 시대가 온다. 모든 벤처가 임팩트를 지향해야 생존한다." [한겨레 2019.12]

**커리어와 자기다움**
- "대표나 창업가의 삶이란 전쟁에 참여했지만 끝날 기미가 없는 전쟁을 해가면서도 개인의 삶은 지속하는 이중성이다." [더나은미래 2023.04]
- "무한게임의 주목적은 게임을 계속해 나가며 그 게임을 오랫동안 유지하는 것이다." [더나은미래 2023.04]
- "회사나 조직의 이름으로 유명하기보다, 누군가가 근무하는 회사나 조직으로 유명해지는 시대가 더욱 가까워지고 있다." [전남일보 2021.07]
- "유일함(Only)이 최고(Best)를 이긴다." [전남일보 2021.04]

**두려움과 정체성**
- "두려움으로부터 벗어나는 길은 게임이 잘되든 안되든 흔들리지 않고 자신의 정체성에 집중할 때라고 담담히 말했다. 두려움의 반대말은 '두렵지 않은 상태'가 아니라 바로 '사랑'이었다." [더나은미래 2023.10]
- "유리하다고 느끼는 순간이 오히려 위험해지고, 경험이 많아질수록 판단은 흐려지며, 익숙한 방식이 때로는 가장 큰 장애물이 된다." [더버터 2025.11]

**실패와 현장**
- "임팩트투자를 하며 울음을 터뜨린 건 이번이 처음이었다. 임팩트 투자자가 놓쳤던 것은 무엇일까?" [더나은미래 2023.06]
- "10년 전 MYSC 매출은 2억2000만원을 간신히 넘겼고, 영업손실 3억원을 기록했다. 한국에서 사회혁신과 임팩트투자는 과연 지속가능할까란 질문이 진실에 가까웠다." [더나은미래 2023.08]

**협력과 관계**
- "진짜 협력은 서로가 잘하는 것만 연결해서 이루어지지 않는다. 내가 모르는 것을 함께하는 용기에서 진짜 협력이 시작된다." [더나은미래 2025.03]
- "가장 큰 복리효과가 기대되는 투자는 '관계'에 대한 투자다." [더나은미래 2025.12]
- "자기허락이 없이는 불가능한 길이 있다." [더버터 2025.09]

## 상담 유형별 조건부 지침

**[유형 A — 투자사 진입]** 심사역, VC, 펀드, 투자 키워드
→ "임팩트 측정 경험이 있나요?"를 반드시 물을 것
→ 없으면 소셜벤처/AC 2~3년 현장 경험 먼저를 권할 것
→ 확증편향·후광효과 두 가지 현혹을 언급할 것 [전남일보 2022.09]

**[유형 B — 소셜벤처 창업]** 창업, 스타트업 시작 키워드
→ "당신의 게임은 무엇인가요?" 질문을 활용할 것
→ 무한게임 프레임: 지속하는 것 자체가 목적
→ 자기허락 개념: 자기 자신에게 먼저 허락을 구해야 한다

**[유형 C — 직무 선택]** 어디가 맞을지, 어느 쪽 키워드
→ 어떤 직무가 더 낫냐는 질문에 직접 답하지 말 것
→ "어떤 사회문제가 가장 참을 수 없이 불편한가요?"를 먼저 물을 것
→ 유일함 프레임: 어느 자리에서 출발하느냐보다 왜 그 문제에 끌리냐가 핵심

**[유형 D — 번아웃·멘탈]** 지쳤어요, 힘들어요, 그만둘까 키워드
→ 조언보다 공감을 먼저
→ MYSC 초기 자본전액잠식 이야기를 꺼낼 것 [더나은미래 2023.08]
→ 두려움 칼럼의 제러미 린 이야기 활용 [더나은미래 2023.10]
→ 관계에 투자하라: "가장 큰 복리효과는 관계에서 나온다"

**[유형 E — 연봉·처우]** 연봉, 월급, 현실적으로 키워드
→ 장밋빛 묘사 절대 금지. 낮은 연봉 현실을 먼저 인정할 것
→ "선출직 공무원은 생사가, 기업은 생존이, 구직자는 생계가 걸린 이것" [전남일보 2022.08]
→ 생계와 소명을 동시에 안고 가는 법을 찾는 것이 이 생태계 종사자의 현실

**[유형 F — 생태계 공부]** 공부, 역량, 스펙, 학교 키워드
→ 스펙보다 문제의식 먼저
→ 시스템 사고와 임팩트 측정 방법론 학습을 권할 것
→ "지표 스타트업을 관찰하라": 지금 어떤 소셜벤처들이 부상하는지 보면 방향이 보인다 [더나은미래 2023.12]

## 상담 원칙

1. 메시지에서 유형 A~F를 감지하고 해당 지침을 자연스럽게 적용한다.
2. 칼럼 원문과 [RAG 검색 결과]가 있다면 적극 활용한다.
3. 질문을 돌려주는 것을 두려워하지 않는다.
4. 솔직하게 말한다. 어려움, 낮은 연봉, 불확실성을 숨기지 않는다.
5. 핵심 답변은 150~300자 내외로. 장황하지 않게.
6. 한국어로, 따뜻하지만 직설적으로.

금지: "열심히 하세요" 류의 빈말 / 생태계를 장밋빛으로만 묘사 / 에이블의 철학과 무관한 일반 조언`;

// ── RAG 유틸 ──────────────────────────────────────────────────────
async function getEmbedding(text) {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: "text-embedding-3-small", input: text }),
  });
  const data = await res.json();
  return data.data[0].embedding;
}

async function searchColumns(queryEmbedding, matchCount = 3) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/search_columns`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query_embedding: queryEmbedding,
      match_count: matchCount,
      min_similarity: 0.5,
    }),
  });
  return res.json();
}

async function buildRagContext(userText) {
  if (!USE_RAG || !OPENAI_API_KEY || !SUPABASE_URL) return "";
  try {
    const embedding = await getEmbedding(userText);
    const matches = await searchColumns(embedding);
    if (!matches?.length) return "";
    const ctx = matches
      .map((m) => `[${m.source} ${m.date} — ${m.title}]\n${m.chunk}`)
      .join("\n\n---\n\n");
    return `\n\n---\n\n## 이 질문과 관련 있는 칼럼 단락\n\n${ctx}`;
  } catch {
    return "";
  }
}

// ── 질문 분류기 ────────────────────────────────────────────────────
async function classifyQuestion(text) {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 60,
        system: `다음 질문을 아래 유형 중 하나로 분류하세요. JSON만 출력하세요: {"type": "A", "label": "투자사 진입"}

유형:
A - 투자사 진입 (심사역, VC, 펀드, 투자)
B - 소셜벤처 창업 (창업, 스타트업)
C - 직무 선택 (어디가 맞을지, 컨설팅 vs)
D - 번아웃·멘탈 (지쳤어요, 힘들어요, 그만둘까)
E - 연봉·처우 (연봉, 월급, 현실적으로)
F - 생태계 공부 (공부, 역량, 스펙, 학교)
Z - 기타`,
        messages: [{ role: "user", content: text }],
      }),
    });
    const data = await res.json();
    const raw = data.content?.[0]?.text || '{"type":"Z","label":"기타"}';
    return JSON.parse(raw.match(/\{[^}]+\}/)?.[0] || '{"type":"Z","label":"기타"}');
  } catch {
    return { type: "Z", label: "기타" };
  }
}

// ── 대화 저장 (window.storage) ─────────────────────────────────────
const SESSION_PREFIX = "able_session:";

async function saveSession(sessionKey, messages) {
  try {
    await window.storage.set(sessionKey, JSON.stringify({ messages, savedAt: new Date().toISOString() }));
  } catch {}
}

async function loadSessions() {
  try {
    const { keys } = await window.storage.list(SESSION_PREFIX);
    const sessions = await Promise.all(
      keys.map(async (key) => {
        try {
          const r = await window.storage.get(key);
          const parsed = JSON.parse(r.value);
          return { key, ...parsed };
        } catch { return null; }
      })
    );
    return sessions.filter(Boolean).sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
  } catch { return []; }
}

async function deleteSession(key) {
  try { await window.storage.delete(key); } catch {}
}

// ── 메인 컴포넌트 ──────────────────────────────────────────────────
export default function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [started, setStarted] = useState(false);
  const [currentType, setCurrentType] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [showSessions, setShowSessions] = useState(false);
  const [sessionKey] = useState(() => `${SESSION_PREFIX}${Date.now()}`);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  useEffect(() => {
    if (showSessions) loadSessions().then(setSessions);
  }, [showSessions]);

  const autoResize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  };

  const sendMessage = useCallback(async (text, presetType = null) => {
    const userText = text || input.trim();
    if (!userText || loading) return;
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setStarted(true);

    const newMessages = [...messages, { role: "user", content: userText, qtype: presetType }];
    setMessages(newMessages);
    setLoading(true);

    // 1. 질문 분류 (프리셋 없을 때만)
    let qtype = presetType;
    if (!qtype) {
      const classified = await classifyQuestion(userText);
      qtype = classified.type !== "Z" ? classified.type : null;
    }
    if (qtype) setCurrentType(qtype);

    // 2. RAG 컨텍스트 빌드
    const ragContext = await buildRagContext(userText);
    const dynamicSystem = SYSTEM_PROMPT + ragContext;

    // 3. Claude 호출
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: dynamicSystem,
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      const reply = data.content?.[0]?.text || "답변을 가져오지 못했습니다.";
      const updated = [...newMessages, { role: "assistant", content: reply }];
      setMessages(updated);
      await saveSession(sessionKey, updated);
    } catch {
      setMessages([...newMessages, { role: "assistant", content: "오류가 발생했습니다. 잠시 후 다시 시도해주세요." }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, sessionKey]);

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const loadPastSession = (session) => {
    setMessages(session.messages);
    setStarted(true);
    setShowSessions(false);
  };

  const TypeBadge = ({ type }) => {
    if (!type || !QUESTION_TYPES[type]) return null;
    const t = QUESTION_TYPES[type];
    return (
      <span style={{ fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 4, background: t.bg, color: t.color, marginLeft: 6, flexShrink: 0 }}>
        {t.label}
      </span>
    );
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0e0e0e", color: "#e8e4dc", fontFamily: "'Georgia', 'Times New Roman', serif", display: "flex", flexDirection: "column" }}>

      {/* Header */}
      <header style={{ borderBottom: "1px solid #2a2a2a", padding: "16px 24px", display: "flex", alignItems: "center", gap: 12, background: "#111", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ width: 38, height: 38, borderRadius: "50%", background: "#b8a07a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: "bold", color: "#111", flexShrink: 0 }}>에</div>
        <div>
          <div style={{ fontSize: 14, fontWeight: "bold", color: "#e8e4dc" }}>에이블 (김정태)</div>
          <div style={{ fontSize: 11, color: "#5a5550" }}>MYSC 대표 · 소셜임팩트 커리어 상담</div>
        </div>
        {currentType && <TypeBadge type={currentType} />}
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={() => setShowSessions(!showSessions)}
            style={{ background: "transparent", border: "1px solid #2a2822", borderRadius: 6, padding: "4px 10px", color: "#6b6560", fontSize: 11, cursor: "pointer" }}
          >
            {showSessions ? "닫기" : "지난 상담"}
          </button>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#4a9a6a" }}></div>
        </div>
      </header>

      {/* 지난 상담 패널 */}
      {showSessions && (
        <div style={{ background: "#161412", borderBottom: "1px solid #2a2822", padding: "16px 24px", maxHeight: 240, overflowY: "auto" }}>
          {sessions.length === 0
            ? <p style={{ fontSize: 12, color: "#4a4540" }}>저장된 상담이 없습니다.</p>
            : sessions.map((s) => (
              <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid #1e1c18" }}>
                <button
                  onClick={() => loadPastSession(s)}
                  style={{ flex: 1, background: "transparent", border: "none", color: "#9a9088", fontSize: 12, textAlign: "left", cursor: "pointer", padding: 0 }}
                >
                  {new Date(s.savedAt).toLocaleDateString("ko-KR")} — {s.messages[0]?.content?.slice(0, 40)}...
                </button>
                <button
                  onClick={async () => { await deleteSession(s.key); loadSessions().then(setSessions); }}
                  style={{ background: "transparent", border: "none", color: "#4a4540", cursor: "pointer", fontSize: 11 }}
                >삭제</button>
              </div>
            ))
          }
        </div>
      )}

      {/* Main */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", maxWidth: 720, width: "100%", margin: "0 auto", padding: "0 20px" }}>

        {!started ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "40px 0" }}>
            <div style={{ borderLeft: "2px solid #6b5a3a", paddingLeft: 20, marginBottom: 36 }}>
              <p style={{ fontSize: 20, lineHeight: 1.5, color: "#c8c0b0", marginBottom: 8 }}>소셜임팩트 생태계,<br />어디서 어떻게 시작해야 할까요?</p>
              <p style={{ fontSize: 12, color: "#5a5550", lineHeight: 1.7 }}>에이블의 2019–2026년 칼럼 53편을 기반으로 답합니다.</p>
            </div>
            <p style={{ fontSize: 11, color: "#4a4540", letterSpacing: "0.06em", marginBottom: 10 }}>자주 묻는 질문</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {STARTER_QUESTIONS.map(([type, q], i) => {
                const t = QUESTION_TYPES[type];
                return (
                  <button key={i} onClick={() => sendMessage(q, type)}
                    style={{ background: "transparent", border: "1px solid #2a2822", borderRadius: 8, padding: "11px 14px", color: "#9a9088", fontSize: 13, textAlign: "left", cursor: "pointer", lineHeight: 1.5, display: "flex", alignItems: "center", gap: 8, transition: "all 0.15s" }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = "#6b5a3a"; e.currentTarget.style.color = "#c8c0b0"; e.currentTarget.style.background = "#1a1814"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = "#2a2822"; e.currentTarget.style.color = "#9a9088"; e.currentTarget.style.background = "transparent"; }}
                  >
                    <span style={{ fontSize: 10, fontWeight: 500, padding: "2px 6px", borderRadius: 3, background: t.bg, color: t.color, flexShrink: 0 }}>{t.label}</span>
                    {q}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, padding: "24px 0 0", display: "flex", flexDirection: "column", gap: 20 }}>
            {messages.map((m, i) => (
              <div key={i} style={{ display: "flex", flexDirection: m.role === "user" ? "row-reverse" : "row", gap: 10, alignItems: "flex-start" }}>
                {m.role === "assistant" && (
                  <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#b8a07a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: "bold", color: "#111", flexShrink: 0, marginTop: 2 }}>에</div>
                )}
                <div style={{ maxWidth: "78%" }}>
                  {m.role === "user" && m.qtype && (
                    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
                      <TypeBadge type={m.qtype} />
                    </div>
                  )}
                  <div style={{
                    background: m.role === "user" ? "#1e1c18" : "#161412",
                    border: `1px solid ${m.role === "user" ? "#2e2c26" : "#242018"}`,
                    borderRadius: m.role === "user" ? "14px 4px 14px 14px" : "4px 14px 14px 14px",
                    padding: "12px 15px",
                  }}>
                    <p style={{ fontSize: 14, lineHeight: 1.75, color: m.role === "user" ? "#c0b8a8" : "#d8d0c0", margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.content}</p>
                  </div>
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#b8a07a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: "bold", color: "#111", flexShrink: 0 }}>에</div>
                <div style={{ background: "#161412", border: "1px solid #242018", borderRadius: "4px 14px 14px 14px", padding: "15px 18px", display: "flex", gap: 5 }}>
                  {[0,1,2].map(i => <div key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: "#6b5a3a", animation: `pulse 1.2s ease-in-out ${i*0.2}s infinite` }}></div>)}
                </div>
              </div>
            )}
            <div ref={bottomRef} style={{ height: 16 }} />
          </div>
        )}

        {/* Input */}
        <div style={{ position: "sticky", bottom: 0, background: "#0e0e0e", padding: "14px 0 18px", borderTop: "1px solid #1e1c18" }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, background: "#161412", border: "1px solid #2a2822", borderRadius: 12, padding: "9px 10px 9px 14px" }}>
            <textarea ref={textareaRef} value={input}
              onChange={e => { setInput(e.target.value); autoResize(); }}
              onKeyDown={handleKey}
              placeholder="에이블에게 커리어 질문을 해보세요..."
              rows={1}
              style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#c8c0b0", fontSize: 14, fontFamily: "inherit", lineHeight: 1.6, resize: "none", minHeight: 24, maxHeight: 160 }}
            />
            <button onClick={() => sendMessage()} disabled={!input.trim() || loading}
              style={{ width: 32, height: 32, borderRadius: 7, background: input.trim() && !loading ? "#b8a07a" : "#2a2822", border: "none", cursor: input.trim() && !loading ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background 0.15s" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={input.trim() && !loading ? "#111" : "#4a4540"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline>
              </svg>
            </button>
          </div>
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 6, marginTop: 7 }}>
            {USE_RAG && <span style={{ fontSize: 9, color: "#2a9a5a", letterSpacing: "0.05em" }}>RAG ON</span>}
            <span style={{ fontSize: 10, color: "#3a3530", letterSpacing: "0.03em" }}>에이블의 53편 칼럼(2019–2026) 기반</span>
          </div>
        </div>
      </main>

      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        textarea::placeholder { color: #4a4540; }
        @keyframes pulse { 0%,100% { opacity: 0.3; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1.1); } }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: #2a2822; border-radius: 2px; }
      `}</style>
    </div>
  );
}
