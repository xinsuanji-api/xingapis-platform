// Deno Edge Function - 支付 Webhook 处理
// 功能：处理支付宝/微信支付的异步通知

import { serve } from "https://deno.land/x/supabase@v1.0.0/functions/index.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// CORS 头
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface AlipayWebhook {
  notify_time: string;
  notify_type: string;
  notify_id: string;
  charset: string;
  version: string;
  sign_type: string;
  sign: string;
  trade_no: string;
  app_id: string;
  out_trade_no: string;
  out_biz_no: string;
  buyer_id: string;
  buyer_logon_id: string;
  seller_id: string;
  seller_email: string;
  trade_status: string;
  total_amount: string;
  receipt_amount: string;
  invoice_amount: string;
  buyer_pay_amount: string;
  point_amount: string;
  refund_fee: string;
  subject: string;
  body: string;
  gmt_create: string;
  gmt_payment: string;
  gmt_refund: string;
  gmt_close: string;
}

serve(async (req: Request) => {
  // 处理 CORS 预检请求
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
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

    // 创建 Supabase 客户端（使用 service role key）
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // 解析 Webhook 数据（支付宝发送的是 form-data）
    const formData = await req.formData();
    const webhookData: Record<string, string> = {};
    formData.forEach((value, key) => {
      webhookData[key] = value.toString();
    });

    console.log("收到支付 Webhook:", webhookData);

    // 验证签名（简化版，生产环境需要完整验证）
    const sign = webhookData.sign;
    const signType = webhookData.sign_type;
    
    // TODO: 实际应该验证签名
    // const isValid = verifyAlipaySignature(webhookData, Deno.env.get("ALIPAY_PUBLIC_KEY"));
    // if (!isValid) throw new Error("签名验证失败");

    const tradeStatus = webhookData.trade_status;
    const outTradeNo = webhookData.out_trade_no;  // 商户订单号
    const tradeNo = webhookData.trade_no;  // 支付宝交易号
    const totalAmount = parseFloat(webhookData.total_amount || "0");

    // 查询订单
    const { data: order, error: orderError } = await supabaseClient
      .from("orders")
      .select("*, plans(*)")
      .eq("id", outTradeNo)
      .single();

    if (orderError || !order) {
      throw new Error(`订单不存在: ${outTradeNo}`);
    }

    // 处理不同的交易状态
    if (tradeStatus === "TRADE_SUCCESS" || tradeStatus === "TRADE_FINISHED") {
      // 支付成功

      // 1. 更新订单状态
      const { error: updateOrderError } = await supabaseClient
        .from("orders")
        .update({
          status: "paid",
          payment_id: tradeNo,
          payment_provider: "alipay",
          paid_at: new Date().toISOString(),
        })
        .eq("id", order.id);

      if (updateOrderError) throw updateOrderError;

      // 2. 创建或更新订阅
      const plan = order.plans;
      const now = new Date();
      const periodEnd = new Date();

      if (plan.billing_cycle === "monthly") {
        periodEnd.setMonth(periodEnd.getMonth() + 1);
      } else if (plan.billing_cycle === "yearly") {
        periodEnd.setFullYear(periodEnd.getFullYear() + 1);
      } else {
        // one_time，不设置过期时间
      }

      const { error: subError } = await supabaseClient
        .from("subscriptions")
        .upsert({
          user_id: order.user_id,
          plan_id: order.plan_id,
          status: "active",
          current_period_start: now.toISOString(),
          current_period_end: plan.billing_cycle === "one_time" ? null : periodEnd.toISOString(),
          payment_provider: "alipay",
          payment_id: tradeNo,
        }, {
          onConflict: "user_id, plan_id",
        });

      if (subError) throw subError;

      // 3. 更新用户的 API Key 配额（如果有的话）
      const { error: keysError } = await supabaseClient
        .from("api_keys")
        .update({ quota_total: plan.quota_total })
        .eq("user_id", order.user_id);

      if (keysError) {
        console.error("更新 API Key 配额失败:", keysError);
      }

      console.log(`订单 ${outTradeNo} 支付成功，订阅已激活`);

      return new Response(
        "success",  // 支付宝要求返回 "success"
        {
          status: 200,
          headers: { "Content-Type": "text/plain" },
        }
      );

    } else if (tradeStatus === "TRADE_CLOSED") {
      // 交易关闭（用户未支付，超时关闭）

      const { error: updateError } = await supabaseClient
        .from("orders")
        .update({ status: "cancelled" })
        .eq("id", order.id);

      if (updateError) throw updateError;

      console.log(`订单 ${outTradeNo} 已关闭`);

    } else if (tradeStatus === "WAIT_BUYER_PAY") {
      // 等待买家付款（可以不处理）
      console.log(`订单 ${outTradeNo} 等待付款`);
    }

    return new Response("success", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });

  } catch (error) {
    console.error("Webhook 处理失败:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

// 辅助函数：验证支付宝签名（简化版）
// 生产环境需要使用支付宝公钥进行完整验证
function verifyAlipaySignature(data: Record<string, string>, publicKey: string): boolean {
  // TODO: 实现签名验证
  // 1. 去除 sign 和 sign_type 参数
  // 2. 按照 ASCII 码排序
  // 3. 拼接成字符串
  // 4. 使用支付宝公钥验证签名
  return true;  // 临时返回 true
}
