// Deno Edge Function - API 详情页
// 功能：动态渲染单个 API 的详细信息页面

import { serve } from "https://deno.land/x/supabase@v1.0.0/functions/index.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// CORS 头
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
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

    // 从 URL 路径获取 API slug
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    const apiSlug = pathParts[pathParts.length - 1];

    if (!apiSlug) {
      return new Response("API slug not provided", {
        status: 400,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    // 查询 API 产品
    const { data: api, error } = await supabaseClient
      .from("api_products")
      .select("*")
      .eq("slug", apiSlug)
      .eq("is_active", true)
      .single();

    if (error || !api) {
      return new Response(`API 产品不存在: ${apiSlug}`, {
        status: 404,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // 生成 HTML 页面
    const html = generateApiDetailHtml(api);

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

// 辅助函数：生成 API 详情页 HTML
function generateApiDetailHtml(api: any): string {
  const pricingModelText =
    api.pricing_model === "per_token"
      ? "按 Token 计费"
      : api.pricing_model === "per_request"
      ? "按请求计费"
      : "订阅制";

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${api.name} - API 详情 - 星算纪 API 平台</title>
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
      min-height: 100vh;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 3rem 2rem;
    }

    .back-link {
      display: inline-block;
      color: #00e5ff;
      text-decoration: none;
      margin-bottom: 2rem;
      transition: all 0.3s;
    }

    .back-link:hover {
      color: #7c3aed;
    }

    .api-header {
      background: rgba(15, 23, 42, 0.8);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(0, 229, 255, 0.2);
      border-radius: 16px;
      padding: 3rem;
      margin-bottom: 3rem;
      text-align: center;
    }

    .api-name {
      font-size: 3rem;
      color: #00e5ff;
      margin-bottom: 1rem;
      text-shadow: 0 0 20px rgba(0, 229, 255, 0.5);
    }

    .api-badge {
      display: inline-block;
      background: linear-gradient(135deg, #7c3aed, #a78bfa);
      color: white;
      padding: 0.5rem 1.5rem;
      border-radius: 20px;
      font-size: 1rem;
      margin-bottom: 1.5rem;
    }

    .api-description {
      font-size: 1.2rem;
      color: #94a3b8;
      max-width: 800px;
      margin: 0 auto;
      line-height: 1.8;
    }

    .api-meta {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 2rem;
      margin-bottom: 3rem;
    }

    .meta-card {
      background: rgba(15, 23, 42, 0.8);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(0, 229, 255, 0.2);
      border-radius: 16px;
      padding: 2rem;
      text-align: center;
      transition: all 0.3s;
    }

    .meta-card:hover {
      border-color: #00e5ff;
      box-shadow: 0 0 30px rgba(0, 229, 255, 0.3);
      transform: translateY(-5px);
    }

    .meta-label {
      color: #64748b;
      font-size: 0.9rem;
      margin-bottom: 0.5rem;
    }

    .meta-value {
      color: #00e5ff;
      font-size: 1.8rem;
      font-weight: 700;
    }

    .section {
      background: rgba(15, 23, 42, 0.8);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(0, 229, 255, 0.2);
      border-radius: 16px;
      padding: 2.5rem;
      margin-bottom: 3rem;
    }

    .section-title {
      font-size: 2rem;
      color: #7c3aed;
      margin-bottom: 2rem;
      padding-bottom: 1rem;
      border-bottom: 2px solid rgba(124, 58, 237, 0.3);
    }

    .endpoint-box {
      background: rgba(0, 0, 0, 0.3);
      padding: 1.5rem;
      border-radius: 8px;
      margin-bottom: 2rem;
      border: 1px solid rgba(0, 229, 255, 0.1);
    }

    .endpoint-label {
      color: #64748b;
      font-size: 0.85rem;
      margin-bottom: 0.5rem;
    }

    .endpoint-url {
      color: #00e5ff;
      font-family: "Courier New", monospace;
      font-size: 1rem;
      word-break: break-all;
    }

    .code-example {
      background: #0f172a;
      border-radius: 8px;
      padding: 2rem;
      margin-top: 1.5rem;
    }

    .code-example h4 {
      color: #7c3aed;
      margin-bottom: 1rem;
      font-size: 1.2rem;
    }

    pre {
      background: #000;
      color: #00ff00;
      padding: 1.5rem;
      border-radius: 8px;
      overflow-x: auto;
      font-size: 0.9rem;
      line-height: 1.5;
    }

    .btn {
      display: inline-block;
      padding: 1rem 3rem;
      background: linear-gradient(135deg, #00e5ff, #7c3aed);
      color: white;
      text-decoration: none;
      border-radius: 25px;
      font-weight: 600;
      font-size: 1.1rem;
      transition: all 0.3s;
      border: none;
      cursor: pointer;
      margin-top: 1rem;
    }

    .btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 5px 20px rgba(0, 229, 255, 0.4);
    }

    .warning-box {
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.3);
      border-radius: 8px;
      padding: 1.5rem;
      margin-top: 2rem;
    }

    .warning-title {
      color: #ef4444;
      font-weight: 600;
      margin-bottom: 0.5rem;
    }

    .warning-text {
      color: #94a3b8;
      font-size: 0.9rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <a href="/docs" class="back-link">← 返回 API 文档列表</a>

    <div class="api-header">
      <div class="api-name">${api.name}</div>
      <div class="api-badge">${api.provider}</div>
      <div class="api-description">${api.description || "暂无描述"}</div>
    </div>

    <div class="api-meta">
      <div class="meta-card">
        <div class="meta-label">定价模式</div>
        <div class="meta-value">${pricingModelText}</div>
      </div>
      <div class="meta-card">
        <div class="meta-label">输入价格</div>
        <div class="meta-value">¥${api.price_input}/千 Token</div>
      </div>
      <div class="meta-card">
        <div class="meta-label">输出价格</div>
        <div class="meta-value">¥${api.price_output}/千 Token</div>
      </div>
      <div class="meta-card">
        <div class="meta-label">速率限制</div>
        <div class="meta-value">${api.rate_limit} 次/分钟</div>
      </div>
    </div>

    <div class="section">
      <h3 class="section-title">📍 API 端点</h3>
      <div class="endpoint-box">
        <div class="endpoint-label">请求方法</div>
        <div class="endpoint-url">POST</div>
      </div>
      <div class="endpoint-box">
        <div class="endpoint-label">端点 URL</div>
        <div class="endpoint-url">${api.endpoint_url}</div>
      </div>
    </div>

    <div class="section">
      <h3 class="section-title">💻 调用示例</h3>
      
      <div class="code-example">
        <h4>📝 cURL 示例</h4>
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

      <div class="code-example">
        <h4>🐍 Python 示例</h4>
        <pre>
import requests
import json

url = "${api.endpoint_url}"
headers = {
    "Content-Type": "application/json",
    "x-api-key": "YOUR_API_KEY"
}
data = {
    "model": "${api.slug}",
    "messages": [
        {"role": "user", "content": "你好！"}
    ]
}

response = requests.post(url, headers=headers, json=data)
print(json.dumps(response.json(), indent=2, ensure_ascii=False))</pre>
      </div>

      <div class="code-example">
        <h4>🟢 Node.js 示例</h4>
        <pre>
const axios = require('axios');

const url = '${api.endpoint_url}';
const headers = {
  'Content-Type': 'application/json',
  'x-api-key': 'YOUR_API_KEY'
};
const data = {
  model: '${api.slug}',
  messages: [
    { role: 'user', content: '你好！' }
  ]
};

axios.post(url, data, { headers })
  .then(response => console.log(JSON.stringify(response.data, null, 2)))
  .catch(error => console.error(error));</pre>
      </div>
    </div>

    <div class="section">
      <h3 class="section-title">🚀 开始使用</h3>
      <p style="color: #94a3b8; margin-bottom: 1.5rem; line-height: 1.8;">
        1. 注册并登录星算纪 API 平台<br>
        2. 在控制台创建 API Key<br>
        3. 选择套餐并支付<br>
        4. 使用 API Key 调用接口
      </p>
      <a href="/pricing" class="btn">查看套餐</a>
      <a href="/login" class="btn" style="margin-left: 1rem; background: linear-gradient(135deg, #7c3aed, #a78bfa);">立即注册</a>
    </div>

    <div class="warning-box">
      <div class="warning-title">⚠️ 注意事项</div>
      <div class="warning-text">
        <p>• 请妥善保管您的 API Key，不要泄露给他人</p>
        <p>• 调用 API 会消耗配额，请在控制台查看用量</p>
        <p>• 如有问题，请联系客服：979122618@qq.com</p>
      </div>
    </div>
  </div>
</body>
</html>
  `;
}
