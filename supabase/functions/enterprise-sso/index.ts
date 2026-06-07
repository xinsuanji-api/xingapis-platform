// Deno Edge Function - 企业 SSO (SAML/OAuth)
// 功能：支持企业级单点登录

import { serve} from "https://deno.land/x/supabase@v1.0.0/functions/index.ts";
import { createClient} from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface SSORquest {
  user_id: string;
  provider: "saml" | "oauth2" | "oidc";
  domain?: string;  // 企业域名（用于自动发现 SSO 配置）
}

interface SSORsponse {
  sso_url: string;  // 重定向到企业 SSO 登录页
  state: string;     // CSRF 保护
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

    const body: SSORquest = await req.json();

    if (!body.user_id || !body.provider) {
      return new Response(
        JSON.stringify({ error: "user_id 和 provider 为必填项" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. 查询用户的 SSO 配置
    const { data: ssoConfig, error: configError } = await supabaseClient
      .from("enterprise_sso")
      .select("*")
      .eq("user_id", body.user_id)
      .eq("provider", body.provider)
      .single();

    if (configError || !ssoConfig) {
      return new Response(
        JSON.stringify({ error: "未找到 SSO 配置，请先配置企业 SSO" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. 根据 provider 类型生成 SSO URL
    let ssoUrl = "";
    let state = generateStateToken();

    switch (body.provider) {
      case "saml":
        ssoUrl = await generateSAMLUrl(ssoConfig, state);
        break;
      case "oauth2":
        ssoUrl = await generateSAMLUrl(ssoConfig, state);  // 简化：使用相同函数
        break;
      case "oidc":
        ssoUrl = await generateOIDUrl(ssoConfig, state);
        break;
      default:
        throw new Error(`不支持的 SSO 提供商: ${body.provider}`);
    }

    // 3. 存储 state 用于后续验证
    await supabaseClient.from("sso_states").insert({
      state,
      user_id: body.user_id,
      provider: body.provider,
      expires_at: new Date(Date.now() + 600000).toISOString(),  // 10 分钟过期
    });

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          sso_url: ssoUrl,
          state,
          expires_in: 600,
        } as SSORsponse,
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

// 辅助函数：生成 SAML URL
async function generateSAMLUrl(config: Record<string, unknown>, state: string): Promise<string> {
  const samlEndpoint = config.saml_endpoint as string;
  const spEntityId = Deno.env.get("SAML_SP_ENTITY_ID") || "https://api.xinsuanji.cn/sso/saml";
  const acsUrl = `${Deno.env.get("PUBLIC_URL") || "https://api.xinsuanji.cn"}/sso/saml/acs`;

  // 构建 SAML AuthnRequest（简化版）
  const samlRequest = `
    <samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
      ID="${state}"
      Version="2.0"
      IssueInstant="${new Date().toISOString()}"
      Destination="${samlEndpoint}"
      AssertionConsumerServiceURL="${acsUrl}">
      <saml:Issuer xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">${spEntityId}</saml:Issuer>
    </samlp:AuthnRequest>
  `;

  // Base64 编码
  const encodedRequest = btoa(samlRequest);
  return `${samlEndpoint}?SAMLRequest=${encodeURIComponent(encodedRequest)}`;
}

// 辅助函数：生成 OIDC URL
async function generateOIDUrl(config: Record<string, unknown>, state: string): Promise<string> {
  const oidEndpoint = config.oidc_endpoint as string;
  const clientId = config.client_id as string;
  const redirectUri = `${Deno.env.get("PUBLIC_URL") || "https://api.xinsuanji.cn"}/sso/oidc/callback`;

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    scope: "openid profile email",
  });

  return `${oidEndpoint}?${params.toString()}`;
}

// 辅助函数：生成 state token（CSRF 保护）
function generateStateToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
