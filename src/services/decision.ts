import { type Config, getConfig } from "../config";
import { type ChatMessage, LLMClient } from "../services/llm-client";
import { createMaskingContext, type MaskingContext, maskMessages } from "../services/masking";
import { getPIIDetector, type PIIDetectionResult } from "../services/pii-detector";

/**
 * Routing decision result for route mode
 */
export interface RouteDecision {
  mode: "route";
  provider: "upstream" | "local";
  reason: string;
  piiResult: PIIDetectionResult;
}

/**
 * Masking decision result for mask mode
 */
export interface MaskDecision {
  mode: "mask";
  provider: "upstream";
  reason: string;
  piiResult: PIIDetectionResult;
  maskedMessages: ChatMessage[];
  maskingContext: MaskingContext;
}

export type RoutingDecision = RouteDecision | MaskDecision;

/**
 * Router that decides how to handle requests based on PII detection
 * Supports two modes: route (to local LLM) or mask (anonymize for upstream)
 */
export class Router {
  private upstreamClient: LLMClient;
  private localClient: LLMClient | null;
  private config: Config;

  constructor() {
    this.config = getConfig();

    this.upstreamClient = new LLMClient(this.config.providers.upstream, "upstream");
    this.localClient = this.config.providers.local
      ? new LLMClient(this.config.providers.local, "local", this.config.providers.local.model)
      : null;
  }

  /**
   * Returns the current mode
   */
  getMode(): "route" | "mask" {
    return this.config.mode;
  }

  /**
   * Decides how to handle messages based on mode and PII detection
   */
  async decide(messages: ChatMessage[]): Promise<RoutingDecision> {
    const detector = getPIIDetector();
    const piiResult = await detector.analyzeMessages(messages);

    if (this.config.mode === "mask") {
      return await this.decideMask(messages, piiResult);
    }

    return this.decideRoute(piiResult);
  }

  /**
   * Route mode: decides which provider to use
   */
  private decideRoute(piiResult: PIIDetectionResult): RouteDecision {
    const routing = this.config.routing;
    if (!routing) {
      throw new Error("Route mode requires routing configuration");
    }

    // Route based on PII detection
    if (piiResult.hasPII) {
      const entityTypes = [...new Set(piiResult.newEntities.map((e) => e.entity_type))];
      return {
        mode: "route",
        provider: routing.on_pii_detected,
        reason: `PII detected: ${entityTypes.join(", ")}`,
        piiResult,
      };
    }

    // No PII detected, use default provider
    return {
      mode: "route",
      provider: routing.default,
      reason: "No PII detected",
      piiResult,
    };
  }

  private async decideMask(
    messages: ChatMessage[],
    piiResult: PIIDetectionResult,
  ): Promise<MaskDecision> {
    if (!piiResult.hasPII) {
      return {
        mode: "mask",
        provider: "upstream",
        reason: "No PII detected",
        piiResult,
        maskedMessages: messages,
        maskingContext: createMaskingContext(),
      };
    }

    const detector = getPIIDetector();
    const fullScan = await detector.analyzeAllMessages(messages, {
      language: piiResult.language,
      usedFallback: piiResult.languageFallback,
    });

    const { masked, context } = maskMessages(messages, fullScan.entitiesByMessage);

    const entityTypes = [...new Set(piiResult.newEntities.map((e) => e.entity_type))];

    return {
      mode: "mask",
      provider: "upstream",
      reason: `PII masked: ${entityTypes.join(", ")}`,
      piiResult,
      maskedMessages: masked,
      maskingContext: context,
    };
  }

  getClient(provider: "upstream" | "local"): LLMClient {
    if (provider === "local") {
      if (!this.localClient) {
        throw new Error("Local provider not configured");
      }
      return this.localClient;
    }
    return this.upstreamClient;
  }

  /**
   * Gets masking config
   */
  getMaskingConfig() {
    return this.config.masking;
  }

  /**
   * Checks health of services (Presidio required, local LLM only in route mode)
   */
  async healthCheck(): Promise<{
    local: boolean;
    presidio: boolean;
  }> {
    const detector = getPIIDetector();

    const [presidioHealth, localHealth] = await Promise.all([
      detector.healthCheck(),
      this.localClient?.healthCheck() ?? Promise.resolve(true),
    ]);

    return {
      local: localHealth,
      presidio: presidioHealth,
    };
  }

  getProvidersInfo() {
    return {
      mode: this.config.mode,
      upstream: this.upstreamClient.getInfo(),
      local: this.localClient?.getInfo() ?? null,
    };
  }
}

// Singleton instance
let routerInstance: Router | null = null;

export function getRouter(): Router {
  if (!routerInstance) {
    routerInstance = new Router();
  }
  return routerInstance;
}
