// Deno Edge Function - API 中转网关 v3.0
// 星算纪平台核心：验证用户 Key → 查余额 → 转发上游 → 扣费 → 记录日志

import { serve } from "https://deno.land/x/supabase@v1.0.0/functions/index.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

interface LogRecord {
  api_key_id: string;
  user_id: string;
  model_id: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost: number;
  status: string;
  error_message?: string;
}

// 上游 API 配置（从环境变量读取 Key）
const PROVIDERS: Record<string, { baseUrl: string; apiFormat: string }> = {
  deepseek: {
    baseUrl: "https://api.deepseek.com",
    apiFormat: "openai",
  },
  qwen: {
    baseUrl: "https://dashscope.aliyuncs.com/api/v1",
    apiFormat: "openai",
  },
  openai: {
    baseUrl: "https://api.openai.com/v1",
    apiFormat: "openai",
  },
  anthropic: {
    baseUrl: "https://api.anthropic.com/v1",
    apiFormat: "anthropic",
  },
  google: {
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    apiFormat: "google",
  },
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startTime = Date.now();
  let log: Partial<LogRecord> = {
    model_id: "",
    input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
    cost: 0,
    status: "error",
  };
  let supabaseClient: ReturnType<typeof createClient> | null = null;

  try {
    // ========== 步骤1: 验证用户 API Key ==========
    const authHeader = req.headers.get("x-api-key") || req.headers.get("authorization")?.replace("Bearer ", "");
    if (!authHeader) throw new Error("缺少 API Key，请在请求头设置 x-api-key 或 Authorization: Bearer <key>");

    // 创建 Supabase 客户端
    supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // 查找用户的 API Key（精确匹配，不用 hash）
    const { data: apiKeyData, error: keyError } = await supabaseClient
      .from("api_keys")
      .select("id, user_id, name, is_active")
      .eq("api_key", authHeader)
      .eq("is_active", true)
      .single();

    if (keyError || !apiKeyData) throw new Error("无效的 API Key");
    log.api_key_id = apiKeyData.id;
    log.user_id = apiKeyData.user_id;

    // ========== 步骤2: 检查用户余额 ==========
    const { data: userData, error: userError } = await supabaseClient
      .from("users")
      .select("balance")
      .eq("id", apiKeyData.user_id)
      .single();

    if (userError || !userData) throw new Error("用户不存在");
    if (Number(userData.balance) <= 0) throw new Error("账户余额不足，请充值");

    // ========== 步骤3: 解析请求中的模型 ==========
    let requestBody: Record<string, unknown> | null = null;
    if (req.method !== "GET" && req.method !== "HEAD") {
      try { requestBody = await req.json(); } catch { requestBody = null; }
    }

    const modelId = requestBody?.model as string || "";
    if (!modelId) throw new Error("请求体缺少 model 字段");

    log.model_id = modelId;

    // ========== 步骤4: 查询模型价格和上游配置 ==========
    const { data: modelData, error: modelError } = await supabaseClient
      .from("models")
      .select("provider, input_price_per_1k, output_price_per_1k, status")
      .eq("model_id", modelId)
      .eq("status", "active")
      .single();

    if (modelError || !modelData) throw new Error(`模型 ${modelId} 不存在或未激活`);

    const provider = modelData.provider;
    const providerConfig = PROVIDERS[provider];
    if (!providerConfig) throw new Error(`不支持的提供商: ${provider}`);

    // ========== 步骤5: 获取上游 API Key ==========
    const upstreamApiKey = Deno.env.get(`PROVIDER_KEY_${provider.toUpperCase()}`);
    if (!upstreamApiKey) throw new Error(`平台未配置 ${provider} 的 API Key（请在 Supabase Secrets 中设置 PROVIDER_KEY_${provider.toUpperCase()}）`);

    // ========== 步骤6: 构造上游请求 ==========
    const url = new URL(req.url);
    // 路径格式：/api-gateway/chat/completions → 转发到上游 /chat/completions
    const pathParts = url.pathname.split("/").filter(Boolean);
    const upstreamPath = pathParts.slice(1).join("/"); // 去掉第一个路径段（函数名）
    const upstreamUrl = `${providerConfig.baseUrl}/${upstreamPath}${url.search}`;

    // ========== 步骤7: 转发请求到上游 ==========
    const upstreamHeaders: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // 不同提供商的认证方式
    if (provider === "anthropic") {
      upstreamHeaders["x-api-key"] = upstreamApiKey;
      upstreamHeaders["anthropic-version"] = "2023-06-01";
    } else {
      upstreamHeaders["Authorization"] = `Bearer ${upstreamApiKey}`;
    }

    const upstreamResponse = await fetch(upstreamUrl, {
      method: req.method,
      headers: upstreamHeaders,
      body: requestBody ? JSON.stringify(requestBody) : undefined,
    });

    // ========== 步骤8: 解析响应，计算用量 ==========
    const responseText = await upstreamResponse.text();
    let responseData: unknown = responseText;
    try { responseData = JSON.parse(responseText); } catch {}

    let tokensInput = 0;
    let tokensOutput = 0;

    if (upstreamResponse.ok && responseData && typeof responseData === "object") {
      const data = responseData as Record<string, unknown>;
      // OpenAI 格式
      if (data.usage && typeof data.usage === "object") {
        const usage = data.usage as Record<string, number>;
        tokensInput = usage.prompt_tokens || usage.input_tokens || 0;
        tokensOutput = usage.completion_tokens || usage.output_tokens || 0;
      }
    }

    const tokensTotal = tokensInput + tokensOutput;
    // 价格单位：input_price_per_1k 是 元/1K tokens
    const cost = (tokensInput * Number(modelData.input_price_per_1k) + tokensOutput * Number(modelData.output_price_per_1k)) / 1000;

    log.input_tokens = tokensInput;
    log.output_tokens = tokensOutput;
    log.total_tokens = tokensTotal;
    log.cost = cost;
    log.status = upstreamResponse.ok ? "success" : "error";

    // ========== 步骤9: 扣费 ==========
    if (upstreamResponse.ok && cost > 0) {
      const newBalance = Number(userData.balance) - cost;
      if (newBalance < 0) throw new Error("余额不足，无法完成请求");

      await supabaseClient
        .from("users")
        .update({ balance: newBalance })
        .eq("id", apiKeyData.user_id);
    }

    // ========== 步骤10: 记录日志 ==========
    await supabaseClient.from("request_logs").insert({
      api_key_id: apiKeyData.id,
      user_id: apiKeyData.user_id,
      model_id: modelId,
      input_tokens: tokensInput,
      output_tokens: tokensOutput,
      total_tokens: tokensTotal,
      cost: cost,
      status: log.status,
      error_message: upstreamResponse.ok ? null : responseText.substring(0, 500),
    });

    // ========== 步骤11: 返回响应 ==========
    return new Response(
      typeof responseData === "string" ? responseData : JSON.stringify(responseData),
      {
        status: upstreamResponse.status,
        headers: {
          ...corsHeaders,
          "Content-Type": upstreamResponse.headers.get("content-type") || "application/json",
          "X-Tokens-Input": String(tokensInput),
          "X-Tokens-Output": String(tokensOutput),
          "X-Cost": cost.toFixed(6),
          "X-Balance-Remaining": String(Number(userData.balance) - cost),
        },
      }
    );

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    log.status = "error";
    log.error_message = errMsg;

    // 记录错误日志
    if (supabaseClient && log.api_key_id) {
      await supabaseClient.from("request_logs").insert(log);
    }

    const status = errMsg.includes("缺少") || errMsg.includes("无效") ? 401
      : errMsg.includes("余额") ? 402
      : errMsg.includes("不存在") ? 404
      : 500;

    return new Response(
      JSON.stringify({
        error: { message: errMsg, type: "gateway_error", code: status },
        timestamp: new Date().toISOString(),
      }),
      {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
