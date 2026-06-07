// Deno Edge Function - API Key 管理
// 功能：生成、列表、删除用户的 API Keys

import { serve } from "https://deno.land/x/supabase@v1.0.0/functions/index.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// CORS 头
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
};

interface CreateKeyRequest {
  name: string;
  permissions?: string[];
  rate_limit?: number;
  quota_total?: number;
  expires_at?: string;
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

    // 路由处理
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    // GET /api-keys - 列出用户的所有 API Keys
    if (method === "GET") {
      const { data, error } = await supabaseClient
        .from("api_keys")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, data }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // POST /api-keys - 创建新的 API Key
    if (method === "POST") {
      const body: CreateKeyRequest = await req.json();

      // 验证必填字段
      if (!body.name) {
        return new Response(
          JSON.stringify({ error: "API Key 名称不能为空" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // 生成 API Key（格式：sk_live_xxxxx）
      const apiKey = `sk_live_${crypto.randomUUID().replace(/-/g, "")}`;
      const keyHash = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(apiKey)
      ).then((hash) =>
        Array.from(new Uint8Array(hash))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("")
      );
      const keyPrefix = apiKey.substring(0, 12) + "...";

      // 插入数据库
      const { data, error } = await supabaseClient
        .from("api_keys")
        .insert({
          user_id: user.id,
          name: body.name,
          key_hash: keyHash,
          key_prefix: keyPrefix,
          permissions: body.permissions || [],
          rate_limit: body.rate_limit || 1000,
          quota_total: body.quota_total || 1000000,
          expires_at: body.expires_at || null,
        })
        .select()
        .single();

      if (error) throw error;

      // 返回完整的 API Key（只在这时返回一次）
      return new Response(
        JSON.stringify({
          success: true,
          message: "API Key 创建成功！请妥善保管，仅显示一次。",
          data: {
            ...data,
            full_key: apiKey,  // 完整 Key，只返回一次
          },
        }),
        {
          status: 201,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // DELETE /api-keys/:id - 删除 API Key
    if (method === "DELETE") {
      const keyId = path.split("/").pop();

      const { error } = await supabaseClient
        .from("api_keys")
        .delete()
        .eq("id", keyId)
        .eq("user_id", user.id);  // 确保只能删除自己的 Key

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, message: "API Key 已删除" }),
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
