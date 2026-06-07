// Deno Edge Function - 支付功能
// 功能：创建支付宝订单、处理支付回调

import { serve } from "https://deno.land/x/supabase@v1.0.0/functions/index.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// CORS 头
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

interface CreateOrderRequest {
  plan_id: string;
  payment_method: "alipay" | "wechat";
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

    // POST /create-order - 创建支付订单
    if (req.method === "POST") {
      const body: CreateOrderRequest = await req.json();

      // 验证必填字段
      if (!body.plan_id) {
        return new Response(
          JSON.stringify({ error: "套餐 ID 不能为空" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // 查询套餐信息
      const { data: plan, error: planError } = await supabaseClient
        .from("plans")
        .select("*")
        .eq("id", body.plan_id)
        .eq("is_active", true)
        .single();

      if (planError || !plan) {
        return new Response(
          JSON.stringify({ error: "套餐不存在或已下架" }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // 创建订单
      const orderId = crypto.randomUUID();
      const { data: order, error: orderError } = await supabaseClient
        .from("orders")
        .insert({
          id: orderId,
          user_id: user.id,
          plan_id: body.plan_id,
          amount: plan.price,
          status: "pending",
          payment_provider: body.payment_method || "alipay",
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // 调用支付宝 API 创建支付订单
      const alipayForm = await createAlipayOrder({
        out_trade_no: orderId,
        total_amount: plan.price.toFixed(2),
        subject: `星算纪 API 平台 - ${plan.name}`,
        body: plan.description || `购买 ${plan.name} 套餐`,
      });

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            order_id: orderId,
            amount: plan.price,
            plan_name: plan.name,
            payment_form: alipayForm,  // 支付宝支付表单（HTML）
          },
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // GET /payment/status - 查询支付状态
    if (req.method === "GET") {
      const url = new URL(req.url);
      const orderId = url.searchParams.get("order_id");

      if (!orderId) {
        return new Response(
          JSON.stringify({ error: "订单 ID 不能为空" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const { data: order, error: orderError } = await supabaseClient
        .from("orders")
        .select("*, plans(*)")
        .eq("id", orderId)
        .eq("user_id", user.id)
        .single();

      if (orderError || !order) {
        return new Response(
          JSON.stringify({ error: "订单不存在" }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            order_id: order.id,
            status: order.status,
            amount: order.amount,
            plan_name: order.plans.name,
            paid_at: order.paid_at,
            created_at: order.created_at,
          },
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 不支持的方法
    return new Response(
      JSON.stringify({ error: "不支持的请求方法" }),
      {
        status: 405,
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

// 辅助函数：创建支付宝订单
async function createAlipayOrder(params: {
  out_trade_no: string;
  total_amount: string;
  subject: string;
  body: string;
}): Promise<string> {
  // 支付宝 API 配置
  const appId = Deno.env.get("ALIPAY_APP_ID") ?? "";
  const privateKey = Deno.env.get("ALIPAY_PRIVATE_KEY") ?? "";
  const alipayPublicKey = Deno.env.get("ALIPAY_PUBLIC_KEY") ?? "";
  const gatewayUrl = "https://openapi.alipay.com/gateway.do";  // 生产环境
  // const gatewayUrl = "https://openapi.alipaydev.com/gateway.do";  // 沙箱环境

  // 构造请求参数
  const bizContent = JSON.stringify({
    out_trade_no: params.out_trade_no,
    total_amount: params.total_amount,
    subject: params.subject,
    body: params.body,
    product_code: "FAST_INSTANT_TRADE_PAY",
  });

  const requestParams: Record<string, string> = {
    app_id: appId,
    method: "alipay.trade.page.pay",
    charset: "utf-8",
    sign_type: "RSA2",
    timestamp: new Date().toISOString().replace(/[-:]/g, "").split(".")[0],
    version: "1.0",
    notify_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/payment-webhook`,
    return_url: `${Deno.env.get("FRONTEND_URL")}/payment/success`,
    biz_content: bizContent,
  };

  // 排序并签名
  const sortedParams = Object.keys(requestParams)
    .sort()
    .map((key) => `${key}=${requestParams[key]}`)
    .join("&");

  const sign = await signWithRSA2(sortedParams, privateKey);

  requestParams.sign = sign;

  // 构造表单（自动提交到支付宝）
  const formHtml = `
    <form id="alipayForm" action="${gatewayUrl}" method="POST">
      ${Object.entries(requestParams)
        .map(([key, value]) => `<input type="hidden" name="${key}" value="${value}" />`)
        .join("")}
    </form>
    <script>document.getElementById("alipayForm").submit();</script>
  `;

  return formHtml;
}

// 辅助函数：RSA2 签名
async function signWithRSA2(data: string, privateKey: string): Promise<string> {
  // 使用 Web Crypto API 签名
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(privateKey),
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    dataBuffer
  );

  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

// 辅助函数：PEM 转 ArrayBuffer
function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----BEGIN.*-----|-----END.*-----|\n/g, "");
  const binary = atob(b64);
  const buffer = new ArrayBuffer(binary.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    view[i] = binary.charCodeAt(i);
  }
  return buffer;
}
