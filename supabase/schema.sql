-- 星算纪 API 平台数据库 Schema
-- 版本: v1.0
-- 日期: 2026-06-07

-- ============================================
-- 1. 用户表 (已存在 Supabase Auth，这里创建扩展表)
-- ============================================

-- 用户配置文件表
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE,
  full_name TEXT,
  avatar_url TEXT,
  website TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 启用 RLS (行级安全)
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- 用户只能查看和修改自己的资料
CREATE POLICY "Users can view own profile" 
  ON public.user_profiles FOR SELECT 
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" 
  ON public.user_profiles FOR UPDATE 
  USING (auth.uid() = id);

-- ============================================
-- 2. API Keys 表
-- ============================================

CREATE TABLE IF NOT EXISTS public.api_keys (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  key_hash TEXT UNIQUE NOT NULL,  -- API Key 的哈希值（不存储明文）
  key_prefix TEXT NOT NULL,  -- API Key 前缀（用于显示，如 "sk_live_abc..."）
  permissions TEXT[] DEFAULT '{}',  -- 权限列表
  rate_limit INT DEFAULT 1000,  -- 每分钟请求数限制
  quota_total BIGINT DEFAULT 1000000,  -- 总配额（Token 数）
  quota_used BIGINT DEFAULT 0,  -- 已使用配额
  is_active BOOLEAN DEFAULT TRUE,
  expires_at TIMESTAMP WITH TIME ZONE,  -- 过期时间（可选）
  last_used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 启用 RLS
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

-- 用户只能管理自己的 API Keys
CREATE POLICY "Users can manage own api keys" 
  ON public.api_keys FOR ALL 
  USING (auth.uid() = user_id);

-- 索引
CREATE INDEX idx_api_keys_user_id ON public.api_keys(user_id);
CREATE INDEX idx_api_keys_key_hash ON public.api_keys(key_hash);

-- ============================================
-- 3. API 产品表
-- ============================================

CREATE TABLE IF NOT EXISTS public.api_products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  category TEXT,  -- 分类：ai, data, utility, etc.
  provider TEXT,  -- 供应商：aliyun, deepseek, openai, etc.
  endpoint_url TEXT NOT NULL,  -- 转发目标 URL
  pricing_model TEXT DEFAULT 'per_token',  -- 计费模式：per_token, per_request, subscription
  price_input DECIMAL(10, 6) DEFAULT 0,  -- 输入价格（元/千 Token）
  price_output DECIMAL(10, 6) DEFAULT 0,  -- 输出价格（元/千 Token）
  currency TEXT DEFAULT 'CNY',
  is_active BOOLEAN DEFAULT TRUE,
  is_premium BOOLEAN DEFAULT FALSE,  -- 是否需要付费套餐
  rate_limit INT DEFAULT 60,  -- 每分钟请求数限制
  timeout_ms INT DEFAULT 30000,  -- 超时时间（毫秒）
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_api_products_slug ON public.api_products(slug);
CREATE INDEX idx_api_products_category ON public.api_products(category);

-- ============================================
-- 4. 套餐表
-- ============================================

CREATE TABLE IF NOT EXISTS public.plans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  price DECIMAL(10, 2) NOT NULL,  -- 价格（元）
  billing_cycle TEXT DEFAULT 'monthly',  -- 计费周期：monthly, yearly, one_time
  quota_total BIGINT DEFAULT 0,  -- 总配额（Token 数）
  quota_per_request INT DEFAULT 1000,  -- 每次请求配额
  rate_limit INT DEFAULT 1000,  -- 每分钟请求数限制
  allowed_apis TEXT[] DEFAULT '{}',  -- 允许的 API 列表（空 = 全部）
  is_active BOOLEAN DEFAULT TRUE,
  is_featured BOOLEAN DEFAULT FALSE,  -- 是否推荐
  sort_order INT DEFAULT 0,  -- 排序权重
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- 5. 订阅表（用户购买的套餐）
-- ============================================

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  plan_id UUID REFERENCES public.plans(id) ON DELETE CASCADE NOT NULL,
  status TEXT DEFAULT 'active',  -- 状态：active, cancelled, expired, past_due
  current_period_start TIMESTAMP WITH TIME ZONE NOT NULL,
  current_period_end TIMESTAMP WITH TIME ZONE NOT NULL,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  payment_provider TEXT,  -- 支付提供商：alipay, wechat
  payment_id TEXT,  -- 支付订单 ID
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 启用 RLS
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- 用户只能查看自己的订阅
CREATE POLICY "Users can view own subscriptions" 
  ON public.subscriptions FOR SELECT 
  USING (auth.uid() = user_id);

-- 索引
CREATE INDEX idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON public.subscriptions(status);

-- ============================================
-- 6. API 调用日志表
-- ============================================

CREATE TABLE IF NOT EXISTS public.api_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  api_key_id UUID REFERENCES public.api_keys(id) ON DELETE SET NULL,
  api_product_id UUID REFERENCES public.api_products(id) ON DELETE SET NULL,
  endpoint TEXT NOT NULL,
  method TEXT DEFAULT 'POST',
  request_headers JSONB,
  request_body JSONB,
  response_status INT,
  response_headers JSONB,
  response_body JSONB,
  tokens_input INT DEFAULT 0,
  tokens_output INT DEFAULT 0,
  tokens_total INT DEFAULT 0,
  cost DECIMAL(10, 6) DEFAULT 0,  -- 成本（元）
  latency_ms INT,  -- 延迟（毫秒）
  ip_address INET,
  user_agent TEXT,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 启用 RLS
ALTER TABLE public.api_logs ENABLE ROW LEVEL SECURITY;

-- 用户只能查看自己的日志
CREATE POLICY "Users can view own api logs" 
  ON public.api_logs FOR SELECT 
  USING (auth.uid() = user_id);

-- 索引（用于查询和统计）
CREATE INDEX idx_api_logs_user_id ON public.api_logs(user_id);
CREATE INDEX idx_api_logs_api_key_id ON public.api_logs(api_key_id);
CREATE INDEX idx_api_logs_created_at ON public.api_logs(created_at);
CREATE INDEX idx_api_logs_endpoint ON public.api_logs(endpoint);

-- ============================================
-- 7. 支付订单表
-- ============================================

CREATE TABLE IF NOT EXISTS public.orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  plan_id UUID REFERENCES public.plans(id) ON DELETE SET NULL,
  amount DECIMAL(10, 2) NOT NULL,
  currency TEXT DEFAULT 'CNY',
  status TEXT DEFAULT 'pending',  -- 状态：pending, paid, failed, refunded
  payment_provider TEXT,  -- 支付提供商：alipay, wechat
  payment_id TEXT,  -- 支付订单 ID
  paid_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 启用 RLS
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- 用户只能查看自己的订单
CREATE POLICY "Users can view own orders" 
  ON public.orders FOR SELECT 
  USING (auth.uid() = user_id);

-- 索引
CREATE INDEX idx_orders_user_id ON public.orders(user_id);
CREATE INDEX idx_orders_status ON public.orders(status);

-- ============================================
-- 8. 插入默认数据
-- ============================================

-- 插入示例 API 产品
INSERT INTO public.api_products (name, slug, description, category, provider, endpoint_url, price_input, price_output)
VALUES 
  ('通义千问 Plus', 'qwen-plus', '阿里云通义千问 Plus 模型', 'ai', 'aliyun', 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation', 0.004, 0.004),
  ('DeepSeek-V3', 'deepseek-v3', 'DeepSeek V3 模型', 'ai', 'deepseek', 'https://api.deepseek.com/chat/completions', 0.001, 0.002),
  ('文心一言 4.0', 'ernie-4.0', '百度文心一言 4.0 模型', 'ai', 'baidu', 'https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/chat/completions', 0.008, 0.008)
ON CONFLICT (slug) DO NOTHING;

-- 插入示例套餐
INSERT INTO public.plans (name, slug, description, price, billing_cycle, quota_total, rate_limit, is_featured)
VALUES 
  ('免费版', 'free', '免费试用，每月 1000 次请求', 0.00, 'monthly', 100000, 100, TRUE),
  ('基础版', 'basic', '适合个人开发者', 49.00, 'monthly', 1000000, 1000, FALSE),
  ('专业版', 'pro', '适合小型团队', 199.00, 'monthly', 5000000, 5000, TRUE),
  ('企业版', 'enterprise', '适合企业用户', 999.00, 'monthly', 50000000, 50000, FALSE)
ON CONFLICT (slug) DO NOTHING;

-- ============================================
-- 9. 创建有用的函数
-- ============================================

-- 函数：更新 updated_at 字段
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 为需要的表创建 updated_at 触发器
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.api_keys
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.api_products
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 函数：自动创建用户配置文件
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, username)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'username');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 触发器：新用户注册时自动创建配置文件
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- 完成
-- ============================================

COMMENT ON TABLE public.user_profiles IS '用户配置文件';
COMMENT ON TABLE public.api_keys IS '用户 API 密钥';
COMMENT ON TABLE public.api_products IS 'API 产品目录';
COMMENT ON TABLE public.plans IS '套餐方案';
COMMENT ON TABLE public.subscriptions IS '用户订阅记录';
COMMENT ON TABLE public.api_logs IS 'API 调用日志';
COMMENT ON TABLE public.orders IS '支付订单';

-- 成功
SELECT 'Database schema created successfully!' AS result;
