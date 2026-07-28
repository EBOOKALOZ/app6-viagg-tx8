/**
 * media-video-search — ORION-MEDIA-02 (Centro Multimídia: modo Rádio + TV).
 *
 * Recebe { artist, title, album? } e devolve o videoclipe correspondente no
 * YouTube, classificado por tipo (official | lyric | live | visualizer).
 *
 * • CACHE SERVIDOR: media_track_videos (service role). 1 busca por música
 *   serve a plataforma inteira — economiza quota (search = 100 unidades) e
 *   garante resposta instantânea nas próximas vezes.
 * • NUNCA vídeo aleatório: um candidato só é aceito se o título/canal do vídeo
 *   bater com artista E música (verificação por tokens normalizados).
 * • Só vídeos EMBEDDABLE (o player usa youtube-nocookie.com/embed — nunca
 *   hospedamos vídeo; respeitamos os termos do provedor).
 * • Sem YOUTUBE_API_KEY configurada → { ok:false, reason:'not_configured' }
 *   (o player degrada com "Vídeo indisponível…" e o áudio continua).
 * • Cache negativo ('none') reexpira em 7 dias (a música pode ganhar clipe).
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type VideoType = "official" | "lyric" | "live" | "visualizer";
const TYPE_PRIORITY: VideoType[] = ["official", "lyric", "live", "visualizer"];
const NEGATIVE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 'none' reexpira em 7 dias

interface Candidate {
  video_id: string;
  title: string;
  channel: string;
  thumbnail_url: string | null;
  duration_seconds?: number | null;
}

// ── normalização (ESPELHA src/lib/multimedia/videoLookup.ts) ─────────────────
function norm(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\((feat|ft|com|part)\.?[^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function trackKey(artist: string, title: string): string {
  return `${norm(artist)}|${norm(title)}`.slice(0, 300);
}
function tokens(s: string): string[] {
  return norm(s).split(" ").filter((t) => t.length > 1);
}

/** O vídeo é MESMO desta música? Exige título da faixa + artista presentes. */
function matchesTrack(videoTitle: string, channel: string, artist: string, title: string): boolean {
  const vt = norm(videoTitle);
  const ch = norm(channel);
  const tTokens = tokens(title);
  if (tTokens.length === 0) return false;
  const hit = tTokens.filter((t) => vt.includes(t)).length;
  if (hit / tTokens.length < 0.6) return false; // título da faixa precisa aparecer
  if (!artist) return true;
  const a = norm(artist);
  if (!a) return true;
  const aTokens = tokens(artist);
  const artistInTitle = aTokens.length > 0 && aTokens.filter((t) => vt.includes(t)).length / aTokens.length >= 0.5;
  const artistInChannel = ch.includes(a) || a.includes(ch.replace(/ (vevo|topic|oficial|official)$/g, "").trim());
  return artistInTitle || artistInChannel;
}

function isOfficialChannel(channel: string, artist: string): boolean {
  const ch = norm(channel);
  const a = norm(artist);
  if (!ch) return false;
  if (ch.endsWith("vevo") || ch.includes(" vevo")) return true;
  if (a && (ch === a || ch === `${a} oficial` || ch === `${a} official`)) return true;
  return false;
}

/** Classifica o tipo do vídeo pelo título + canal (heurística declarada). */
function classify(videoTitle: string, channel: string, artist: string): VideoType {
  const vt = norm(videoTitle);
  const ch = (channel || "").toLowerCase();
  if (/\b(lyric|lyrics|letra|com letra|karaoke)\b/.test(vt)) return "lyric";
  if (/\b(visualizer|visualiser|official audio|audio oficial|art track|pseudo video)\b/.test(vt) || ch.endsWith(" - topic")) return "visualizer";
  if (/\b(ao vivo|live session|live at|live in|live no|live na|acustico|unplugged|concert|festival)\b/.test(vt) || /\blive\b/.test(vt)) return "live";
  if (/\b(official video|official music video|video oficial|clipe oficial|videoclipe|video clipe|official mv|m v)\b/.test(vt)) return "official";
  // sem marcador no título: upload do canal oficial ≈ clipe; de terceiros ≈ áudio
  return isOfficialChannel(channel, artist) ? "official" : "visualizer";
}

/** ISO8601 (PT4M13S) → segundos. */
function isoToSeconds(iso: string): number | null {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso || "");
  if (!m) return null;
  const s = (Number(m[1]) || 0) * 3600 + (Number(m[2]) || 0) * 60 + (Number(m[3]) || 0);
  return s > 0 ? s : null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const { artist = "", title = "", album = "", force = false } = await req.json().catch(() => ({}));
    const cleanArtist = String(artist || "").slice(0, 200).trim();
    const cleanTitle = String(title || "").slice(0, 200).trim();
    if (!cleanTitle) return json({ ok: false, reason: "bad_request", detail: "title obrigatório" }, 400);

    const key = trackKey(cleanArtist, cleanTitle);
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── 1. cache compartilhado ────────────────────────────────────────────
    const { data: cached } = await supabase
      .from("media_track_videos").select("*").eq("track_key", key).maybeSingle();
    const negativeFresh = cached?.video_type === "none"
      && Date.now() - new Date(cached.updated_at).getTime() < NEGATIVE_TTL_MS;
    if (cached && !force && (cached.video_type !== "none" || negativeFresh)) {
      supabase.from("media_track_videos")
        .update({ hits: (Number(cached.hits) || 0) + 1, updated_at: cached.updated_at })
        .eq("id", cached.id).then(() => {}, () => {});
      return json({ ok: true, cached: true, row: cached });
    }

    // ── 2. YouTube Data API v3 ────────────────────────────────────────────
    const ytKey = Deno.env.get("YOUTUBE_API_KEY");
    if (!ytKey) return json({ ok: false, reason: "not_configured" });

    const t0 = Date.now();
    const q = encodeURIComponent(`${cleanArtist} ${cleanTitle}`.trim());
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoCategoryId=10&maxResults=10&q=${q}&key=${ytKey}`;
    const sRes = await fetch(searchUrl);
    if (!sRes.ok) {
      const errBody = await sRes.text().catch(() => "");
      const quota = sRes.status === 403 && /quota/i.test(errBody);
      return json({ ok: false, reason: quota ? "quota" : "yt_error", detail: `YouTube ${sRes.status}` });
    }
    const sJson = await sRes.json();
    const items: Array<{ id?: { videoId?: string }; snippet?: { title?: string; channelTitle?: string; thumbnails?: Record<string, { url?: string }> } }> =
      Array.isArray(sJson?.items) ? sJson.items : [];

    // verifica (nunca vídeo aleatório) e guarda até 2 candidatos por tipo
    const byType = new Map<VideoType, Candidate[]>();
    for (const it of items) {
      const vid = it?.id?.videoId;
      const vTitle = it?.snippet?.title || "";
      const channel = it?.snippet?.channelTitle || "";
      if (!vid || !matchesTrack(vTitle, channel, cleanArtist, cleanTitle)) continue;
      const type = classify(vTitle, channel, cleanArtist);
      const list = byType.get(type) || [];
      if (list.length < 2) {
        list.push({
          video_id: vid, title: vTitle, channel,
          thumbnail_url: it?.snippet?.thumbnails?.medium?.url || it?.snippet?.thumbnails?.default?.url || null,
        });
        byType.set(type, list);
      }
    }

    // ── 3. contentDetails + status (duração e SÓ embeddable) ─────────────
    const allIds = [...byType.values()].flat().map((c) => c.video_id);
    const meta = new Map<string, { duration: number | null; embeddable: boolean }>();
    if (allIds.length > 0) {
      const vRes = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,status&id=${allIds.join(",")}&key=${ytKey}`,
      );
      if (vRes.ok) {
        const vJson = await vRes.json();
        for (const v of (Array.isArray(vJson?.items) ? vJson.items : [])) {
          meta.set(v.id, {
            duration: isoToSeconds(v?.contentDetails?.duration || ""),
            embeddable: v?.status?.embeddable !== false,
          });
        }
      }
    }

    const alternatives: Record<string, Candidate> = {};
    for (const type of TYPE_PRIORITY) {
      const list = byType.get(type) || [];
      const okCand = list.find((c) => meta.get(c.video_id)?.embeddable !== false);
      if (okCand) {
        alternatives[type] = { ...okCand, duration_seconds: meta.get(okCand.video_id)?.duration ?? null };
      }
    }

    const bestType = TYPE_PRIORITY.find((t) => alternatives[t]) || null;
    const best = bestType ? alternatives[bestType] : null;

    // ── 4. grava no cache compartilhado (positivo OU negativo) ───────────
    const row = {
      track_key: key,
      artist: cleanArtist || null,
      title: cleanTitle,
      album: String(album || "").slice(0, 200) || null,
      provider: "youtube",
      video_id: best?.video_id || null,
      video_type: bestType || "none",
      thumbnail_url: best?.thumbnail_url || null,
      duration_seconds: best?.duration_seconds ?? null,
      alternatives,
      source: "youtube_api",
      updated_at: new Date().toISOString(),
    };
    const { data: saved, error: upErr } = await supabase
      .from("media_track_videos")
      .upsert(row, { onConflict: "track_key" })
      .select().maybeSingle();
    if (upErr) console.warn("[media-video-search] cache upsert:", upErr.message);

    return json({ ok: true, cached: false, took_ms: Date.now() - t0, row: saved || { ...row, hits: 0 } });
  } catch (err) {
    console.error("[media-video-search]", err);
    return json({ ok: false, reason: "error", detail: String((err as Error)?.message || err) }, 500);
  }
});
