// Deno Edge Function - API 转发网关
// 功能：验证 API Key → 检查配额 → 转发请求 → 记录日志

import { serve } from "https://deno.land/x/supabase@v1.0.0/functions/index.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// CORS 头
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

interface ApiLog {
  user_id: string;
  api_key_id: string;
  api_product_id: string;
  endpoint: string;
  method: string;
  request_headers: Record<string, string>;
  request_body: unknown;
  response_status: number;
  response_headers: Record<string, string>;
  response_body: unknown;
  tokens_input: number;
  tokens_output: number;
  tokens_total: number;
  cost: number;
  latency_ms: number;
  ip_address: string;
  user_agent: string;
  error_message?: string;
}

serve(async (req: Request) => {
  // 处理 CORS 预检请求
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startTime = Date.now();
  let apiLog: Partial<ApiLog> = {
    endpoint: new URL(req.url).pathname,
    method: req.method,
    request_headers: Object.fromEntries(req.headers.entries()),
    request_body: null,
    ip_address: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "",
    user_agent: req.headers.get("user-agent") || "",
  };

  try {
    // 1. 验证 API Key
    const apiKey = req.headers.get("x-api-key") || req.headers.get("authorization")?.replace("Bearer ", "");

    if (!apiKey) {
      throw new Error("缺少 API Key");
    }

    // 计算 API Key 的哈希值
    const keyHash = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(apiKey)
    ).then((hash) =>
      Array.from(new Uint8Array(hash))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
    );

    // 创建 Supabase 客户端
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""  // 使用 service role key 绕过 RLS
    );

    // 查询 API Key
    const { data: apiKeyData, error: keyError } = await supabaseClient
      .from("api_keys")
      .select("*, user_id")
      .eq("key_hash", keyHash)
      .eq("is_active", true)
      .single();

    if (keyError || !apiKeyData) {
      throw new Error("无效的 API Key");
    }

    // 检查是否过期
    if (apiKeyData.expires_at && new Date(apiKeyData.expires_at) < new Date()) {
      throw new Error("API Key 已过期");
    }

    // 检查配额
    if (apiKeyData.quota_used >= apiKeyData.quota_total) {
      throw new Error("API Key 配额已用完");
    }

    apiLog.api_key_id = apiKeyData.id;
    apiLog.user_id = apiKeyData.user_id;

    // 2. 解析请求路径，确定目标 API
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    
    // 路径格式：/api-gateway/{api_slug}/{...rest}
    if (pathParts.length < 2) {
      throw new Error("无效的 API 路径");
    }

    const apiSlug = pathParts[1];
    const restPath = pathParts.slice(2).join("/");

    // 查询 API 产品
    const { data: apiProduct, error: apiError } = await supabaseClient
      .from("api_products")
      .select("*")
      .eq("slug", apiSlug)
      .eq("is_active", true)
      .single();

    if (apiError || !apiProduct) {
      throw new Error(`API 产品不存在: ${apiSlug}`);
    }

    apiLog.api_product_id = apiProduct.id;

    // 3. 检查用户订阅（如果需要付费）
    if (apiProduct.is_premium) {
      const { data: subscription, error: subError } = await supabaseClient
        .from("subscriptions")
        .select("*, plans(*)")
        .eq("user_id", apiKeyData.user_id)
        .eq("status", "active")
        .gte("current_period_end", new Date().toISOString())
        .single();

      if (subError || !subscription) {
        throw new Error("需要有效订阅才能使用此 API");
      }

      // 检查套餐是否允许此 API
      if (subscription.plans.allowed_apis.length > 0 && !subscription.plans.allowed_apis.includes(apiSlug)) {
        throw new Error("当前套餐不允许使用此 API");
      }

      apiLog.user_id = apiKeyData.user_id;
    }

    // 4. 构造目标 URL
    const targetUrl = `${apiProduct.endpoint_url}${restPath ? `/${restPath}` : ""}${url.search}`;

    // 5. 读取请求体
    let requestBody = null;
    if (req.method !== "GET" && req.method !== "HEAD") {
      requestBody = await req.json().catch(() => null);
      apiLog.request_body = requestBody;
    }

    // 6. 转发请求到目标 API
    const targetResponse = await fetch(targetUrl, {
      method: req.method,
      headers: {
        "Content-Type": req.headers.get("content-type") || "application/json",
        "Authorization": `Bearer ${Deno.env.get("PROVIDER_API_KEY")}`,  // 供应商 API Key
        ...(req.headers.get("user-agent") && { "User-Agent": req.headers.get("user-agent")! }),
      },
      body: requestBody ? JSON.stringify(requestBody) : undefined,
    });

    // 7. 读取响应
    const responseData = await targetResponse.json().catch(() => null);
    const latencyMs = Date.now() - startTime;

    apiLog.response_status = targetResponse.status;
    apiLog.response_headers = Object.fromEntries(targetResponse.headers.entries());
    apiLog.response_body = responseData;
    apiLog.latency_ms = latencyMs;

    // 8. 计算 Token 使用量（如果是 AI API）
    let tokensInput = 0;
    let tokensOutput = 0;
    let cost = 0;

    if (responseData && typeof responseData === "object") {
      // OpenAI 格式
      if (responseData.usage) {
        tokensInput = responseData.usage.prompt_tokens || 0;
        tokensOutput = responseData.usage.completion_tokens || 0;
      }
      // 通义千问格式
      if (responseData.input_tokens) {
        tokensInput = responseData.input_tokens || 0;
        tokensOutput = responseData.output_tokens || 0;
      }
    }

    const tokensTotal = tokensInput + tokensOutput;
    cost = (tokensInput * apiProduct.price_input + tokensOutput * apiProduct.price_output) / 1000;  // 转换为元

    apiLog.tokens_input = tokensInput;
    apiLog.tokens_output = tokensOutput;
    apiLog.tokens_total = tokensTotal;
    apiLog.cost = cost;

    // 9. 更新 API Key 配额
    const { error: updateError } = await supabaseClient
      .from("api_keys")
      .update({
        quota_used: apiKeyData.quota_used + tokensTotal,
        last_used_at: new Date().toISOString(),
      })
      .eq("id", apiKeyData.id);

    if (updateError) {
      console.error("更新 API Key 配额失败:", updateError);
    }

    // 10. 记录 API 调用日志
    const { error: logError } = await supabaseClient
      .from("api_logs")
      .insert(apiLog);

    if (logError) {
      console.error("记录 API 日志失败:", logError);
    }

    // 11. 返回响应
    return new Response(
      JSON.stringify(responseData),
      {
        status: targetResponse.status,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "X-Tokens-Input": tokensInput.toString(),
          "X-Tokens-Output": tokensOutput.toString(),
          "X-Tokens-Total": tokensTotal.toString(),
          "X-Cost": cost.toFixed(6),
        },
      }
    );

  } catch (error) {
    const latencyMs = Date.now() - startTime;
    apiLog.latency_ms = latencyMs;
    apiLog.error_message = error.message;
    apiLog.response_status = 500;

    // 记录错误日志
    if (apiLog.user_id) {
      const supabaseClient = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
      );

      await supabaseClient
        .from("api_logs")
        .insert(apiLog);
    }

    return new Response(
      JSON.stringify({
        error: error.message,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
