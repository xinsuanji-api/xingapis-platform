// Deno Edge Function - 智能路由
// 功能：根据 API 健康状态和成本，自动选择最优供应商

import { serve } from "https://deno.land/x/supabase@v1.0.0/functions/index.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// CORS 头
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface RouteRequest {
  api_slug: string;
  user_id: string;
  prefer?: "speed" | "cost" | "reliability";
}

interface ProviderHealth {
  slug: string;
  status: "operational" | "degraded" | "outage";
  latency_ms: number;
  error_rate: number;
  uptime: number;
}

// 供应商配置（实际应该从数据库读取）
const PROVIDERS = {
  "qwen-plus": [
    { slug: "aliyun-bailian", weight: 0.7, base_url: "https://bailian.aliyuncs.com" },
    { slug: "backup-provider-1", weight: 0.3, base_url: "https://backup1.example.com" },
  ],
  "deepseek-v3": [
    { slug: "deepseek-official", weight: 1.0, base_url: "https://api.deepseek.com" },
  ],
  "ernie-4.0": [
    { slug: "baidu-wenxin", weight: 1.0, base_url: "https://aip.baidu.com" },
  ],
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
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
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

    const body: RouteRequest = await req.json();

    // 验证必填字段
    if (!body.api_slug || !body.user_id) {
      return new Response(
        JSON.stringify({ error: "api_slug 和 user_id 为必填项" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 获取 API 产品信息
    const { data: api, error: apiError } = await supabaseClient
      .from("api_products")
      .select("*")
      .eq("slug", body.api_slug)
      .eq("is_active", true)
      .single();

    if (apiError || !api) {
      return new Response(
        JSON.stringify({ error: `API 产品不存在: ${body.api_slug}` }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 获取可用的供应商列表
    const providers = PROVIDERS[body.api_slug] || [{ slug: "default", weight: 1.0, base_url: api.endpoint_url }];

    // 获取所有供应商的健康状态
    const healthPromises = providers.map(async (provider) => {
      const health = await checkProviderHealth(provider.slug, provider.base_url);
      return { ...provider, health };
    });

    const healthResults = await Promise.all(healthPromises);

    // 过滤掉离线的供应商
    const availableProviders = healthResults.filter(
      (p) => p.health.status !== "outage"
    );

    if (availableProviders.length === 0) {
      return new Response(
        JSON.stringify({
          error: "所有供应商均不可用，请稍后重试",
          fallback: true,
        }),
        {
          status: 503,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 根据策略选择最优供应商
    const prefer = body.prefer || "reliability";
    const selectedProvider = selectBestProvider(availableProviders, prefer);

    // 返回路由结果
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          api_slug: body.api_slug,
          selected_provider: selectedProvider.slug,
          endpoint_url: selectedProvider.base_url,
          health_status: selectedProvider.health.status,
          latency_ms: selectedProvider.health.latency_ms,
          strategy: prefer,
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

// 辅助函数：检查供应商健康状态
async function checkProviderHealth(slug: string, baseUrl: string): Promise<ProviderHealth> {
  try {
    const startTime = Date.now();
    const healthUrl = `${baseUrl}/health`;  // 假设供应商有 /health 端点

    const response = await fetch(healthUrl, {
      method: "GET",
      signal: AbortSignal.timeout(5000),  // 5 秒超时
    });

    const latencyMs = Date.now() - startTime;

    if (!response.ok) {
      return {
        slug,
        status: "degraded",
        latency_ms: latencyMs,
        error_rate: 5.0,
        uptime: 95.0,
      };
    }

    const healthData = await response.json();

    return {
      slug,
      status: healthData.status || "operational",
      latency_ms: latencyMs,
      error_rate: healthData.error_rate || 0.0,
      uptime: healthData.uptime || 99.0,
    };
  } catch (error) {
    // 健康检查失败，假设供应商离线
    return {
      slug,
      status: "outage",
      latency_ms: 999999,
      error_rate: 100.0,
      uptime: 0.0,
    };
  }
}

// 辅助函数：选择最优供应商
function selectBestProvider(
  providers: Array<Record<string, unknown>>,
  strategy: string
): Record<string, unknown> {
  if (providers.length === 1) {
    return providers[0];
  }

  switch (strategy) {
    case "speed":
      // 选择延迟最低的
      return providers.reduce((best, current) =>
        (current.health as ProviderHealth).latency_ms <
          (best.health as ProviderHealth).latency_ms
          ? current
          : best
      );

    case "cost":
      // 选择成本最低的（需要根据实际成本计算）
      // 这里简化为选择权重最高的（假设权重反映成本）
      return providers.reduce((best, current) =>
        (current.weight as number) > (best.weight as number) ? current : best
      );

    case "reliability":
    default:
      // 选择可用性最高的
      return providers.reduce((best, current) => {
        const bestScore =
          (best.health as ProviderHealth).uptime -
          (best.health as ProviderHealth).error_rate;
        const currentScore =
          (current.health as ProviderHealth).uptime -
          (current.health as ProviderHealth).error_rate;
        return currentScore > bestScore ? current : best;
      });
  }
}
