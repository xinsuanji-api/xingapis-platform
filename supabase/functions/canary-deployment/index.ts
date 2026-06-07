// Deno Edge Function - 灰度发布
// 功能：按比例路由到不同 API 版本

import { serve } from "https://deno.land/x/supabase@v1.0.0/functions/index.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface CanaryRequest {
  api_slug: string;
  user_id: string;
  version_a: string;  // 例如："v1.0"
  version_b: string;  // 例如："v1.1"
  canary_percentage: number;  // 0-100，灰度百分比
}

interface CanaryResponse {
  selected_version: string;
  is_canary: boolean;
  routing_reason: string;  // "canary" | "stable" | "forced"
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

    const body: CanaryRequest = await req.json();

    if (!body.api_slug || !body.user_id || !body.version_a || !body.version_b) {
      return new Response(
        JSON.stringify({ error: "api_slug, user_id, version_a, version_b 为必填项" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. 检查用户是否被强制路由到某个版本
    const { data: forcedRoute, error: forcedError } = await supabaseClient
      .from("canary_forced_users")
      .select("forced_version")
      .eq("user_id", body.user_id)
      .eq("api_slug", body.api_slug)
      .single();

    if (!forcedError && forcedRoute) {
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            selected_version: forcedRoute.forced_version,
            is_canary: forcedRoute.forced_version === body.version_b,
            routing_reason: "forced",
          } as CanaryResponse,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. 基于用户 ID 生成稳定的哈希值（确保同一用户总是路由到相同版本）
    const hash = await generateStableHash(body.user_id + body.api_slug);
    const hashPercentage = hash % 100;  // 0-99 的范围

    // 3. 根据灰度百分比决定路由
    const canaryPercentage = body.canary_percentage || 10;  // 默认 10%
    const isCanary = hashPercentage < canaryPercentage;

    const selectedVersion = isCanary ? body.version_b : body.version_a;
    const routingReason = isCanary ? "canary" : "stable";

    // 4. 记录灰度路由日志（异步）
    logCanaryRouting(supabaseClient, body.api_slug, body.user_id, selectedVersion, routingReason);

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          selected_version: selectedVersion,
          is_canary: isCanary,
          routing_reason: routingReason,
          canary_percentage: canaryPercentage,
        } as CanaryResponse,
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

// 辅助函数：生成稳定哈希（同一输入总是产生同一输出）
async function generateStableHash(input: string): Promise<number> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  
  // 取前 4 个字节转换为 32 位整数
  const intHash = (hashArray[0] << 24) | (hashArray[1] << 16) | (hashArray[2] << 8) | hashArray[3];
  return Math.abs(intHash);
}

// 辅助函数：记录灰度路由日志（异步）
async function logCanaryRouting(
  supabaseClient: ReturnType<typeof createClient>,
  apiSlug: string,
  userId: string,
  selectedVersion: string,
  routingReason: string
): Promise<void> {
  supabaseClient
    .from("canary_logs")
    .insert({
      api_slug: apiSlug,
      user_id: userId,
      selected_version: selectedVersion,
      routing_reason: routingReason,
      created_at: new Date().toISOString(),
    })
    .then(({ error }) => {
      if (error) console.error("记录灰度路由日志失败:", error);
    });
}
