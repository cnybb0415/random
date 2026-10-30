import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, AUTH_MAX_AGE, checkPassword, getPassword, isAuthed, tokenFor } from "@/lib/twitterAuth";

// 로그인 상태 확인
export async function GET(req: NextRequest) {
  return NextResponse.json({ authed: isAuthed(req), configured: !!getPassword() });
}

// 비밀번호 확인 → 쿠키 발급
export async function POST(req: NextRequest) {
  const password = getPassword();
  if (!password) {
    return NextResponse.json(
      { error: "서버에 비밀번호가 설정되지 않았습니다. (TWITTER_PAGE_PASSWORD)" },
      { status: 500 }
    );
  }

  const { password: input } = await req.json().catch(() => ({ password: "" }));
  if (typeof input !== "string" || !checkPassword(input)) {
    // 무차별 대입 속도 늦추기
    await new Promise((r) => setTimeout(r, 700));
    return NextResponse.json({ error: "비밀번호가 틀렸습니다." }, { status: 401 });
  }

  const res = NextResponse.json({ authed: true });
  res.cookies.set(AUTH_COOKIE, tokenFor(password), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: AUTH_MAX_AGE,
  });
  return res;
}

// 로그아웃
export async function DELETE() {
  const res = NextResponse.json({ authed: false });
  res.cookies.delete(AUTH_COOKIE);
  return res;
}
