// Deno Edge Function - 预算控制
// 功能：设置预算上限

import { serve } from "https://deno.land/x/supabase@v1.0.0/functions/index.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

interface BudgetRequest {
  user_id: string;
  monthly_budget?: number;  // 月度预算（美元）
  alert_threshold?: number;  // 告警阈值（0-1，例如 0.8 = 80%）
  action_on_exceed?: "alert" | "block";  // 超出预算时的操作
}

interface BudgetStatus {
  budget: number;
  spent: number;
  remaining: number;
  percentage_used: number;
  is_exceeded: boolean;
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

    if (req.method === "POST") {
      // 设置/更新预算
      const body: BudgetRequest = await req.json();

      if (!body.user_id) {
        return new Response(
          JSON.stringify({ error: "user_id 为必填项" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data, error } = await supabaseClient
        .from("user_budgets")
        .upsert({
          user_id: body.user_id,
          monthly_budget: body.monthly_budget || 100,  // 默认 $100/月
          alert_threshold: body.alert_threshold || 0.8,  // 默认 80%
          action_on_exceed: body.action_on_exceed || "alert",
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            budget: data,
            message: "预算设置成功",
          },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } else if (req.method === "GET") {
      // 获取预算状态
      const url = new URL(req.url);
      const userId = url.searchParams.get("user_id");

      if (!userId) {
        return new Response(
          JSON.stringify({ error: "user_id 为必填项" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 获取预算配置
      const { data: budget, error: budgetError } = await supabaseClient
        .from("user_budgets")
        .select("*")
        .eq("user_id", userId)
        .single();

      if (budgetError && budgetError.code !== "PGRST116") {
        throw budgetError;
      }

      // 获取本月已花费金额
      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString();

      const { data: usageLogs, error: usageError } = await supabaseClient
        .from("api_usage_logs")
        .select("cost")
        .eq("user_id", userId)
        .gte("created_at", firstDayOfMonth)
        .lte("created_at", lastDayOfMonth);

      if (usageError) throw usageError;

      const totalSpent = usageLogs?.reduce((sum, log) => sum + (log.cost || 0), 0) || 0;
      const monthlyBudget = budget?.monthly_budget || 100;
      const remaining = Math.max(0, monthlyBudget - totalSpent);
      const percentageUsed = (totalSpent / monthlyBudget) * 100;

      const status: BudgetStatus = {
        budget: monthlyBudget,
        spent: parseFloat(totalSpent.toFixed(4)),
        remaining: parseFloat(remaining.toFixed(4)),
        percentage_used: parseFloat(percentageUsed.toFixed(2)),
        is_exceeded: totalSpent >= monthlyBudget,
      };

      // 检查是否超出预算，执行相应操作
      if (status.is_exceeded && budget) {
        if (budget.action_on_exceed === "block") {
          // 禁用用户的 API Key
          await supabaseClient
            .from("api_keys")
            .update({ is_active: false })
            .eq("user_id", userId);

          // 发送告警通知
          await sendBudgetAlert(supabaseClient, userId, status, "blocked");
        } else {
          // 只发送告警通知
          await sendBudgetAlert(supabaseClient, userId, status, "alert");
        }
      } else if (percentageUsed >= (budget?.alert_threshold || 0.8) * 100) {
        // 达到告警阈值，发送告警通知
        await sendBudgetAlert(supabaseClient, userId, status, "threshold");
      }

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            status,
            budget_config: budget,
          },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } else {
      return new Response(
        JSON.stringify({ error: `不支持的 HTTP 方法: ${req.method}` }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// 辅助函数：发送预算告警
async function sendBudgetAlert(
  supabaseClient: ReturnType<typeof createClient>,
  userId: string,
  status: BudgetStatus,
  alertType: "alert" | "blocked" | "threshold"
): Promise<void> {
  let subject = "";
  let message = "";

  switch (alertType) {
    case "threshold":
      subject = "⚠️ 预算告警：已达到阈值的 " + status.percentage_used + "%";
      message = `您的 API 使用预算（$${status.budget}）已达到 ${status.percentage_used}%。\n已花费：$${status.spent}，剩余：$${status.remaining}。`;
      break;
    case "alert":
      subject = "🚨 预算告警：即将超出预算";
      message = `您的 API 使用预算（$${status.budget}）即将超出。\n已花费：$${status.spent}，剩余：$${status.remaining}。`;
      break;
    case "blocked":
      subject = "🚫 预算已超出，API 已被阻止";
      message = `您的 API 使用预算（$${status.budget}）已超出。\n总花费：$${status.spent}。\n所有 API Key 已被禁用，请登录控制台调整预算。`;
      break;
  }

  // 获取用户邮箱
  const { data: user } = await supabaseClient
    .from("users")
    .select("email")
    .eq("id", userId)
    .single();

  if (user?.email) {
    // 发送邮件通知（简化：实际应该调用邮件服务）
    console.log(`发送预算告警邮件给 ${user.email}：${subject}`);
    console.log(`邮件内容：${message}`);
  }

  // 记录告警日志
  await supabaseClient
    .from("budget_alert_logs")
    .insert({
      user_id: userId,
      alert_type: alertType,
      budget_status: status,
      created_at: new Date().toISOString(),
    });

  return Promise.resolve();
}
