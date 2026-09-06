import { NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";

export const dynamic = "force-dynamic";

/**
 * GET /api/livekit/token?room=...&identity=...&sessionId=...&encounterId=...
 * POST /api/livekit/token { room, identity, sessionId, encounterId }
 *
 * Generates an authorized LiveKit JWT token for local WebRTC voice streaming.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId") || "";
  const encounterId = searchParams.get("encounterId") || "";
  const currentFieldName = searchParams.get("currentFieldName") || "chief_complaint";
  const currentQuestion = searchParams.get("currentQuestion") || "";
  const language = searchParams.get("language") || "hi";
  const authToken =
    searchParams.get("authToken") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    "";
  const room = searchParams.get("room") || (sessionId ? `intake-${sessionId}` : `intake-${Date.now()}`);
  const identity = searchParams.get("identity") || `patient-${Math.floor(Math.random() * 10000)}`;

  return generateTokenResponse(room, identity, sessionId, encounterId, authToken, currentFieldName, currentQuestion, language);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const sessionId = body.sessionId || "";
    const encounterId = body.encounterId || "";
    const currentFieldName = body.currentFieldName || "chief_complaint";
    const currentQuestion = body.currentQuestion || "";
    const language = body.language || "hi";
    const authToken =
      body.authToken ||
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
      "";
    const room = body.room || (sessionId ? `intake-${sessionId}` : `intake-${Date.now()}`);
    const identity = body.identity || `patient-${Math.floor(Math.random() * 10000)}`;

    return generateTokenResponse(room, identity, sessionId, encounterId, authToken, currentFieldName, currentQuestion, language);
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body" }, { status: 400 });
  }
}

async function generateTokenResponse(
  room: string,
  identity: string,
  sessionId: string,
  encounterId: string,
  authToken: string = "",
  currentFieldName: string = "chief_complaint",
  currentQuestion: string = "",
  language: string = "hi"
) {
  const apiKey = process.env.LIVEKIT_API_KEY || "devkey";
  const apiSecret = process.env.LIVEKIT_API_SECRET || "secret";
  const livekitUrl =
    process.env.NEXT_PUBLIC_LIVEKIT_URL ||
    process.env.LIVEKIT_URL ||
    "ws://127.0.0.1:7880";

  try {
    const at = new AccessToken(apiKey, apiSecret, {
      identity,
      name: identity,
      metadata: JSON.stringify({
        sessionId,
        encounterId,
        authToken,
        currentFieldName,
        currentQuestion,
        language,
      }),
    });

    at.addGrant({
      room,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const token = await at.toJwt();

    return NextResponse.json({
      token,
      url: livekitUrl,
      room,
      identity,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to create LiveKit token";
    console.error("[LiveKit Token Route] Error generating token:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
