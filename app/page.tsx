"use client";

import { useState, useRef } from "react";

interface Retweeter {
  id: string;
  name: string;
  username: string;
  profile_image_url?: string;
}

interface TweetInfo {
  tweetId: string;
  tweetText: string;
  author: { name: string; username: string; profile_image_url?: string } | null;
  retweeters: Retweeter[];
  total: number;
}

interface Winner extends Retweeter {
  rank: number;
}

type Step = "input" | "loaded" | "drawing" | "done";

export default function Home() {
  const [tweetUrls, setTweetUrls] = useState<string[]>([""]);
  const [winnerCount, setWinnerCount] = useState(1);
  const [loadingIndex, setLoadingIndex] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [tweetInfos, setTweetInfos] = useState<(TweetInfo | null)[]>([null]);
  const [winners, setWinners] = useState<Winner[]>([]);
  const [step, setStep] = useState<Step>("input");
  const [rollingName, setRollingName] = useState("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function addUrl() {
    setTweetUrls((prev) => [...prev, ""]);
    setTweetInfos((prev) => [...prev, null]);
  }

  function removeUrl(index: number) {
    setTweetUrls((prev) => prev.filter((_, i) => i !== index));
    setTweetInfos((prev) => prev.filter((_, i) => i !== index));
  }

  function updateUrl(index: number, value: string) {
    setTweetUrls((prev) => prev.map((u, i) => (i === index ? value : u)));
    // clear loaded info when url changes
    setTweetInfos((prev) => prev.map((t, i) => (i === index ? null : t)));
  }

  async function fetchOne(index: number) {
    const url = tweetUrls[index]?.trim();
    if (!url) {
      setError("트윗 URL을 입력해주세요.");
      return;
    }
    setLoadingIndex(index);
    setError("");

    try {
      const res = await fetch("/api/retweets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tweetUrl: url }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "오류가 발생했습니다.");
        return;
      }
      if (data.total === 0) {
        setError(`트윗 ${index + 1}: 리트윗한 사람이 없습니다.`);
        return;
      }
      setTweetInfos((prev) => prev.map((t, i) => (i === index ? data : t)));
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setLoadingIndex(null);
    }
  }

  async function fetchAll() {
    setError("");
    for (let i = 0; i < tweetUrls.length; i++) {
      if (!tweetInfos[i] && tweetUrls[i]?.trim()) {
        await fetchOne(i);
      }
    }
  }

  // Combined retweeters across all loaded tweets (duplicates allowed)
  const allRetweeters: Retweeter[] = tweetInfos.flatMap((info) => info?.retweeters ?? []);

  const loadedCount = tweetInfos.filter(Boolean).length;
  const canDraw = loadedCount > 0 && allRetweeters.length > 0;

  function goToLoaded() {
    if (!canDraw) {
      setError("최소 1개의 트윗 리트윗 목록을 불러와야 합니다.");
      return;
    }
    setStep("loaded");
    setError("");
  }

  function startDraw() {
    if (!canDraw) return;
    const count = Math.min(winnerCount, allRetweeters.length);
    setStep("drawing");
    setWinners([]);

    const pool = [...allRetweeters];
    let idx = 0;

    intervalRef.current = setInterval(() => {
      idx = (idx + 1) % pool.length;
      setRollingName(pool[idx].name);
    }, 80);

    setTimeout(() => {
      if (intervalRef.current) clearInterval(intervalRef.current);

      // Fisher-Yates shuffle
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
const selected = pool.slice(0, count).map((u, i) => ({ ...u, rank: i + 1 }));
      setWinners(selected);
      setStep("done");
    }, 2500);
  }

  function reset() {
    setStep("input");
    setTweetUrls([""]);
    setTweetInfos([null]);
    setWinners([]);
    setError("");
    setWinnerCount(1);
  }

  function goBack() {
    setStep("loaded");
    setWinners([]);
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#e7e9ea] flex flex-col">
      {/* Header */}
      <header className="border-b border-[#2f3336] px-6 py-4 flex items-center gap-3">
        <svg viewBox="0 0 24 24" className="w-6 h-6 fill-white shrink-0">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.259 5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
        <span className="text-[15px] font-semibold">리트윗 추첨기</span>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-12">
        {/* STEP: INPUT */}
        {step === "input" && (
          <div className="w-full max-w-xl animate-fade-up">
            <div className="mb-8 text-center">
              <h1 className="text-[28px] font-bold mb-2">리트윗 추첨</h1>
              <p className="text-[#71767b] text-[15px]">
                트윗 URL을 여러 개 추가해 합산 추첨할 수 있습니다
              </p>
            </div>

            <div className="bg-[#16181c] border border-[#2f3336] rounded-2xl p-6 space-y-3">
              <label className="block text-[13px] text-[#71767b] font-medium">
                트윗 URL 또는 ID
              </label>

              {tweetUrls.map((url, i) => (
                <div key={i} className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={url}
                      onChange={(e) => updateUrl(i, e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && fetchOne(i)}
                      placeholder="https://x.com/user/status/123456789"
                      className="flex-1 bg-[#0a0a0a] border border-[#2f3336] rounded-xl px-4 py-3 text-[15px] placeholder-[#3d4147] focus:outline-none focus:border-[#1d9bf0] transition-colors"
                    />
                    <button
                      onClick={() => fetchOne(i)}
                      disabled={loadingIndex !== null || !url.trim()}
                      className="px-4 py-3 bg-[#2f3336] rounded-xl text-[13px] font-medium hover:bg-[#3d4147] transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0 flex items-center gap-1.5"
                    >
                      {loadingIndex === i ? (
                        <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      ) : tweetInfos[i] ? (
                        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-[#00ba7c]">
                          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                          <path d="M19 11H7.83l4.88-4.88c.39-.39.39-1.03 0-1.42-.39-.39-1.02-.39-1.41 0l-6.59 6.59c-.39.39-.39 1.02 0 1.41l6.59 6.59c.39.39 1.02.39 1.41 0 .39-.39.39-1.02 0-1.41L7.83 13H19c.55 0 1-.45 1-1s-.45-1-1-1z" />
                        </svg>
                      )}
                      {tweetInfos[i] ? "완료" : "불러오기"}
                    </button>
                    {tweetUrls.length > 1 && (
                      <button
                        onClick={() => removeUrl(i)}
                        className="w-11 h-11 flex items-center justify-center rounded-xl text-[#71767b] hover:text-[#f44336] hover:bg-[#200a0a] transition-colors shrink-0"
                      >
                        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" />
                        </svg>
                      </button>
                    )}
                  </div>

                  {/* Loaded tweet preview chip */}
                  {tweetInfos[i] && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-[#0a0a0a] border border-[#2f3336] rounded-xl">
                      {tweetInfos[i]!.author && (
                        <span className="text-[#e7e9ea] text-[13px] font-medium truncate">
                          @{tweetInfos[i]!.author!.username}
                        </span>
                      )}
                      <span className="text-[#71767b] text-[13px] truncate flex-1">
                        {tweetInfos[i]!.tweetText.slice(0, 50)}
                        {tweetInfos[i]!.tweetText.length > 50 ? "…" : ""}
                      </span>
                      <span className="bg-[#1d9bf01a] text-[#1d9bf0] text-[12px] font-semibold px-2 py-0.5 rounded-full shrink-0">
                        {tweetInfos[i]!.total.toLocaleString()}명
                      </span>
                    </div>
                  )}
                </div>
              ))}

              {/* Add URL button */}
              <button
                onClick={addUrl}
                className="w-full border border-dashed border-[#2f3336] rounded-xl py-2.5 text-[13px] text-[#71767b] hover:border-[#1d9bf0] hover:text-[#1d9bf0] transition-colors flex items-center justify-center gap-1.5"
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                  <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
                </svg>
                트윗 추가
              </button>

              {/* Summary */}
              {loadedCount > 0 && (
                <div className="flex items-center justify-between px-4 py-2.5 bg-[#0a0a0a] border border-[#2f3336] rounded-xl">
                  <span className="text-[13px] text-[#71767b]">
                    {loadedCount}개 트윗 합산
                  </span>
                  <span className="text-[#1d9bf0] text-[14px] font-bold">
                    총 {allRetweeters.length.toLocaleString()}명
                  </span>
                </div>
              )}

              {error && (
                <div className="bg-[#200a0a] border border-[#5c1d1d] rounded-xl px-4 py-3 text-[#f44336] text-[14px]">
                  {error}
                </div>
              )}

              <button
                onClick={goToLoaded}
                disabled={!canDraw}
                className="w-full bg-white text-black font-bold py-3 rounded-xl text-[15px] hover:bg-[#e7e9ea] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                추첨 설정으로 이동
              </button>
            </div>
          </div>
        )}

        {/* STEP: LOADED */}
        {step === "loaded" && (
          <div className="w-full max-w-xl animate-fade-up">
            {/* Loaded tweets summary */}
            <div className="bg-[#16181c] border border-[#2f3336] rounded-2xl p-5 mb-4 space-y-3">
              <p className="text-[13px] text-[#71767b] font-medium">불러온 트윗</p>
              {tweetInfos.filter(Boolean).map((info, i) => (
                <div key={i} className="flex items-start gap-3">
                  {info!.author?.profile_image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={info!.author.profile_image_url} alt="" className="w-8 h-8 rounded-full shrink-0 mt-0.5" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-[#2f3336] shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold">
                      {info!.author ? `@${info!.author.username}` : `트윗 ${i + 1}`}
                    </p>
                    <p className="text-[13px] text-[#71767b] truncate">{info!.tweetText.slice(0, 60)}…</p>
                  </div>
                  <span className="bg-[#1d9bf01a] text-[#1d9bf0] text-[12px] font-semibold px-2 py-0.5 rounded-full shrink-0">
                    {info!.total.toLocaleString()}명
                  </span>
                </div>
              ))}
              <div className="border-t border-[#2f3336] pt-3 flex justify-between items-center">
                <span className="text-[13px] text-[#71767b]">
                  합산 총원
                </span>
                <span className="text-[#e7e9ea] text-[15px] font-bold">
                  {allRetweeters.length.toLocaleString()}명
                </span>
              </div>
            </div>

            {/* Winner count */}
            <div className="bg-[#16181c] border border-[#2f3336] rounded-2xl p-5 mb-4">
              <label className="block text-[13px] text-[#71767b] mb-3 font-medium">
                추첨 인원
              </label>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setWinnerCount(Math.max(1, winnerCount - 1))}
                  className="w-10 h-10 rounded-full border border-[#2f3336] flex items-center justify-center hover:bg-[#2f3336] transition-colors text-lg font-bold"
                >
                  −
                </button>
                <input
                  type="number"
                  min={1}
                  max={allRetweeters.length}
                  value={winnerCount}
                  onChange={(e) =>
                    setWinnerCount(Math.min(allRetweeters.length, Math.max(1, parseInt(e.target.value) || 1)))
                  }
                  className="w-20 bg-[#0a0a0a] border border-[#2f3336] rounded-xl px-3 py-2 text-center text-[18px] font-bold focus:outline-none focus:border-[#1d9bf0]"
                />
                <button
                  onClick={() => setWinnerCount(Math.min(allRetweeters.length, winnerCount + 1))}
                  className="w-10 h-10 rounded-full border border-[#2f3336] flex items-center justify-center hover:bg-[#2f3336] transition-colors text-lg font-bold"
                >
                  +
                </button>
                <span className="text-[#71767b] text-[13px]">/ {allRetweeters.length.toLocaleString()}명</span>
              </div>
            </div>

            <button
              onClick={startDraw}
              className="w-full bg-[#1d9bf0] text-white font-bold py-3 rounded-xl text-[15px] hover:bg-[#1a8cd8] transition-colors"
            >
              추첨 시작
            </button>
            <button
              onClick={reset}
              className="w-full mt-2 text-[#71767b] text-[14px] py-2 hover:text-[#e7e9ea] transition-colors"
            >
              다시 입력하기
            </button>
          </div>
        )}

        {/* STEP: DRAWING */}
        {step === "drawing" && (
          <div className="w-full max-w-xl text-center animate-fade-up">
            <div className="bg-[#16181c] border border-[#2f3336] rounded-2xl p-14 flex flex-col items-center gap-6">
              <div className="w-16 h-16 rounded-full border-4 border-[#1d9bf0] border-t-transparent animate-spin" />
              <div>
                <p className="text-[#71767b] text-[14px] mb-2">추첨 중...</p>
                <p className="text-[22px] font-bold min-h-[32px] animate-roll">{rollingName}</p>
              </div>
            </div>
          </div>
        )}

        {/* STEP: DONE */}
        {step === "done" && (
          <div className="w-full max-w-xl animate-fade-up">
            <div className="text-center mb-6">
              <h2 className="text-[24px] font-bold mb-1">추첨 완료!</h2>
              <p className="text-[#71767b] text-[14px]">
                {allRetweeters.length.toLocaleString()}명 중 {winners.length}명이 선정되었습니다
              </p>
            </div>

            <div className="space-y-3 mb-6">
              {winners.map((w, i) => (
                <div
                  key={w.id}
                  className="bg-[#16181c] border border-[#1d9bf0]/30 rounded-2xl p-4 flex items-center gap-4 animate-winner-glow"
                  style={{ animationDelay: `${i * 0.15}s` }}
                >
                  <div className="w-8 h-8 rounded-full bg-[#1d9bf0] flex items-center justify-center text-white font-bold text-[14px] shrink-0">
                    {w.rank}
                  </div>
                  {w.profile_image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={w.profile_image_url} alt={w.name} className="w-10 h-10 rounded-full shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-[#2f3336] flex items-center justify-center text-[#71767b] shrink-0">
                      <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
                        <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
                      </svg>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-[15px] truncate">{w.name}</p>
                    <a
                      href={`https://x.com/${w.username}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#1d9bf0] text-[13px] hover:underline truncate block"
                    >
                      @{w.username}
                    </a>
                  </div>
                  <svg viewBox="0 0 24 24" className="w-5 h-5 fill-[#ffd700] shrink-0">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={goBack}
                className="flex-1 border border-[#2f3336] font-bold py-3 rounded-xl text-[14px] hover:bg-[#16181c] transition-colors"
              >
                다시 추첨
              </button>
              <button
                onClick={reset}
                className="flex-1 bg-white text-black font-bold py-3 rounded-xl text-[14px] hover:bg-[#e7e9ea] transition-colors"
              >
                새로 시작
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
