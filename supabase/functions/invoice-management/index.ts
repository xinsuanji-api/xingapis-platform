// Deno Edge Function - 发票管理
// 功能：自动生成发票

import { serve } from "https://deno.land/x/supabase@v1.0.0/functions/index.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

interface InvoiceRequest {
  user_id: string;
  amount: number;  // 发票金额（美元）
  tax_rate?: number;  // 税率（0-1，例如 0.06 = 6%）
  items?: Array<{ description: string; amount: number }>;
}

interface InvoiceResponse {
  invoice_id: string;
  invoice_url: string;  // PDF 下载链接
  invoice_data: Record<string, unknown>;
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
      // 生成发票
      const body: InvoiceRequest = await req.json();

      if (!body.user_id || !body.amount) {
        return new Response(
          JSON.stringify({ error: "user_id 和 amount 为必填项" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 1. 获取用户信息
      const { data: user, error: userError } = await supabaseClient
        .from("users")
        .select("email, company_name, tax_id")
        .eq("id", body.user_id)
        .single();

      if (userError || !user) {
        return new Response(
          JSON.stringify({ error: "用户不存在" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 2. 计算税费
      const taxRate = body.tax_rate || 0.06;  // 默认 6%
      const taxAmount = body.amount * taxRate;
      const totalAmount = body.amount + taxAmount;

      // 3. 生成发票数据
      const invoiceData = {
        invoice_number: `INV-${Date.now()}`,
        user_id: body.user_id,
        user_email: user.email,
        company_name: user.company_name || "个人",
        tax_id: user.tax_id || "",
        issue_date: new Date().toISOString(),
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),  // 30 天后到期
        items: body.items || [{ description: "API 使用费用", amount: body.amount }],
        subtotal: body.amount,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        currency: "USD",
        status: "issued",
      };

      // 4. 存储发票到数据库
      const { data: invoice, error: invoiceError } = await supabaseClient
        .from("invoices")
        .insert(invoiceData)
        .select()
        .single();

      if (invoiceError) throw invoiceError;

      // 5. 生成 PDF 发票（简化：实际应该调用 PDF 生成服务）
      const invoiceUrl = await generateInvoicePDF(invoice.id, invoiceData);

      // 6. 发送发票邮件（异步）
      sendInvoiceEmail(supabaseClient, user.email, invoice.id, invoiceUrl);

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            invoice_id: invoice.id,
            invoice_url: invoiceUrl,
            invoice_data: invoiceData,
          } as InvoiceResponse,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } else if (req.method === "GET") {
      // 获取发票列表
      const url = new URL(req.url);
      const userId = url.searchParams.get("user_id");

      if (!userId) {
        return new Response(
          JSON.stringify({ error: "user_id 为必填项" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: invoices, error: invoicesError } = await supabaseClient
        .from("invoices")
        .select("*")
        .eq("user_id", userId)
        .order("issue_date", { ascending: false });

      if (invoicesError) throw invoicesError;

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            invoices,
            total: invoices?.length || 0,
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

// 辅助函数：生成 PDF 发票（简化版）
async function generateInvoicePDF(invoiceId: string, invoiceData: Record<string, unknown>): Promise<string> {
  // 简化：实际应该调用 PDF 生成服务（如 Puppeteer、PDFKit）
  // 这里只返回模拟的 PDF URL
  const pdfUrl = `${Deno.env.get("PUBLIC_URL") || "https://api.xinsuanji.cn"}/invoices/${invoiceId}.pdf`;

  // 异步生成 PDF（不阻塞响应）
  fetch(`${Deno.env.get("PUBLIC_URL") || "https://api.xinsuanji.cn"}/generate-pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ invoice_id: invoiceId, data: invoiceData }),
  }).catch(error => console.error("PDF 生成失败:", error));

  return pdfUrl;
}

// 辅助函数：发送发票邮件（异步）
async function sendInvoiceEmail(
  supabaseClient: ReturnType<typeof createClient>,
  email: string,
  invoiceId: string,
  invoiceUrl: string
): Promise<void> {
  // 简化：实际应该调用邮件服务（如 SendGrid、AWS SES）
  console.log(`发送发票邮件给 ${email}：发票 ID ${invoiceId}，下载链接：${invoiceUrl}`);

  // 记录邮件发送日志
  supabaseClient
    .from("invoice_email_logs")
    .insert({
      email,
      invoice_id: invoiceId,
      sent_at: new Date().toISOString(),
    })
    .then(({ error }) => {
      if (error) console.error("记录发票邮件日志失败:", error);
    });

  return Promise.resolve();
}
