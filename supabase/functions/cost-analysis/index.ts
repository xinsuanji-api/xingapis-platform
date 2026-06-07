// Deno Edge Function - 成本分析
// 功能：详细的成本 breakdown

import { serve } from "https://deno.land/x/supabase@v1.0.0/functions/index.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

interface CostAnalysisRequest {
  user_id: string;
  start_date?: string;
  end_date?: string;
  group_by?: "day" | "week" | "month" | "api";
}

interface CostBreakdown {
  total_cost: number;
  by_api: Record<string, number>;
  by_day: Record<string, number>;
  by_model: Record<string, number>;
  cost_trend: Array<{ date: string; cost: number }>;
  recommendations: string[];
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

    const body: CostAnalysisRequest = await req.json();

    if (!body.user_id) {
      return new Response(
        JSON.stringify({ error: "user_id 为必填项" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const startDate = body.start_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = body.end_date || new Date().toISOString();

    // 1. 获取用户的 API 使用记录
    const { data: usageLogs, error: logsError } = await supabaseClient
      .from("api_usage_logs")
      .select(`
        created_at,
        tokens_used,
        cost,
        api_products!inner(name, slug)
      `)
      .eq("user_id", body.user_id)
      .gte("created_at", startDate)
      .lte("created_at", endDate);

    if (logsError) throw logsError;

    // 2. 计算成本 breakdown
    const breakdown: CostBreakdown = {
      total_cost: 0,
      by_api: {},
      by_day: {},
      by_model: {},
      cost_trend: [],
      recommendations: [],
    };

    // 按 API 聚合
    usageLogs?.forEach(log => {
      const apiName = log.api_products.name;
      const cost = log.cost || 0;
      const date = new Date(log.created_at).toISOString().split("T")[0];

      // 总成本
      breakdown.total_cost += cost;

      // 按 API 分组
      breakdown.by_api[apiName] = (breakdown.by_api[apiName] || 0) + cost;

      // 按天分组
      breakdown.by_day[date] = (breakdown.by_day[date] || 0) + cost;

      // 按模型分组（简化：假设 slug 包含模型信息）
      const model = (log.api_products as any).slug.split("-")[0];
      breakdown.by_model[model] = (breakdown.by_model[model] || 0) + cost;
    });

    // 3. 生成成本趋势（按天）
    breakdown.cost_trend = Object.entries(breakdown.by_day)
      .map(([date, cost]) => ({ date, cost: parseFloat(cost.toFixed(4)) }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // 4. 生成成本优化建议
    breakdown.recommendations = generateCostRecommendations(breakdown);

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          period: { start: startDate, end: endDate },
          breakdown,
          summary: {
            total_cost: parseFloat(breakdown.total_cost.toFixed(4)),
            avg_daily_cost: parseFloat((breakdown.total_cost / 30).toFixed(4)),
            most_expensive_api: Object.entries(breakdown.by_api).sort((a, b) => b[1] - a[1])[0]?.[0] || "N/A",
            potential_savings: parseFloat((breakdown.total_cost * 0.15).toFixed(4)), // 假设节省 15%
          },
        },
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

// 辅助函数：生成成本优化建议
function generateCostRecommendations(breakdown: CostBreakdown): string[] {
  const recommendations: string[] = [];

  // 建议 1：使用缓存
  if (breakdown.total_cost > 10) {
    recommendations.push("💡 建议启用缓存功能，预计可节省 15-30% 成本");
  }

  // 建议 2：切换更便宜的模型
  const mostExpensiveModel = Object.entries(breakdown.by_model)
    .sort((a, b) => b[1] - a[1])[0];

  if (mostExpensiveModel && mostExpensiveModel[1] > breakdown.total_cost * 0.5) {
    recommendations.push(`💡 考虑使用 ${mostExpensiveModel[0]}-lite 版本，价格降低 50%`);
  }

  // 建议 3：批量请求
  if (breakdown.total_cost > 50) {
    recommendations.push("💡 考虑批量处理请求，减少 API 调用次数");
  }

  // 建议 4：设置预算上限
  recommendations.push("💡 设置月度预算上限，避免意外高额账单");

  return recommendations;
}
