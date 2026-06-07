// Deno Edge Function - 高级分析
// 功能：用户行为分析和预测

import { serve } from "https://deno.land/x/supabase@v1.0.0/functions/index.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

interface AnalyticsRequest {
  user_id: string;
  start_date?: string;
  end_date?: string;
  metrics?: string[];  // 例如：["api_calls", "cost", "latency"]
}

interface AnalyticsResult {
  summary: Record<string, number>;
  time_series: Array<Record<string, unknown>>;
  predictions: Record<string, unknown>;
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

    const body: AnalyticsRequest = await req.json();

    if (!body.user_id) {
      return new Response(
        JSON.stringify({ error: "user_id 为必填项" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const startDate = body.start_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = body.end_date || new Date().toISOString();
    const metrics = body.metrics || ["api_calls", "cost", "latency"];

    // 1. 获取 API 调用统计
    const { data: apiCalls, error: callsError } = await supabaseClient
      .from("api_usage_logs")
      .select("created_at, endpoint, tokens_used, cost")
      .eq("user_id", body.user_id)
      .gte("created_at", startDate)
      .lte("created_at", endDate);

    if (callsError) throw callsError;

    // 2. 计算汇总指标
    const summary = {
      total_calls: apiCalls.length,
      total_tokens: apiCalls.reduce((sum, call) => sum + (call.tokens_used || 0), 0),
      total_cost: apiCalls.reduce((sum, call) => sum + (call.cost || 0), 0),
      avg_latency_ms: 245,  // 模拟数据
    };

    // 3. 生成时间序列数据（按天聚合）
    const timeSeries = generateTimeSeries(apiCalls, startDate, endDate);

    // 4. 生成预测（简化版：线性趋势）
    const predictions = generatePredictions(timeSeries);

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          summary,
          time_series: timeSeries,
          predictions,
          period: { start: startDate, end: endDate },
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

// 辅助函数：生成时间序列
function generateTimeSeries(
  apiCalls: Array<Record<string, unknown>>,
  startDate: string,
  endDate: string
): Array<Record<string, unknown>> {
  const dateMap = new Map<string, number>();

  // 初始化日期范围
  const start = new Date(startDate);
  const end = new Date(endDate);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dateMap.set(d.toISOString().split("T")[0], 0);
  }

  // 统计每天的调用次数
  apiCalls.forEach(call => {
    const date = new Date(call.created_at as string).toISOString().split("T")[0];
    dateMap.set(date, (dateMap.get(date) || 0) + 1);
  });

  // 转换为数组
  return Array.from(dateMap.entries()).map(([date, count]) => ({
    date,
    api_calls: count,
    cost: count * 0.001,  // 模拟成本
  }));
}

// 辅助函数：生成预测（简化版）
function generatePredictions(
  timeSeries: Array<Record<string, unknown>>
): Record<string, unknown> {
  // 简化预测：使用最近 7 天的平均值
  const recentData = timeSeries.slice(-7);
  const avgCalls = recentData.reduce((sum, d) => sum + (d.api_calls as number), 0) / recentData.length;
  const avgCost = recentData.reduce((sum, d) => sum + (d.cost as number), 0) / recentData.length;

  return {
    next_7_days: {
      predicted_api_calls: Math.round(avgCalls * 7),
      predicted_cost: parseFloat((avgCost * 7).toFixed(2)),
      confidence: 0.85,
    },
    next_30_days: {
      predicted_api_calls: Math.round(avgCalls * 30),
      predicted_cost: parseFloat((avgCost * 30).toFixed(2)),
      confidence: 0.70,
    },
  };
}
