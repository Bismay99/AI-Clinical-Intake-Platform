import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/elevenlabs/signed-url
 *
 * Secure server-side route that contacts ElevenLabs API using ELEVENLABS_API_KEY.
 * The API key is NEVER exposed to the frontend/browser client.
 */
export async function GET() {
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  const apiKey = process.env.ELEVENLABS_API_KEY;

  if (!agentId || agentId === "agent_xxxxx" || agentId.trim() === "") {
    return NextResponse.json(
      {
        error: "ELEVENLABS_AGENT_ID is not configured. Add your Agent ID to frontend/.env.local",
        configured: false,
      },
      { status: 400 }
    );
  }

  // If a server-side API key is provided, request a signed WebSocket URL from ElevenLabs
  if (apiKey && apiKey !== "xxxxx" && apiKey.trim() !== "") {
    try {
      const resp = await fetch(
        `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${encodeURIComponent(agentId.trim())}`,
        {
          headers: {
            "xi-api-key": apiKey.trim(),
          },
          cache: "no-store",
        }
      );

      if (!resp.ok) {
        const errorText = await resp.text().catch(() => "");
        console.error("[ElevenLabs Signed URL] API call failed with status:", resp.status, errorText);
        return NextResponse.json(
          {
            error: `Failed to obtain signed URL from ElevenLabs (HTTP ${resp.status}). Verify your Agent ID and API Key.`,
            configured: true,
          },
          { status: resp.status }
        );
      }

      const data = await resp.json();
      if (!data.signed_url) {
        return NextResponse.json(
          { error: "No signed_url returned by ElevenLabs API.", configured: true },
          { status: 502 }
        );
      }

      return NextResponse.json({
        signedUrl: data.signed_url,
        configured: true,
      });
    } catch (err: unknown) {
      console.error("[ElevenLabs Signed URL] Network error:", err);
      return NextResponse.json(
        { error: "Network error connecting to ElevenLabs API.", configured: true },
        { status: 502 }
      );
    }
  }

  // If no API key is provided (public conversational agent), return the agent ID directly
  return NextResponse.json({
    agentId: agentId.trim(),
    signedUrl: null,
    configured: true,
  });
}
