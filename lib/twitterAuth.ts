import { createHmac, timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";

// 트위터 모드는 유료 API를 쓰므로 비밀번호로 보호한다.
// 비밀번호는 Vercel 환경변수 TWITTER_PAGE_PASSWORD 로 설정.
export const AUTH_COOKIE = "tw_auth";
export const AUTH_MAX_AGE = 60 * 60 * 24 * 7; // 7일

export function getPassword(): string | null {
  const p = process.env.TWITTER_PAGE_PASSWORD;
  return p && p.length > 0 ? p : null;
}

// 쿠키에는 비밀번호 자체 대신 HMAC 값을 저장 (비밀번호 바꾸면 기존 쿠키 자동 무효)
export function tokenFor(password: string): string {
  return createHmac("sha256", password).update("twitter-raffle-auth").digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function checkPassword(input: string): boolean {
  const password = getPassword();
  if (!password) return false;
  return safeEqual(tokenFor(input), tokenFor(password));
}

export function isAuthed(req: NextRequest): boolean {
  const password = getPassword();
  if (!password) return false;
  const cookie = req.cookies.get(AUTH_COOKIE)?.value;
  return !!cookie && safeEqual(cookie, tokenFor(password));
}
