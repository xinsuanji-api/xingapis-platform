// Deno Edge Function - 速率限制
// 功能：防止 API 滥用（按套餐限制 QPM/QPS）

import { serve } from "https://deno.land/x/supabase@v1.0.0/functions/index.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// CORS 头
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface RateLimitRequest {
  api_key: string;
  endpoint: string;  // 例如："chat", "embeddings"
  limit_type?: "qpm" | "qps";  // 每分钟查询数 / 每秒查询数
}

interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  reset_at: string;  // ISO 时间戳
  retry_after_seconds?: number;
}

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

    const body: RateLimitRequest = await req.json();

    // 验证必填字段
    if (!body.api_key || !body.endpoint) {
      return new Response(
        JSON.stringify({ error: "api_key 和 endpoint 为必填项" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 1. 验证 API Key 并获取用户套餐
    const { data: apiKeyData, error: apiKeyError } = await supabaseClient
      .from("api_keys")
      .select(`
        id,
        user_id,
        is_active,
        users!inner(
          id,
          subscription_tier,
          subscriptions!inner(
            plan:plans!inner(
              rate_limit_qpm,
              rate_limit_qps
            )
          )
        )
      `)
      .eq("key_hash", await hashApiKey(body.api_key))
      .eq("is_active", true)
      .single();

    if (apiKeyError || !apiKeyData) {
      return new Response(
        JSON.stringify({ error: "API Key 无效或已停用" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 2. 获取速率限制配置
    const user = apiKeyData.users;
    const plan = user.subscriptions[0].plan;
    const limitType = body.limit_type || "qpm";
    const limit = limitType === "qps" ? plan.rate_limit_qps : plan.rate_limit_qpm;

    // 3. 检查当前用量（使用滑动窗口）
    const windowSeconds = limitType === "qps" ? 1 : 60;  // QPS=1秒窗口，QPM=60秒窗口
    const windowStart = new Date();
    windowStart.setSeconds(windowStart.getSeconds() - windowSeconds);

    const { count: requestCount, error: countError } = await supabaseClient
      .from("api_usage_logs")
      .select("*", { count: "exact", head: true })
      .eq("api_key_id", apiKeyData.id)
      .eq("endpoint", body.endpoint)
      .gte("created_at", windowStart.toISOString());

    if (countError) {
      console.error("查询用量失败:", countError);
      // 继续执行，不阻止请求
    }

    const currentCount = requestCount || 0;
    const remaining = Math.max(0, limit - currentCount);
    const resetAt = new Date();
    resetAt.setSeconds(resetAt.getSeconds() + windowSeconds);

    // 4. 判断是否允许请求
    if (currentCount >= limit) {
      // 已超过限制
      const retryAfterSeconds = windowSeconds;  // 简化的重试时间

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            allowed: false,
            limit,
            remaining: 0,
            reset_at: resetAt.toISOString(),
            retry_after_seconds: retryAfterSeconds,
            message: `速率限制已达到（${limit}/${limitType}）。请稍后重试。`,
          },
        } as RateLimitResult),
        {
          status: 200,  // 返回 200，但 allowed=false
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "X-RateLimit-Limit": limit.toString(),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": Math.floor(resetAt.getTime() / 1000).toString(),
            "Retry-After": retryAfterSeconds.toString(),
          },
        }
      );
    }

    // 5. 允许请求，记录用量（异步）
    logUsage(supabaseClient, apiKeyData.id, body.endpoint, windowStart);

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          allowed: true,
          limit,
          remaining,
          reset_at: resetAt.toISOString(),
          message: "请求允许",
        },
      } as RateLimitResult),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "X-RateLimit-Limit": limit.toString(),
          "X-RateLimit-Remaining": remaining.toString(),
          "X-RateLimit-Reset": Math.floor(resetAt.getTime() / 1000).toString(),
        },
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

// 辅助函数：哈希 API Key（SHA-256）
async function hashApiKey(apiKey: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(apiKey);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// 辅助函数：记录用量（异步，不阻塞响应）
async function logUsage(
  supabaseClient: ReturnType<typeof createClient>,
  apiKeyId: string,
  endpoint: string,
  windowStart: Date
): Promise<void> {
  supabaseClient
    .from("api_usage_logs")
    .insert({
      api_key_id: apiKeyId,
      endpoint,
      created_at: new Date().toISOString(),
    })
    .then(({ error }) => {
      if (error) console.error("记录用量失败:", error);
    });

  // 可选：清理旧日志（保留最近 24 小时）
  const cleanupThreshold = new Date();
  cleanupThreshold.setHours(cleanupThreshold.getHours() - 24);

  supabaseClient
    .from("api_usage_logs")
    .delete()
    .lt("created_at", cleanupThreshold.toISOString())
    .then(({ error }) => {
      if (error) console.error("清理旧日志失败:", error);
    });
}
