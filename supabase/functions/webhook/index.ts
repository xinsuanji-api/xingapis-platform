// Deno Edge Function - Webhook 通知
// 功能：API 调用完成后的回调通知

import { serve } from "https://deno.land/x/supabase@v1.0.0/functions/index.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// CORS 头
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface WebhookRequest {
  api_key_id: string;
  event_type: "api_call.complete" | "api_call.failed" | "quota.warning" | "quota.exceeded";
  payload: Record<string, unknown>;
  retry_count?: number;
}

interface WebhookSubscription {
  id: string;
  user_id: string;
  callback_url: string;
  event_types: string[];
  is_active: boolean;
  secret_token?: string;
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

    const body: WebhookRequest = await req.json();

    // 验证必填字段
    if (!body.api_key_id || !body.event_type || !body.payload) {
      return new Response(
        JSON.stringify({ error: "api_key_id、event_type、payload 为必填项" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 1. 获取 API Key 信息
    const { data: apiKeyData, error: apiKeyError } = await supabaseClient
      .from("api_keys")
      .select("user_id")
      .eq("id", body.api_key_id)
      .single();

    if (apiKeyError || !apiKeyData) {
      return new Response(
        JSON.stringify({ error: `API Key 不存在: ${body.api_key_id}` }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 2. 获取用户的 Webhook 订阅
    const { data: subscriptions, error: subError } = await supabaseClient
      .from("webhook_subscriptions")
      .select("*")
      .eq("user_id", apiKeyData.user_id)
      .eq("is_active", true);

    if (subError) {
      console.error("查询 Webhook 订阅失败:", subError);
      // 不阻止主流程，继续执行
    }

    if (!subscriptions || subscriptions.length === 0) {
      // 用户没有订阅 Webhook，直接返回成功
      return new Response(
        JSON.stringify({
          success: true,
          message: "用户未订阅 Webhook，跳过通知",
          webhooks_sent: 0,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 3. 过滤出订阅了当前事件类型的 Webhook
    const targetSubscriptions = subscriptions.filter((sub: WebhookSubscription) =>
      sub.event_types.includes(body.event_type)
    );

    if (targetSubscriptions.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "没有订阅此事件类型的 Webhook",
          webhooks_sent: 0,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 4. 发送 Webhook 通知（异步）
    const webhookPromises = targetSubscriptions.map((sub) =>
      sendWebhookNotification(sub, body.event_type, body.payload)
    );

    const results = await Promise.allSettled(webhookPromises);

    // 5. 记录 Webhook 发送日志
    const successful = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;

    // 异步记录日志（不阻塞响应）
    logWebhookResults(supabaseClient, targetSubscriptions, body.event_type, results);

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          webhooks_sent: successful,
          webhooks_failed: failed,
          results: results.map((r, i) => ({
            subscription_id: targetSubscriptions[i].id,
            success: r.status === "fulfilled",
            error: r.status === "rejected" ? (r as PromiseRejectedResult).reason.message : null,
          })),
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

// 辅助函数：发送 Webhook 通知
async function sendWebhookNotification(
  subscription: WebhookSubscription,
  eventType: string,
  payload: Record<string, unknown>
): Promise<Response> {
  const webhookPayload = {
    event_type: eventType,
    created_at: new Date().toISOString(),
    data: payload,
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "XingApis-Webhook/1.0",
    "X-Event-Type": eventType,
  };

  // 如果有 secret_token，添加签名 header
  if (subscription.secret_token) {
    const signature = await generateSignature(
      JSON.stringify(webhookPayload),
      subscription.secret_token
    );
    headers["X-Signature"] = signature;
  }

  // 发送 Webhook（带超时）
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);  // 10 秒超时

  try {
    const response = await fetch(subscription.callback_url, {
      method: "POST",
      headers,
      body: JSON.stringify(webhookPayload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// 辅助函数：生成签名（HMAC-SHA256）
async function generateSignature(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(payload);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", cryptoKey, messageData);
  const hashArray = Array.from(new Uint8Array(signature));
  return `sha256=${hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

// 辅助函数：记录 Webhook 发送结果（异步）
async function logWebhookResults(
  supabaseClient: ReturnType<typeof createClient>,
  subscriptions: WebhookSubscription[],
  eventType: string,
  results: PromiseSettledResult<Response>[]
): Promise<void> {
  const logs = results.map((result, i) => ({
    subscription_id: subscriptions[i].id,
    event_type: eventType,
    callback_url: subscriptions[i].callback_url,
    success: result.status === "fulfilled",
    status_code: result.status === "fulfilled" ? (result as PromiseFulfilledResult<Response>).value.status : null,
    error_message: result.status === "rejected" ? (result as PromiseRejectedResult).reason.message : null,
    created_at: new Date().toISOString(),
  }));

  supabaseClient
    .from("webhook_logs")
    .insert(logs)
    .then(({ error }) => {
      if (error) console.error("记录 Webhook 日志失败:", error);
    });
}
