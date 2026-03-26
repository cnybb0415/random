import { NextRequest, NextResponse } from "next/server";

const BEARER_TOKEN = process.env.TWITTER_BEARER_TOKEN;

function extractTweetId(input: string): string | null {
  // Handle direct tweet ID
  if (/^\d+$/.test(input.trim())) return input.trim();

  // Handle various URL formats
  const patterns = [
    /twitter\.com\/\w+\/status\/(\d+)/,
    /x\.com\/\w+\/status\/(\d+)/,
    /t\.co\/\w+/,
  ];

  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match && match[1]) return match[1];
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const { tweetUrl } = await req.json();

    if (!BEARER_TOKEN || BEARER_TOKEN === "your_bearer_token_here") {
      return NextResponse.json(
        { error: "Twitter Bearer Token이 설정되지 않았습니다. .env.local 파일에 TWITTER_BEARER_TOKEN을 설정해주세요." },
        { status: 500 }
      );
    }

    const tweetId = extractTweetId(tweetUrl);
    if (!tweetId) {
      return NextResponse.json(
        { error: "유효한 트윗 URL 또는 ID를 입력해주세요." },
        { status: 400 }
      );
    }

    // Fetch tweet info
    const tweetRes = await fetch(
      `https://api.twitter.com/2/tweets/${tweetId}?tweet.fields=text,author_id&expansions=author_id&user.fields=name,username,profile_image_url`,
      {
        headers: { Authorization: `Bearer ${BEARER_TOKEN}` },
      }
    );

    if (!tweetRes.ok) {
      const err = await tweetRes.json();
      if (tweetRes.status === 401) {
        return NextResponse.json(
          { error: "Bearer Token이 유효하지 않습니다." },
          { status: 401 }
        );
      }
      return NextResponse.json(
        { error: err.detail || "트윗을 가져오는데 실패했습니다." },
        { status: tweetRes.status }
      );
    }

    const tweetData = await tweetRes.json();

    // Fetch retweeters (paginate up to 1000)
    let retweeters: Array<{ id: string; name: string; username: string; profile_image_url?: string }> = [];
    let paginationToken: string | undefined = undefined;

    do {
      const url = new URL(`https://api.twitter.com/2/tweets/${tweetId}/retweeted_by`);
      url.searchParams.set("max_results", "100");
      url.searchParams.set("user.fields", "name,username,profile_image_url");
      if (paginationToken) url.searchParams.set("pagination_token", paginationToken);

      const retweetRes = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${BEARER_TOKEN}` },
      });

      if (!retweetRes.ok) {
        const err = await retweetRes.json();
        return NextResponse.json(
          { error: err.detail || "리트윗 목록을 가져오는데 실패했습니다." },
          { status: retweetRes.status }
        );
      }

      const retweetData = await retweetRes.json();

      if (retweetData.data) {
        retweeters = [...retweeters, ...retweetData.data];
      }

      paginationToken = retweetData.meta?.next_token;

      // Stop at 1000 to avoid excessive API calls
      if (retweeters.length >= 1000) break;
    } while (paginationToken);

    const author = tweetData.includes?.users?.[0];

    return NextResponse.json({
      tweetId,
      tweetText: tweetData.data?.text,
      author: author
        ? { name: author.name, username: author.username, profile_image_url: author.profile_image_url }
        : null,
      retweeters,
      total: retweeters.length,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
