// Deno Edge Function - 代码示例生成器
// 功能：根据 API 文档自动生成多语言代码示例

import { serve } from "https://deno.land/x/supabase@v1.0.0/functions/index.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// CORS 头
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

interface CodeExampleRequest {
  api_slug: string;
  language: "curl" | "python" | "javascript" | "go" | "java" | "php" | "ruby" | "csharp";
  endpoint_url?: string;
  request_example?: Record<string, unknown>;
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

    const body: CodeExampleRequest = await req.json();

    // 验证必填字段
    if (!body.api_slug || !body.language) {
      return new Response(
        JSON.stringify({ error: "api_slug 和 language 为必填项" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 查询 API 产品
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

    // 生成代码示例
    const endpointUrl = body.endpoint_url || api.endpoint_url;
    const requestExample = body.request_example || {
      model: api.slug,
      messages: [{ role: "user", content: "你好！" }],
    };

    const codeExample = generateCodeExample(
      body.language,
      endpointUrl,
      api,
      requestExample
    );

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          api_name: api.name,
          language: body.language,
          code: codeExample,
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

// 辅助函数：生成代码示例
function generateCodeExample(
  language: string,
  endpointUrl: string,
  api: Record<string, unknown>,
  requestExample: Record<string, unknown>
): string {
  const apiKeyPlaceholder = "YOUR_API_KEY";

  switch (language) {
    case "curl":
      return generateCurlExample(endpointUrl, apiKeyPlaceholder, requestExample);

    case "python":
      return generatePythonExample(endpointUrl, apiKeyPlaceholder, requestExample);

    case "javascript":
      return generateJavaScriptExample(endpointUrl, apiKeyPlaceholder, requestExample);

    case "go":
      return generateGoExample(endpointUrl, apiKeyPlaceholder, requestExample);

    case "java":
      return generateJavaExample(endpointUrl, apiKeyPlaceholder, requestExample);

    case "php":
      return generatePhpExample(endpointUrl, apiKeyPlaceholder, requestExample);

    case "ruby":
      return generateRubyExample(endpointUrl, apiKeyPlaceholder, requestExample);

    case "csharp":
      return generateCSharpExample(endpointUrl, apiKeyPlaceholder, requestExample);

    default:
      throw new Error(`不支持的语言: ${language}`);
  }
}

// cURL 示例
function generateCurlExample(
  endpointUrl: string,
  apiKey: string,
  requestExample: Record<string, unknown>
): string {
  return `curl -X POST "${endpointUrl}" \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: ${apiKey}" \\
  -d '${JSON.stringify(requestExample, null, 2).replace(/'/g, "'\\''")}'`;
}

// Python 示例
function generatePythonExample(
  endpointUrl: string,
  apiKey: string,
  requestExample: Record<string, unknown>
): string {
  return `import requests
import json

url = "${endpointUrl}"
headers = {
    "Content-Type": "application/json",
    "x-api-key": "${apiKey}"
}
data = ${JSON.stringify(requestExample, null, 4)
    .replace(/"(\w+)":/g, "$1:")  // 转换为 Python 字典格式
    .replace(/true/g, "True")
    .replace(/false/g, "False")
    .replace(/null/g, "None")}

response = requests.post(url, headers=headers, json=data)
print(json.dumps(response.json(), indent=2, ensure_ascii=False))`;
}

// JavaScript 示例
function generateJavaScriptExample(
  endpointUrl: string,
  apiKey: string,
  requestExample: Record<string, unknown>
): string {
  return `const axios = require('axios');

const url = '${endpointUrl}';
const headers = {
  'Content-Type': 'application/json',
  'x-api-key': '${apiKey}'
};
const data = ${JSON.stringify(requestExample, null, 2)};

axios.post(url, data, { headers })
  .then(response => console.log(JSON.stringify(response.data, null, 2)))
  .catch(error => console.error(error));`;
}

// Go 示例
function generateGoExample(
  endpointUrl: string,
  apiKey: string,
  requestExample: Record<string, unknown>
): string {
  return `package main

import (
    "bytes"
    "encoding/json"
    "fmt"
    "io/ioutil"
    "net/http"
)

type RequestBody struct {
    Model    string    \`json:"model"\`
    Messages []Message \`json:"messages"\`
}

type Message struct {
    Role    string \`json:"role"\`
    Content string \`json:"content"\`
}

func main() {
    url := "${endpointUrl}"
    apiKey := "${apiKey}"

    requestBody := RequestBody{
        Model: "${api.slug}",
        Messages: []Message{
            {Role: "user", Content: "你好！"},
        },
    }

    bodyBytes, _ := json.Marshal(requestBody)
    req, _ := http.NewRequest("POST", url, bytes.NewBuffer(bodyBytes))
    req.Header.Set("Content-Type", "application/json")
    req.Header.Set("x-api-key", apiKey)

    client := &http.Client{}
    resp, err := client.Do(req)
    if err != nil {
        fmt.Println("Error:", err)
        return
    }
    defer resp.Body.Close()

    body, _ := ioutil.ReadAll(resp.Body)
    fmt.Println(string(body))
}`;
}

// Java 示例
function generateJavaExample(
  endpointUrl: string,
  apiKey: string,
  requestExample: Record<string, unknown>
): string {
  return `import okhttp3.*;
import java.io.IOException;

public class Main {
    public static void main(String[] args) throws IOException {
        OkHttpClient client = new OkHttpClient();

        MediaType JSON = MediaType.parse("application/json; charset=utf-8");
        String json = "${JSON.stringify(requestExample).replace(/"/g, '\\"')}";
        RequestBody body = RequestBody.create(JSON, json);

        Request request = new Request.Builder()
            .url("${endpointUrl}")
            .post(body)
            .addHeader("Content-Type", "application/json")
            .addHeader("x-api-key", "${apiKey}")
            .build();

        try (Response response = client.newCall(request).execute()) {
            if (response.isSuccessful() && response.body() != null) {
                System.out.println(response.body().string());
            }
        }
    }
}`;
}

// PHP 示例
function generatePhpExample(
  endpointUrl: string,
  apiKey: string,
  requestExample: Record<string, unknown>
): string {
  return `<?php

$url = '${endpointUrl}';
$apiKey = '${apiKey}';

$data = array(
    'model' => '${api.slug}',
    'messages' => array(
        array('role' => 'user', 'content' => '你好！')
    )
);

$headers = array(
    'Content-Type: application/json',
    'x-api-key: ' . $apiKey
);

$ch = curl_init($url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);

$response = curl_exec($ch);
curl_close($ch);

echo $response;
?>`;
}

// Ruby 示例
function generateRubyExample(
  endpointUrl: string,
  apiKey: string,
  requestExample: Record<string, unknown>
): string {
  return `require 'net/http'
require 'json'

url = URI.parse('${endpointUrl}')
api_key = '${apiKey}'

data = {
  model: '${api.slug}',
  messages: [
    { role: 'user', content: '你好！' }
  ]
}

http = Net::HTTP.new(url.host, url.port)
http.use_ssl = (url.scheme == 'https')

request = Net::HTTP::Post.new(url.request_uri)
request['Content-Type'] = 'application/json'
request['x-api-key'] = api_key
request.body = data.to_json

response = http.request(request)
puts response.body`;
}

// C# 示例
function generateCSharpExample(
  endpointUrl: string,
  apiKey: string,
  requestExample: Record<string, unknown>
): string {
  return `using System;
using System.Net.Http;
using System.Text;
using System.Text.Json;

namespace ApiExample
{
    class Program
    {
        static async Task Main(string[] args)
        {
            var url = "${endpointUrl}";
            var apiKey = "${apiKey}";

            using (var client = new HttpClient())
            {
                client.DefaultRequestHeaders.Add("x-api-key", apiKey);

                var data = new
                {
                    model = "${api.slug}",
                    messages = new[]
                    {
                        new { role = "user", content = "你好！" }
                    }
                };

                var json = JsonSerializer.Serialize(data);
                var content = new StringContent(json, Encoding.UTF8, "application/json");

                var response = await client.PostAsync(url, content);
                var responseBody = await response.Content.ReadAsStringAsync();

                Console.WriteLine(responseBody);
            }
        }
    }
}`;
}
