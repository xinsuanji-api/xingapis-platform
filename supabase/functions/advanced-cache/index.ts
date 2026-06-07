// Deno Edge Function - 高级缓存策略
// 功能：分层缓存（内存 → Redis → 数据库）

import { serve } from "https://deno.land/x/supabase@v1.0.0/functions/index.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface CacheStrategyRequest {
  api_slug: string;
  request_body: Record<string, unknown>;
  cache_strategy?: "memory" | "redis" | "database" | "auto";
  ttl_seconds?: number;
}

interface CacheStrategyResult {
  strategy_used: string;
  cache_hit: boolean;
  cached_response?: unknown;
  cache_key: string;
  saved_cost: number;  // 节省的成本（美元）
}

// 内存缓存（Deno Deploy 实例内共享）
const memoryCache = new Map<string, { data: unknown; expires_at: number; cost: number }>();

// Redis 客户端（可选）
let redisClient: any = null;
try {
  // 如果配置了 Redis，初始化客户端
  if (Deno.env.get("REDIS_URL")) {
    // 简化：实际应该使用 ioredis 或 redis 包
    // redisClient = new Redis(Deno.env.get("REDIS_URL"));
  }
} catch (error) {
  console.warn("Redis 初始化失败，将仅使用内存和数据库缓存:", error);
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "只支持 POST 请求" }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body: CacheStrategyRequest = await req.json();

    if (!body.api_slug || !body.request_body) {
      return new Response(
        JSON.stringify({ error: "api_slug 和 request_body 为必填项" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 生成缓存键
    const cacheKey = await generateCacheKey(body.api_slug, body.request_body);

    // 确定缓存策略
    const strategy = body.cache_strategy || "auto";
    const finalStrategy = strategy === "auto" ? determineBestStrategy(cacheKey) : strategy;

    // 根据策略检查缓存
    let cachedResponse: unknown = null;
    let cacheHit = false;
    let savedCost = 0;

    switch (finalStrategy) {
      case "memory":
        const memResult = checkMemoryCache(cacheKey);
        if (memResult) {
          cachedResponse = memResult.data;
          savedCost = memResult.cost;
          cacheHit = true;
        }
        break;

      case "redis":
        if (redisClient) {
          const redisResult = await checkRedisCache(cacheKey);
          if (redisResult) {
            cachedResponse = redisResult.data;
            savedCost = redisResult.cost;
            cacheHit = true;
            // 同时更新内存缓存
            setMemoryCache(cacheKey, cachedResponse, 300, savedCost);
          }
        }
        break;

      case "database":
        const dbResult = await checkDatabaseCache(supabaseClient, cacheKey);
        if (dbResult) {
          cachedResponse = dbResult.response_body;
          savedCost = calculateCost(body.api_slug, dbResult.response_body);
          cacheHit = true;
          // 同时更新内存和 Redis 缓存
          setMemoryCache(cacheKey, cachedResponse, 300, savedCost);
          if (redisClient) {
            await setRedisCache(cacheKey, cachedResponse, body.ttl_seconds || 3600, savedCost);
          }
        }
        break;
    }

    // 如果缓存未命中，返回需要调用 API 的指示
    if (!cacheHit) {
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            strategy_used: finalStrategy,
            cache_hit: false,
            cache_key: cacheKey,
            message: "缓存未命中，需要调用 API",
            estimated_cost: estimateApiCost(body.api_slug, body.request_body),
          } as CacheStrategyResult,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 缓存命中，返回缓存的响应
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          strategy_used: finalStrategy,
          cache_hit: true,
          cached_response: cachedResponse,
          cache_key: cacheKey,
          saved_cost: savedCost,
        } as CacheStrategyResult,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// 辅助函数：生成缓存键
async function generateCacheKey(
  apiSlug: string,
  requestBody: Record<string, unknown>
): Promise<string> {
  const normalizedBody = normalizeRequestBody(requestBody);
  const encoder = new TextEncoder();
  const data = encoder.encode(`${apiSlug}:${JSON.stringify(normalizedBody)}`);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return `cache:${apiSlug}:${hashHex}`;
}

// 辅助函数：标准化请求体
function normalizeRequestBody(body: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...body };
  // 移除不支持缓存的字段
  // delete normalized.temperature;
  return Object.keys(normalized)
    .sort()
    .reduce((acc, key) => {
      acc[key] = normalized[key];
      return acc;
    }, {} as Record<string, unknown>);
}

// 辅助函数：确定最佳缓存策略
function determineBestStrategy(cacheKey: string): string {
  // 检查内存缓存是否存在
  if (memoryCache.has(cacheKey)) {
    return "memory";
  }

  // 检查 Redis 缓存是否存在（简化）
  // if (redisClient && await redisClient.exists(cacheKey)) {
  //   return "redis";
  // }

  // 默认使用数据库缓存（最慢但最可靠）
  return "database";
}

// 辅助函数：检查内存缓存
function checkMemoryCache(cacheKey: string): { data: unknown; cost: number } | null {
  const cached = memoryCache.get(cacheKey);
  if (!cached) return null;

  if (Date.now() > cached.expires_at) {
    memoryCache.delete(cacheKey);
    return null;
  }

  return { data: cached.data, cost: cached.cost };
}

// 辅助函数：检查 Redis 缓存
async function checkRedisCache(cacheKey: string): Promise<{ data: unknown; cost: number } | null> {
  if (!redisClient) return null;

  try {
    const cached = await redisClient.get(cacheKey);
    if (!cached) return null;

    const parsed = JSON.parse(cached);
    return { data: parsed.data, cost: parsed.cost };
  } catch (error) {
    console.error("Redis 缓存检查失败:", error);
    return null;
  }
}

// 辅助函数：检查数据库缓存
async function checkDatabaseCache(
  supabaseClient: ReturnType<typeof createClient>,
  cacheKey: string
): Promise<{ response_body: unknown; expires_at: string } | null> {
  const { data, error } = await supabaseClient
    .from("api_cache")
    .select("response_body, expires_at")
    .eq("cache_key", cacheKey)
    .gte("expires_at", new Date().toISOString())
    .single();

  if (error || !data) {
    return null;
  }

  return data;
}

// 辅助函数：设置内存缓存
function setMemoryCache(
  cacheKey: string,
  data: unknown,
  ttlSeconds: number,
  cost: number
): void {
  const expiresAt = Date.now() + ttlSeconds * 1000;
  memoryCache.set(cacheKey, { data, expires_at: expiresAt, cost });

  // 限制内存缓存大小
  if (memoryCache.size > 1000) {
    const firstKey = memoryCache.keys().next().value;
    memoryCache.delete(firstKey);
  }
}

// 辅助函数：设置 Redis 缓存
async function setRedisCache(
  cacheKey: string,
  data: unknown,
  ttlSeconds: number,
  cost: number
): Promise<void> {
  if (!redisClient) return;

  try {
    await redisClient.setex(cacheKey, ttlSeconds, JSON.stringify({ data, cost }));
  } catch (error) {
    console.error("Redis 缓存设置失败:", error);
  }
}

// 辅助函数：计算 API 成本
function calculateCost(apiSlug: string, responseBody: unknown): number {
  // 简化：根据实际 API 定价计算
  const pricing: Record<string, number> = {
    "qwen-plus": 0.004,  // $0.004 / 1K tokens
    "deepseek-v3": 0.002,
    "ernie-4.0": 0.008,
  };

  const pricePerToken = pricing[apiSlug] || 0.005;
  const tokensUsed = estimateTokens(responseBody);
  return (tokensUsed / 1000) * pricePerToken;
}

// 辅助函数：估算 Token 数
function estimateTokens(responseBody: unknown): number {
  // 简化：假设 1 个中文字符 = 2 个 tokens
  const text = typeof responseBody === "string" ? responseBody : JSON.stringify(responseBody);
  return text.length * 2;
}

// 辅助函数：估算 API 调用成本
function estimateApiCost(apiSlug: string, requestBody: Record<string, unknown>): number {
  const pricing: Record<string, number> = {
    "qwen-plus": 0.004,
    "deepseek-v3": 0.002,
    "ernie-4.0": 0.008,
  };

  const pricePerToken = pricing[apiSlug] || 0.005;
  const estimatedTokens = (requestBody.max_tokens as number) || 1000;
  return (estimatedTokens / 1000) * pricePerToken;
}

// 导出函数：存储缓存（在 API 响应后调用）
export async function storeAdvancedCache(
  supabaseClient: ReturnType<typeof createClient>,
  cacheKey: string,
  requestBody: Record<string, unknown>,
  responseBody: unknown,
  apiSlug: string,
  ttlSeconds: number = 3600,
  strategy: string = "auto"
): Promise<void> {
  const savedCost = calculateCost(apiSlug, responseBody);

  // 1. 存储到内存缓存
  setMemoryCache(cacheKey, responseBody, Math.min(ttlSeconds, 300), savedCost);  // 内存缓存最多 5 分钟

  // 2. 存储到 Redis（如果可用）
  if (redisClient) {
    await setRedisCache(cacheKey, responseBody, ttlSeconds, savedCost);
  }

  // 3. 存储到数据库（异步，不阻塞响应）
  supabaseClient
    .from("api_cache")
    .upsert({
      cache_key: cacheKey,
      api_slug: apiSlug,
      request_body: requestBody,
      response_body: responseBody,
      cached_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
      saved_cost: savedCost,
    })
    .then(({ error }) => {
      if (error) console.error("存储高级缓存失败:", error);
    });

  return Promise.resolve();
}
