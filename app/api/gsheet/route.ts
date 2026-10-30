import { NextRequest, NextResponse } from "next/server";

// 구글시트 URL → xlsx 내보내기 URL
// - 일반 링크: https://docs.google.com/spreadsheets/d/{id}/edit#gid=0
// - 웹 게시 링크: https://docs.google.com/spreadsheets/d/e/{pubId}/pubhtml
function toExportUrl(input: string): string | null {
  const s = input.trim();

  const pub = s.match(/\/spreadsheets\/d\/e\/([a-zA-Z0-9-_]+)/);
  if (pub) return `https://docs.google.com/spreadsheets/d/e/${pub[1]}/pub?output=xlsx`;

  const normal = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (normal) return `https://docs.google.com/spreadsheets/d/${normal[1]}/export?format=xlsx`;

  // ID만 붙여넣은 경우
  if (/^[a-zA-Z0-9-_]{25,}$/.test(s)) return `https://docs.google.com/spreadsheets/d/${s}/export?format=xlsx`;

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    const exportUrl = typeof url === "string" ? toExportUrl(url) : null;
    if (!exportUrl) {
      return NextResponse.json({ error: "구글시트 링크를 확인해주세요." }, { status: 400 });
    }

    const res = await fetch(exportUrl, { redirect: "follow", cache: "no-store" });
    const type = res.headers.get("content-type") ?? "";

    // 비공개 시트는 로그인 페이지(HTML)로 리다이렉트됨
    if (!res.ok || type.includes("text/html")) {
      const status = res.status === 404 ? 404 : 403;
      return NextResponse.json(
        {
          error:
            status === 404
              ? "시트를 찾을 수 없습니다. 링크를 확인해주세요."
              : "시트에 접근할 수 없습니다. 공유 설정을 '링크가 있는 모든 사용자 · 뷰어'로 바꿔주세요.",
        },
        { status }
      );
    }

    const buf = await res.arrayBuffer();
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "시트를 불러오는 중 오류가 발생했습니다." }, { status: 500 });
  }
}
