// Deno Edge Function - A/B 测试
// 功能：对比不同 API 版本的性能

import { serve} from "https://deno.land/x/supabase@v1.0.0/functions/index.ts";
import { createClient} from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ABTestRequest {
  api_slug: string;
  user_id: string;
  variants: Array<{version: string; weight: number}>;  // 例如：[{version: "v1", weight: 50}, {version: "v2", weight: 50}]
  metric: "latency" | "error_rate" | "user_satisfaction";  // 优化指标
}

interface ABTestResponse {
  selected_variant: string;
  confidence_level: number;  // 置信度（0-1）
  test_id: string;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {headers: corsHeaders});
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({error: "只支持 POST 请求"}),
        {status: 405, headers: {...corsHeaders, "Content-Type": "application/json"}}
      );
    }

    const body: ABTestRequest = await req.json();

    if (!body.api_slug || !body.user_id || !body.variants || body.variants.length === 0) {
      return new Response(
        JSON.stringify({error: "api_slug, user_id, variants 为必填项"}),
        {status: 400, headers: {...corsHeaders, "Content-Type": "application/json"}}
      );
    }

    // 1. 检查用户是否已被分配到某个变体
    const {data: existingAssignment, error: assignmentError} = await supabaseClient
      .from("ab_test_assignments")
      .select("variant_version, test_id")
      .eq("user_id", body.user_id)
      .eq("api_slug", body.api_slug)
      .single();

    if (!assignmentError && existingAssignment) {
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            selected_variant: existingAssignment.variant_version,
            confidence_level: 0.95,  // 假设置信度
            test_id: existingAssignment.test_id,
            is_new_assignment: false,
          } as ABTestResponse,
        }),
        {status: 200, headers: {...corsHeaders, "Content-Type": "application/json"}}
      );
    }

    // 2. 新用户，根据权重随机分配变体
    const totalWeight = body.variants.reduce((sum, v) => sum + v.weight, 0);
    const random = Math.random() * totalWeight;
    
    let cumulativeWeight = 0;
    let selectedVariant = body.variants[0].version;
    
    for (const variant of body.variants) {
      cumulativeWeight += variant.weight;
      if (random <= cumulativeWeight) {
        selectedVariant = variant.version;
        break;
      }
    }

    // 3. 创建测试 ID 并记录分配
    const testId = generateTestId();
    
    await supabaseClient
      .from("ab_test_assignments")
      .insert({
        user_id: body.user_id,
        api_slug: body.api_slug,
        variant_version: selectedVariant,
        test_id: testId,
        created_at: new Date().toISOString(),
      });

    // 4. 异步记录测试开始
    logTestStart(supabaseClient, body.api_slug, testId, body.variants, body.metric);

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          selected_variant: selectedVariant,
          confidence_level: 0.95,
          test_id: testId,
          is_new_assignment: true,
        } as ABTestResponse,
      }),
      {status: 200, headers: {...corsHeaders, "Content-Type": "application/json"}}
    );

  } catch (error) {
    return new Response(
      JSON.stringify({error: error.message}),
      {status: 500, headers: {...corsHeaders, "Content-Type": "application/json"}}
    );
  }
});

// 辅助函数：生成测试 ID
function generateTestId(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

// 辅助函数：记录测试开始（异步）
async function logTestStart(
  supabaseClient: ReturnType<typeof createClient>,
  apiSlug: string,
  testId: string,
  variants: Array<{version: string; weight: number}>,
  metric: string
): Promise<void> {
  supabaseClient
    .from("ab_test_logs")
    .insert({
      test_id: testId,
      api_slug: apiSlug,
      variants: JSON.stringify(variants),
      metric,
      status: "running",
      created_at: new Date().toISOString(),
    })
    .then(({error}) => {
      if (error) console.error("记录 A/B 测试开始失败:", error);
    });

  return Promise.resolve();
}

// 辅助函数：记录测试结果（在 API 调用后调用）
export async function logABTestResult(
  supabaseClient: ReturnType<typeof createClient>,
  testId: string,
  variantVersion: string,
  metricValue: number,  // 实际指标值（延迟、错误率等）
  userId: string
): Promise<void> {
  supabaseClient
    .from("ab_test_results")
    .insert({
      test_id: testId,
      user_id: userId,
      variant_version: variantVersion,
      metric_value: metricValue,
      created_at: new Date().toISOString(),
    })
    .then(({error}) => {
      if (error) console.error("记录 A/B 测试结果失败:", error);
    });

  return Promise.resolve();
}
