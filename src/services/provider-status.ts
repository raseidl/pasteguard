type StatusLevel = "none" | "minor" | "major" | "critical" | "unknown";

export interface ProviderStatuses {
  openai: StatusLevel;
  claude: StatusLevel;
  gemini: StatusLevel;
}

interface CachedStatus {
  data: ProviderStatuses;
  fetchedAt: number;
}

const STATUS_CACHE_TTL_MS = 120_000;
const FETCH_TIMEOUT_MS = 10_000;

let cached: CachedStatus | null = null;

export async function getProviderStatuses(): Promise<ProviderStatuses> {
  if (cached && Date.now() - cached.fetchedAt < STATUS_CACHE_TTL_MS) {
    return cached.data;
  }

  const [openai, claude, gemini] = await Promise.allSettled([
    fetchStatuspageIndicator("https://status.openai.com/api/v2/summary.json"),
    fetchStatuspageIndicator("https://status.claude.com/api/v2/summary.json"),
    fetchGeminiStatus(),
  ]);

  const data: ProviderStatuses = {
    openai: openai.status === "fulfilled" ? openai.value : "unknown",
    claude: claude.status === "fulfilled" ? claude.value : "unknown",
    gemini: gemini.status === "fulfilled" ? gemini.value : "unknown",
  };

  cached = { data, fetchedAt: Date.now() };
  return data;
}

async function fetchStatuspageIndicator(url: string): Promise<StatusLevel> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return "unknown";
    const json = (await res.json()) as { status?: { indicator?: string } };
    const indicator = json?.status?.indicator;
    if (
      indicator === "none" ||
      indicator === "minor" ||
      indicator === "major" ||
      indicator === "critical"
    ) {
      return indicator;
    }
    return "unknown";
  } catch {
    return "unknown";
  } finally {
    clearTimeout(timer);
  }
}

interface GoogleIncident {
  service_name: string;
  end?: string;
  severity?: string;
}

async function fetchGeminiStatus(): Promise<StatusLevel> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch("https://www.google.com/appsstatus/dashboard/incidents.json", {
      signal: controller.signal,
    });
    if (!res.ok) return "unknown";
    const incidents = (await res.json()) as GoogleIncident[];
    const activeGemini = incidents.filter((inc) => inc.service_name === "Gemini" && !inc.end);
    if (activeGemini.length === 0) return "none";
    const hasHigh = activeGemini.some((inc) => inc.severity === "high");
    return hasHigh ? "major" : "minor";
  } catch {
    return "unknown";
  } finally {
    clearTimeout(timer);
  }
}
