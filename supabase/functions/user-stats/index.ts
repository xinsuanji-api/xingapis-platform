// Deno Edge Function - 用户统计仪表盘
// 功能：获取用户的 API 调用统计、配额使用情况

import { serve } from "https://deno.land/x/supabase@v1.0.0/functions/index.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// CORS 头
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

serve(async (req: Request) => {
  // 处理 CORS 预检请求
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 创建 Supabase 客户端
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      }
    );

    // 获取当前用户
    const {
      data: { user },
    } = await supabaseClient.auth.getUser();

    if (!user) {
      return new Response(
        JSON.stringify({ error: "未授权，请先登录" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 1. 获取 API Key 统计
    const { data: apiKeys, error: keysError } = await supabaseClient
      .from("api_keys")
      .select("id, name, quota_total, quota_used, last_used_at, is_active")
      .eq("user_id", user.id);

    if (keysError) throw keysError;

    const totalQuota = apiKeys.reduce((sum, key) => sum + key.quota_total, 0);
    const totalUsed = apiKeys.reduce((sum, key) => sum + key.quota_used, 0);
    const quotaPercentage = totalQuota > 0 ? (totalUsed / totalQuota) * 100 : 0;

    // 2. 获取 API 调用统计（最近 30 天）
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: apiLogs, error: logsError } = await supabaseClient
      .from("api_logs")
      .select("created_at, tokens_total, cost, endpoint")
      .eq("user_id", user.id)
      .gte("created_at", thirtyDaysAgo.toISOString())
      .order("created_at", { ascending: true });

    if (logsError) throw logsError;

    // 按日期聚合
    const dailyStats: Record<string, { tokens: number; cost: number; requests: number }> = {};
    apiLogs.forEach((log) => {
      const date = log.created_at.split("T")[0];
      if (!dailyStats[date]) {
        dailyStats[date] = { tokens: 0, cost: 0, requests: 0 };
      }
      dailyStats[date].tokens += log.tokens_total || 0;
      dailyStats[date].cost += log.cost || 0;
      dailyStats[date].requests += 1;
    });

    // 3. 获取最受欢迎的 API
    const apiUsage: Record<string, number> = {};
    apiLogs.forEach((log) => {
      const endpoint = log.endpoint || "unknown";
      apiUsage[endpoint] = (apiUsage[endpoint] || 0) + 1;
    });

    const topApis = Object.entries(apiUsage)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([api, count]) => ({ api, count }));

    // 4. 获取当前订阅
    const { data: subscription, error: subError } = await supabaseClient
      .from("subscriptions")
      .select("*, plans(*)")
      .eq("user_id", user.id)
      .eq("status", "active")
      .gte("current_period_end", new Date().toISOString())
      .single();

    if (subError && subError.code !== "PGRST116") {
      // PGRST116 = no rows returned
      throw subError;
    }

    // 5. 构造返回数据
    const stats = {
      quota: {
        total: totalQuota,
        used: totalUsed,
        remaining: totalQuota - totalUsed,
        percentage: Math.round(quotaPercentage * 100) / 100,
      },
      api_keys: {
        total: apiKeys.length,
        active: apiKeys.filter((k) => k.is_active).length,
        inactive: apiKeys.filter((k) => !k.is_active).length,
      },
      usage_30d: {
        total_requests: apiLogs.length,
        total_tokens: apiLogs.reduce((sum, log) => sum + (log.tokens_total || 0), 0),
        total_cost: apiLogs.reduce((sum, log) => sum + (log.cost || 0), 0),
        daily_breakdown: dailyStats,
      },
      top_apis: topApis,
      current_subscription: subscription
        ? {
            plan_name: subscription.plans.name,
            plan_slug: subscription.plans.slug,
            price: subscription.plans.price,
            current_period_end: subscription.current_period_end,
            status: subscription.status,
          }
        : null,
    };

    return new Response(
      JSON.stringify({ success: true, data: stats }),
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
