// Deno Edge Function - 缓存机制
// 功能：缓存相同的 API 请求，节省成本

import { serve } from "https://deno.land/x/supabase@v1.0.0/functions/index.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// CORS 头
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface CacheRequest {
  api_slug: string;
  request_body: Record<string, unknown>;
  ttl_seconds?: number;  // 缓存生存时间（秒）
}

interface CacheResult {
  hit: boolean;
  cached_response?: unknown;
  cache_key: string;
  cached_at?: string;
}

// 内存缓存（Deno Deploy 实例内共享）
const memoryCache = new Map<string, { data: unknown; expires_at: number }>();

serve(async (req: Request) => {
  // 处理 CORS 预检请求
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 创建 Supabase 客户端
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // 只接受 POST 请求
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "只支持 POST 请求" }),
        {
          status: 405,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const body: CacheRequest = await req.json();

    // 验证必填字段
    if (!body.api_slug || !body.request_body) {
      return new Response(
        JSON.stringify({ error: "api_slug 和 request_body 为必填项" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 生成缓存键（基于 API slug + 请求体的哈希）
    const cacheKey = await generateCacheKey(body.api_slug, body.request_body);

    // 1. 先检查内存缓存（最快）
    const memoryCached = checkMemoryCache(cacheKey);
    if (memoryCached) {
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            hit: true,
            cached: true,
            source: "memory",
            cached_response: memoryCached.data,
            cache_key: cacheKey,
            cached_at: new Date(memoryCached.expires_at - 300000).toISOString(),  // 估算缓存时间
          },
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 2. 检查 Redis 缓存（如果有）
    // const redisCached = await checkRedisCache(cacheKey);
    // if (redisCached) { return ... }

    // 3. 检查数据库缓存（最慢但持久化）
    const { data: dbCached, error: dbError } = await supabaseClient
      .from("api_cache")
      .select("response_body, cached_at, expires_at")
      .eq("cache_key", cacheKey)
      .gte("expires_at", new Date().toISOString())
      .single();

    if (!dbError && dbCached) {
      // 命中数据库缓存，同时更新内存缓存
      setMemoryCache(cacheKey, dbCached.response_body, 300);  // 内存缓存 5 分钟

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            hit: true,
            cached: true,
            source: "database",
            cached_response: dbCached.response_body,
            cache_key: cacheKey,
            cached_at: dbCached.cached_at,
            expires_at: dbCached.expires_at,
          },
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 4. 未命中缓存
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          hit: false,
          cached: false,
          cache_key: cacheKey,
          message: "未命中缓存，需要调用 API",
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

// 辅助函数：生成缓存键
async function generateCacheKey(
  apiSlug: string,
  requestBody: Record<string, unknown>
): Promise<string> {
  // 标准化请求体（排序 keys，移除时间戳等变量）
  const normalizedBody = normalizeRequestBody(requestBody);

  // 计算哈希
  const encoder = new TextEncoder();
  const data = encoder.encode(`${apiSlug}:${JSON.stringify(normalizedBody)}`);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

  return `cache:${apiSlug}:${hashHex}`;
}

// 辅助函数：标准化请求体（用于生成一致的缓存键）
function normalizeRequestBody(body: Record<string, unknown>): Record<string, unknown> {
  // 移除不支持缓存的字段（如时间戳、随机种子等）
  const normalized = { ...body };

  // 示例：移除 temperature（温度参数影响输出，不应缓存）
  // delete normalized.temperature;

  // 示例：四舍五入 max_tokens（避免轻微差异导致缓存未命中）
  // if (normalized.max_tokens) normalized.max_tokens = Math.round(normalized.max_tokens / 10) * 10;

  // 排序 keys（确保 JSON 序列化一致）
  return Object.keys(normalized)
    .sort()
    .reduce((acc, key) => {
      acc[key] = normalized[key];
      return acc;
    }, {} as Record<string, unknown>);
}

// 辅助函数：检查内存缓存
function checkMemoryCache(cacheKey: string): { data: unknown; expires_at: number } | null {
  const cached = memoryCache.get(cacheKey);
  if (!cached) return null;

  // 检查是否过期
  if (Date.now() > cached.expires_at) {
    memoryCache.delete(cacheKey);
    return null;
  }

  return cached;
}

// 辅助函数：设置内存缓存
function setMemoryCache(cacheKey: string, data: unknown, ttlSeconds: number): void {
  const expiresAt = Date.now() + ttlSeconds * 1000;
  memoryCache.set(cacheKey, { data, expires_at: expiresAt });

  // 可选：限制内存缓存大小（LRU 策略）
  if (memoryCache.size > 1000) {
    const firstKey = memoryCache.keys().next().value;
    memoryCache.delete(firstKey);
  }
}

// 辅助函数：存储缓存（在 API 响应后调用）
export async function storeCache(
  supabaseClient: ReturnType<typeof createClient>,
  cacheKey: string,
  requestBody: Record<string, unknown>,
  responseBody: unknown,
  apiSlug: string,
  ttlSeconds: number = 3600  // 默认 1 小时
): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

  // 1. 存储到内存缓存
  setMemoryCache(cacheKey, responseBody, ttlSeconds);

  // 2. 存储到数据库（异步，不阻塞响应）
  supabaseClient
    .from("api_cache")
    .upsert({
      cache_key: cacheKey,
      api_slug: apiSlug,
      request_body: requestBody,
      response_body: responseBody,
      cached_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    })
    .then(({ error }) => {
      if (error) console.error("存储缓存失败:", error);
    });

  return Promise.resolve();
}
