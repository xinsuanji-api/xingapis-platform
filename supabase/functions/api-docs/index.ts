// Deno Edge Function - API 文档页面
// 功能：动态渲染 API 文档（从数据库读取）

import { serve } from "https://deno.land/x/supabase@v1.0.0/functions/index.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// CORS 头
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

interface ApiProduct {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  provider: string;
  endpoint_url: string;
  pricing_model: string;
  price_input: number;
  price_output: number;
  currency: string;
  rate_limit: number;
  timeout_ms: number;
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
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    // 获取所有活跃的 API 产品
    const { data: apiProducts, error } = await supabaseClient
      .from("api_products")
      .select("*")
      .eq("is_active", true)
      .order("category", { ascending: true })
      .order("name", { ascending: true });

    if (error) throw error;

    // 按分类分组
    const groupedApis: Record<string, ApiProduct[]> = {};
    apiProducts.forEach((api) => {
      const category = api.category || "other";
      if (!groupedApis[category]) {
        groupedApis[category] = [];
      }
      groupedApis[category].push(api);
    });

    // 生成 HTML 文档
    const html = generateDocsHtml(groupedApis);

    return new Response(html, {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
    });

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

// 辅助函数：生成文档 HTML
function generateDocsHtml(groupedApis: Record<string, any[]>): string {
  const categoryNames: Record<string, string> = {
    ai: "人工智能",
    data: "数据服务",
    utility: "实用工具",
    communication: "通信服务",
    finance: "金融服务",
    other: "其他",
  };

  let apisListHtml = "";
  let sidebarHtml = "";

  Object.entries(groupedApis).forEach(([category, apis]) => {
    const categoryName = categoryNames[category] || category;
    sidebarHtml += `<li><a href="#category-${category}">${categoryName}</a></li>`;

    apisListHtml += `
      <div class="category" id="category-${category}">
        <h2>${categoryName}</h2>
        ${apis.map((api) => generateApiDoc(api)).join("")}
      </div>
    `;
  });

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>API 文档 - 星算纪 API 平台</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: linear-gradient(135deg, #0a1628 0%, #0d2137 100%);
      color: #e2e8f0;
      line-height: 1.6;
      display: flex;
      min-height: 100vh;
    }

    /* 侧边栏 */
    .sidebar {
      width: 280px;
      background: rgba(15, 23, 42, 0.9);
      backdrop-filter: blur(10px);
      padding: 2rem 1.5rem;
      position: fixed;
      height: 100vh;
      overflow-y: auto;
      border-right: 1px solid rgba(0, 229, 255, 0.2);
    }

    .sidebar h2 {
      color: #00e5ff;
      font-size: 1.5rem;
      margin-bottom: 1.5rem;
      text-shadow: 0 0 10px rgba(0, 229, 255, 0.5);
    }

    .sidebar ul {
      list-style: none;
    }

    .sidebar li {
      margin-bottom: 0.8rem;
    }

    .sidebar a {
      color: #94a3b8;
      text-decoration: none;
      transition: all 0.3s;
      display: block;
      padding: 0.5rem 1rem;
      border-radius: 8px;
    }

    .sidebar a:hover {
      color: #00e5ff;
      background: rgba(0, 229, 255, 0.1);
    }

    /* 主内容区 */
    .main-content {
      flex: 1;
      margin-left: 280px;
      padding: 3rem;
      max-width: 1200px;
    }

    .main-content h1 {
      font-size: 3rem;
      color: #00e5ff;
      margin-bottom: 1rem;
      text-shadow: 0 0 20px rgba(0, 229, 255, 0.5);
    }

    .main-content > p {
      font-size: 1.2rem;
      color: #94a3b8;
      margin-bottom: 3rem;
    }

    .category {
      margin-bottom: 4rem;
    }

    .category h2 {
      font-size: 2rem;
      color: #7c3aed;
      margin-bottom: 2rem;
      padding-bottom: 1rem;
      border-bottom: 2px solid rgba(124, 58, 237, 0.3);
    }

    .api-card {
      background: rgba(15, 23, 42, 0.8);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(0, 229, 255, 0.2);
      border-radius: 16px;
      padding: 2rem;
      margin-bottom: 2rem;
      transition: all 0.3s;
    }

    .api-card:hover {
      border-color: #00e5ff;
      box-shadow: 0 0 30px rgba(0, 229, 255, 0.3);
      transform: translateY(-5px);
    }

    .api-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
    }

    .api-name {
      font-size: 1.5rem;
      color: #00e5ff;
      font-weight: 600;
    }

    .api-badge {
      background: linear-gradient(135deg, #7c3aed, #a78bfa);
      color: white;
      padding: 0.3rem 0.8rem;
      border-radius: 20px;
      font-size: 0.85rem;
    }

    .api-description {
      color: #94a3b8;
      margin-bottom: 1.5rem;
      line-height: 1.8;
    }

    .api-meta {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin-bottom: 1.5rem;
    }

    .meta-item {
      background: rgba(0, 0, 0, 0.3);
      padding: 1rem;
      border-radius: 8px;
      border: 1px solid rgba(0, 229, 255, 0.1);
    }

    .meta-label {
      color: #64748b;
      font-size: 0.85rem;
      margin-bottom: 0.3rem;
    }

    .meta-value {
      color: #e2e8f0;
      font-weight: 600;
    }

    .api-endpoint {
      background: rgba(0, 0, 0, 0.5);
      padding: 1rem;
      border-radius: 8px;
      margin-bottom: 1.5rem;
      border: 1px solid rgba(0, 229, 255, 0.2);
    }

    .endpoint-label {
      color: #64748b;
      font-size: 0.85rem;
      margin-bottom: 0.5rem;
    }

    .endpoint-url {
      color: #00e5ff;
      font-family: "Courier New", monospace;
      font-size: 0.9rem;
      word-break: break-all;
    }

    .code-example {
      background: #0f172a;
      border-radius: 8px;
      padding: 1.5rem;
      margin-top: 1rem;
    }

    .code-example h4 {
      color: #7c3aed;
      margin-bottom: 1rem;
    }

    pre {
      background: #000;
      color: #00ff00;
      padding: 1rem;
      border-radius: 8px;
      overflow-x: auto;
      font-size: 0.85rem;
      line-height: 1.5;
    }

    .btn {
      display: inline-block;
      padding: 0.8rem 2rem;
      background: linear-gradient(135deg, #00e5ff, #7c3aed);
      color: white;
      text-decoration: none;
      border-radius: 25px;
      font-weight: 600;
      transition: all 0.3s;
      border: none;
      cursor: pointer;
    }

    .btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 5px 20px rgba(0, 229, 255, 0.4);
    }

    /* 响应式 */
    @media (max-width: 768px) {
      .sidebar {
        display: none;
      }

      .main-content {
        margin-left: 0;
        padding: 2rem;
      }
    }
  </style>
</head>
<body>
  <!-- 侧边栏导航 -->
  <aside class="sidebar">
    <h2>📚 API 文档</h2>
    <ul>
      ${sidebarHtml}
    </ul>
  </aside>

  <!-- 主内容区 -->
  <main class="main-content">
    <h1>API 文档</h1>
    <p>欢迎使用星算纪 API 平台！以下是所有可用的 API 产品。</p>

    ${apisListHtml}
  </main>
</body>
</html>
  `;
}

// 辅助函数：生成单个 API 的文档
function generateApiDoc(api: any): string {
  const pricingModelText =
    api.pricing_model === "per_token"
      ? "按 Token 计费"
      : api.pricing_model === "per_request"
      ? "按请求计费"
      : "订阅制";

  return `
    <div class="api-card" id="api-${api.slug}">
      <div class="api-header">
        <div class="api-name">${api.name}</div>
        <div class="api-badge">${api.provider}</div>
      </div>

      <div class="api-description">
        ${api.description || "暂无描述"}
      </div>

      <div class="api-meta">
        <div class="meta-item">
          <div class="meta-label">定价模式</div>
          <div class="meta-value">${pricingModelText}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">输入价格</div>
          <div class="meta-value">¥${api.price_input}/千 Token</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">输出价格</div>
          <div class="meta-value">¥${api.price_output}/千 Token</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">速率限制</div>
          <div class="meta-value">${api.rate_limit} 次/分钟</div>
        </div>
      </div>

      <div class="api-endpoint">
        <div class="endpoint-label">API 端点</div>
        <div class="endpoint-url">POST ${api.endpoint_url}</div>
      </div>

      <div class="code-example">
        <h4>📝 调用示例（cURL）</h4>
        <pre>
curl -X POST "${api.endpoint_url}" \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: YOUR_API_KEY" \\
  -d '{
    "model": "${api.slug}",
    "messages": [
      {"role": "user", "content": "你好！"}
    ]
  }'</pre>
      </div>

      <div style="margin-top: 1.5rem;">
        <a href="/apis/${api.slug}" class="btn">查看详情</a>
      </div>
    </div>
  `;
}
