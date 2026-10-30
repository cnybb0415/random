"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";

// ── Types ─────────────────────────────────────────────────────────
interface SheetData {
  name: string;
  headers: string[];
  rows: string[][];
}

interface Winner {
  rank: number;
  row: string[];
}

type Step = "link" | "setup" | "drawing" | "done";

const DRAW_MS = 2600;
const NAME_HINT = /이름|닉네임|성함|name|nick|아이디|트위터|계정|id|handle|@/i;

// ── Helpers ───────────────────────────────────────────────────────
function colLetter(i: number): string {
  let s = "";
  let n = i + 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function parseWorkbook(wb: XLSX.WorkBook): SheetData[] {
  return wb.SheetNames.map((name) => {
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], {
      header: 1,
      defval: "",
      raw: false,
      blankrows: false,
    });
    const width = aoa.reduce((w, r) => Math.max(w, r.length), 0);
    const head = aoa[0] ?? [];
    const headers = Array.from({ length: width }, (_, i) => String(head[i] ?? "").trim() || `${colLetter(i)}열`);
    const rows = aoa
      .slice(1)
      .map((r) => Array.from({ length: width }, (_, i) => String(r[i] ?? "").trim()))
      .filter((r) => r.some((c) => c !== ""));
    return { name, headers, rows };
  }).filter((s) => s.headers.length > 0);
}

function guessColumn(headers: string[]): number {
  const i = headers.findIndex((h) => NAME_HINT.test(h));
  return i >= 0 ? i : 0;
}

// 암호학적 난수로 0..n-1 (모듈로 편향 제거)
function randInt(n: number): number {
  const max = Math.floor(0x100000000 / n) * n;
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf);
  while (buf[0] >= max);
  return buf[0] % n;
}

function pickRandom<T>(items: T[], count: number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, count);
}

function escapeCsv(v: string) {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

// ── Icons ─────────────────────────────────────────────────────────
function SheetsIcon({ className = "w-7 h-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <path fill="#0F9D58" d="M29 4H11a3 3 0 0 0-3 3v34a3 3 0 0 0 3 3h26a3 3 0 0 0 3-3V15z" />
      <path fill="#87CEAC" d="M29 4v8a3 3 0 0 0 3 3h8z" />
      <path fill="#F1F1F1" d="M15 22v14h18V22zm2 2h6v3h-6zm8 0h6v3h-6zm-8 5h6v5h-6zm8 0h6v5h-6z" />
    </svg>
  );
}

// ── Page ──────────────────────────────────────────────────────────
export default function SheetsRaffle() {
  const [step, setStep] = useState<Step>("link");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [sheets, setSheets] = useState<SheetData[]>([]);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [colIdx, setColIdx] = useState(0);
  const [dedupe, setDedupe] = useState(true);
  const [winnerCount, setWinnerCount] = useState(1);

  const [rolling, setRolling] = useState("");
  const [winners, setWinners] = useState<Winner[]>([]);
  const [copied, setCopied] = useState(false);
  const timers = useRef<ReturnType<typeof setInterval>[]>([]);

  const sheet = sheets[sheetIdx];

  // 추첨 대상: 선택 열이 비어있지 않은 행 (+ 중복 제거)
  const { pool, dupCount, emptyCount } = useMemo(() => {
    if (!sheet) return { pool: [] as string[][], dupCount: 0, emptyCount: 0 };
    const filled = sheet.rows.filter((r) => r[colIdx]);
    const emptyCount = sheet.rows.length - filled.length;
    if (!dedupe) return { pool: filled, dupCount: 0, emptyCount };
    const seen = new Set<string>();
    const pool = filled.filter((r) => {
      const key = r[colIdx].toLowerCase().replace(/^@/, "");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return { pool, dupCount: filled.length - pool.length, emptyCount };
  }, [sheet, colIdx, dedupe]);

  const count = Math.min(winnerCount, pool.length);

  // ── Actions ─────────────────────────────────────────────────────
  async function loadSheet() {
    if (!url.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/gsheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "시트를 불러오지 못했습니다.");
        return;
      }
      const wb = XLSX.read(new Uint8Array(await res.arrayBuffer()), { type: "array" });
      const parsed = parseWorkbook(wb);
      if (parsed.length === 0) {
        setError("시트에 데이터가 없습니다.");
        return;
      }
      setSheets(parsed);
      selectSheet(parsed, 0);
      setStep("setup");
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  function selectSheet(list: SheetData[], i: number) {
    setSheetIdx(i);
    setColIdx(guessColumn(list[i].headers));
    setWinnerCount(1);
  }

  function startDraw() {
    if (pool.length === 0) return;
    setStep("drawing");
    setWinners([]);
    setCopied(false);

    const roll = setInterval(() => {
      setRolling(pool[randInt(pool.length)][colIdx]);
    }, 70);
    timers.current.push(roll);

    const done = setTimeout(() => {
      clearInterval(roll);
      setWinners(pickRandom(pool, count).map((row, i) => ({ rank: i + 1, row })));
      setStep("done");
    }, DRAW_MS);
    timers.current.push(done as unknown as ReturnType<typeof setInterval>);
  }

  function resetAll() {
    timers.current.forEach((t) => clearInterval(t));
    timers.current = [];
    setStep("link");
    setSheets([]);
    setWinners([]);
    setError("");
  }

  function resultRows(): string[][] {
    return [["순위", ...sheet.headers], ...winners.map((w) => [String(w.rank), ...w.row])];
  }

  async function copyResult() {
    const tsv = resultRows().map((r) => r.map((c) => c.replace(/[\t\n]/g, " ")).join("\t")).join("\n");
    await navigator.clipboard.writeText(tsv);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  function downloadCsv() {
    const csv = "﻿" + resultRows().map((r) => r.map(escapeCsv).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
    a.download = `추첨결과_${sheet.name}_${stamp}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ── Render ──────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#f8f9fa] text-[#202124] flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-[#dadce0] px-5 py-3 flex items-center gap-3">
        <SheetsIcon />
        <div className="flex-1 min-w-0">
          <p className="text-[18px] leading-tight text-[#202124]">시트 추첨기</p>
          {sheet && step !== "link" && (
            <p className="text-[12px] text-[#5f6368] truncate">{sheet.name} · {sheet.rows.length.toLocaleString()}행</p>
          )}
        </div>
        <Link href="/" className="text-[13px] text-[#5f6368] hover:text-[#188038] px-3 py-1.5 rounded-full hover:bg-[#e6f4ea] transition-colors">
          트위터 추첨기 →
        </Link>
      </header>

      <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-8">
        {/* STEP 1: LINK */}
        {step === "link" && (
          <div className="animate-fade-up max-w-xl mx-auto mt-6">
            <h1 className="text-[26px] font-normal mb-1">구글시트로 랜덤 추첨</h1>
            <p className="text-[14px] text-[#5f6368] mb-6">설문 응답 시트나 명단 시트 링크를 붙여넣으세요.</p>

            <div className="bg-white rounded-lg border border-[#dadce0] shadow-sm p-5">
              <label className="block text-[12px] font-medium text-[#188038] mb-1.5">스프레드시트 링크</label>
              <div className="flex gap-2">
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && loadSheet()}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  className="flex-1 min-w-0 border-b-2 border-[#dadce0] focus:border-[#188038] bg-[#f8f9fa] rounded-t px-3 py-2.5 text-[15px] outline-none transition-colors"
                />
                <button
                  onClick={loadSheet}
                  disabled={loading || !url.trim()}
                  className="px-5 rounded-md bg-[#188038] text-white text-[14px] font-medium hover:bg-[#137333] hover:shadow disabled:bg-[#dadce0] disabled:text-[#80868b] transition-all flex items-center gap-2 shrink-0"
                >
                  {loading && <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
                  불러오기
                </button>
              </div>

              {error && (
                <div className="mt-3 flex gap-2 text-[13px] text-[#c5221f] bg-[#fce8e6] rounded px-3 py-2">
                  <span>⚠</span><span>{error}</span>
                </div>
              )}

              <div className="mt-5 pt-4 border-t border-[#f1f3f4] text-[13px] text-[#5f6368] space-y-1.5">
                <p className="font-medium text-[#3c4043]">시트 공유 설정</p>
                <p>공유 → 일반 액세스 → <b className="text-[#3c4043]">링크가 있는 모든 사용자</b> · 뷰어</p>
                <p>첫 번째 행은 열 제목으로 사용돼요.</p>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: SETUP */}
        {step === "setup" && sheet && (
          <div className="animate-fade-up space-y-4">
            {/* Column pick + preview grid */}
            <section className="bg-white rounded-lg border border-[#dadce0] shadow-sm overflow-hidden">
              <div className="px-4 pt-4 pb-3">
                <p className="text-[14px] font-medium">추첨할 열 선택</p>
                <p className="text-[12px] text-[#5f6368]">열 제목을 클릭하세요. 이 열 값이 당첨자 이름으로 쓰여요.</p>
              </div>

              <div className="overflow-x-auto border-t border-[#dadce0]">
                <table className="text-[13px] border-collapse min-w-full">
                  <thead>
                    <tr className="bg-[#f8f9fa] text-[#5f6368] text-[11px]">
                      <th className="w-10 border-r border-b border-[#dadce0]" />
                      {sheet.headers.map((_, i) => (
                        <th key={i} className={`border-r border-b border-[#dadce0] py-0.5 font-normal ${i === colIdx ? "bg-[#ceead6] text-[#0d652d]" : ""}`}>
                          {colLetter(i)}
                        </th>
                      ))}
                    </tr>
                    <tr>
                      <td className="text-center text-[11px] text-[#5f6368] bg-[#f8f9fa] border-r border-b border-[#dadce0]">1</td>
                      {sheet.headers.map((h, i) => (
                        <td key={i} className="border-r border-b border-[#dadce0] p-0">
                          <button
                            onClick={() => setColIdx(i)}
                            className={`w-full text-left px-2 py-1.5 font-medium whitespace-nowrap max-w-[220px] truncate transition-colors ${
                              i === colIdx ? "bg-[#e6f4ea] text-[#0d652d] outline outline-2 -outline-offset-2 outline-[#188038]" : "hover:bg-[#f1f3f4]"
                            }`}
                          >
                            {h}
                          </button>
                        </td>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sheet.rows.slice(0, 6).map((r, ri) => (
                      <tr key={ri}>
                        <td className="text-center text-[11px] text-[#5f6368] bg-[#f8f9fa] border-r border-b border-[#dadce0]">{ri + 2}</td>
                        {r.map((c, ci) => (
                          <td key={ci} className={`border-r border-b border-[#e8eaed] px-2 py-1 whitespace-nowrap max-w-[220px] truncate ${ci === colIdx ? "bg-[#e6f4ea]/60" : ""}`}>
                            {c}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {sheet.rows.length > 6 && (
                <p className="px-4 py-2 text-[12px] text-[#5f6368] border-t border-[#f1f3f4]">외 {(sheet.rows.length - 6).toLocaleString()}행</p>
              )}

              {/* Sheet tabs (bottom, like Sheets) */}
              {sheets.length > 1 && (
                <div className="flex gap-0.5 bg-[#f8f9fa] border-t border-[#dadce0] px-2 overflow-x-auto">
                  {sheets.map((s, i) => (
                    <button
                      key={s.name}
                      onClick={() => selectSheet(sheets, i)}
                      className={`px-4 py-2 text-[13px] whitespace-nowrap transition-colors ${
                        i === sheetIdx ? "bg-white text-[#188038] font-medium shadow-[0_2px_0_#188038_inset]" : "text-[#5f6368] hover:bg-[#e8eaed]"
                      }`}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              )}
            </section>

            {/* Options + summary */}
            <section className="grid sm:grid-cols-2 gap-4">
              <div className="bg-white rounded-lg border border-[#dadce0] shadow-sm p-4 space-y-4">
                <div>
                  <p className="text-[12px] text-[#5f6368] mb-2">당첨 인원</p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setWinnerCount(Math.max(1, winnerCount - 1))}
                      className="w-9 h-9 rounded-full border border-[#dadce0] text-[18px] text-[#5f6368] hover:bg-[#f1f3f4]"
                    >−</button>
                    <input
                      type="number"
                      min={1}
                      max={pool.length}
                      value={winnerCount}
                      onChange={(e) => setWinnerCount(Math.max(1, Math.min(pool.length || 1, parseInt(e.target.value) || 1)))}
                      className="w-16 text-center text-[18px] font-medium border-b-2 border-[#dadce0] focus:border-[#188038] outline-none py-1"
                    />
                    <button
                      onClick={() => setWinnerCount(Math.min(pool.length || 1, winnerCount + 1))}
                      className="w-9 h-9 rounded-full border border-[#dadce0] text-[18px] text-[#5f6368] hover:bg-[#f1f3f4]"
                    >+</button>
                    <span className="text-[13px] text-[#5f6368]">명</span>
                  </div>
                </div>

                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <span className={`relative w-9 h-5 rounded-full transition-colors ${dedupe ? "bg-[#188038]" : "bg-[#bdc1c6]"}`}>
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${dedupe ? "left-[18px]" : "left-0.5"}`} />
                  </span>
                  <input type="checkbox" checked={dedupe} onChange={(e) => setDedupe(e.target.checked)} className="hidden" />
                  <span className="text-[14px]">중복 참여 1회로 처리</span>
                </label>
              </div>

              <div className="bg-[#e6f4ea] rounded-lg border border-[#ceead6] p-4 flex flex-col justify-between">
                <div>
                  <p className="text-[12px] text-[#0d652d]">추첨 대상</p>
                  <p className="text-[32px] font-medium text-[#0d652d] leading-tight">{pool.length.toLocaleString()}<span className="text-[16px] ml-1">명</span></p>
                  <p className="text-[12px] text-[#137333] mt-1">
                    {sheet.headers[colIdx]} 열
                    {dupCount > 0 && ` · 중복 ${dupCount}건 제외`}
                    {emptyCount > 0 && ` · 빈 칸 ${emptyCount}행 제외`}
                  </p>
                </div>
                <button
                  onClick={startDraw}
                  disabled={pool.length === 0}
                  className="mt-4 w-full py-2.5 rounded-md bg-[#188038] text-white font-medium hover:bg-[#137333] hover:shadow-md disabled:bg-[#dadce0] transition-all"
                >
                  {count}명 추첨하기
                </button>
              </div>
            </section>

            <button onClick={resetAll} className="text-[13px] text-[#5f6368] hover:text-[#188038]">← 다른 시트 불러오기</button>
          </div>
        )}

        {/* STEP 3: DRAWING */}
        {step === "drawing" && (
          <div className="animate-fade-up max-w-xl mx-auto mt-10">
            <div className="bg-white rounded-lg border border-[#dadce0] shadow-sm overflow-hidden">
              {/* formula bar */}
              <div className="flex items-center border-b border-[#dadce0] text-[13px]">
                <span className="px-3 py-2 border-r border-[#dadce0] text-[#5f6368] w-24">추첨 중</span>
                <span className="px-3 py-2 italic text-[#80868b] border-r border-[#dadce0]">fx</span>
                <span className="px-3 py-2 truncate">=RANDOM({sheet?.headers[colIdx]})</span>
              </div>
              <div className="py-14 px-6 text-center">
                <p className="text-[34px] font-medium text-[#188038] min-h-[48px] truncate">{rolling}</p>
                <p className="text-[13px] text-[#5f6368] mt-2">{pool.length.toLocaleString()}명 중 {count}명</p>
              </div>
              <div className="h-1 bg-[#e6f4ea]">
                <div className="h-full bg-[#188038] animate-sheet-progress" style={{ animationDuration: `${DRAW_MS}ms` }} />
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: DONE */}
        {step === "done" && sheet && (
          <div className="animate-fade-up space-y-4">
            <div className="flex items-end justify-between gap-3 flex-wrap">
              <div>
                <h2 className="text-[24px] font-normal">추첨 결과</h2>
                <p className="text-[13px] text-[#5f6368]">
                  {sheet.name} · {pool.length.toLocaleString()}명 중 {winners.length}명 · {new Date().toLocaleString("ko-KR")}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={copyResult}
                  className="px-4 py-2 rounded-md border border-[#dadce0] bg-white text-[13px] font-medium text-[#188038] hover:bg-[#f6fafe] transition-colors"
                >
                  {copied ? "✓ 복사됨" : "표 복사"}
                </button>
                <button
                  onClick={downloadCsv}
                  className="px-4 py-2 rounded-md border border-[#dadce0] bg-white text-[13px] font-medium text-[#188038] hover:bg-[#f6fafe] transition-colors"
                >
                  CSV 저장
                </button>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-[#dadce0] shadow-sm overflow-x-auto">
              <table className="min-w-full text-[13px] border-collapse">
                <thead>
                  <tr className="bg-[#188038] text-white">
                    <th className="px-3 py-2 text-center font-medium w-14">순위</th>
                    {sheet.headers.map((h, i) => (
                      <th key={i} className={`px-3 py-2 text-left font-medium whitespace-nowrap ${i === colIdx ? "bg-[#137333]" : ""}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {winners.map((w, wi) => (
                    <tr
                      key={wi}
                      className="border-b border-[#e8eaed] even:bg-[#f8f9fa] opacity-0 animate-fade-up"
                      style={{ animationDelay: `${wi * 120}ms` }}
                    >
                      <td className="px-3 py-2.5 text-center">
                        <span className={`inline-flex w-7 h-7 items-center justify-center rounded-full text-[12px] font-medium ${w.rank <= 3 ? "bg-[#fbbc04] text-[#202124]" : "bg-[#e8eaed] text-[#3c4043]"}`}>
                          {w.rank}
                        </span>
                      </td>
                      {w.row.map((c, ci) => (
                        <td key={ci} className={`px-3 py-2.5 whitespace-nowrap max-w-[260px] truncate ${ci === colIdx ? "font-medium text-[#0d652d]" : "text-[#3c4043]"}`}>
                          {c}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[12px] text-[#80868b]">‘표 복사’ 후 구글시트에 붙여넣으면 그대로 셀에 들어가요.</p>

            <div className="flex gap-2 pt-2">
              <button onClick={startDraw} className="flex-1 py-2.5 rounded-md bg-[#188038] text-white font-medium hover:bg-[#137333] transition-colors">
                다시 추첨
              </button>
              <button onClick={() => setStep("setup")} className="flex-1 py-2.5 rounded-md border border-[#dadce0] bg-white font-medium text-[#3c4043] hover:bg-[#f1f3f4] transition-colors">
                설정 변경
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
