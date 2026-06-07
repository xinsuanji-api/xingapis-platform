-- 星算纪平台 - 追加模型数据
-- 在 Supabase Dashboard > SQL Editor 中执行此文件

-- 先清空现有模型（可选，首次执行请注释掉）
-- TRUNCATE models CASCADE;

-- DeepSeek 系列
INSERT INTO models (model_id, display_name, provider, input_price_per_1k, output_price_per_1k, status) VALUES
('deepseek-v3',        'DeepSeek V3',       'deepseek', 0.00014, 0.00028, 'active'),
('deepseek-r1',        'DeepSeek R1',       'deepseek', 0.00400, 0.01600, 'active'),
('deepseek-r1-lite',   'DeepSeek R1 Lite',  'deepseek', 0.00140, 0.00560, 'active'),
('deepseek-coder-v2',  'DeepSeek Coder V2', 'deepseek', 0.00014, 0.00028, 'active')
ON CONFLICT (model_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  input_price_per_1k = EXCLUDED.input_price_per_1k,
  output_price_per_1k = EXCLUDED.output_price_per_1k,
  status = EXCLUDED.status;

-- 阿里云百炼 Qwen 系列
INSERT INTO models (model_id, display_name, provider, input_price_per_1k, output_price_per_1k, status) VALUES
('qwen3-235b',      'Qwen3-235B-A22B', 'qwen', 0.00050, 0.00150, 'active'),
('qwen3-32b',       'Qwen3-32B',       'qwen', 0.00018, 0.00055, 'active'),
('qwen3-14b',       'Qwen3-14B',       'qwen', 0.00010, 0.00030, 'active'),
('qwen3-8b',        'Qwen3-8B',        'qwen', 0.00005, 0.00015, 'active'),
('qwen-max',         'Qwen-Max',         'qwen', 0.04000, 0.12000, 'active'),
('qwen-plus',        'Qwen-Plus',        'qwen', 0.00040, 0.00120, 'active'),
('qwen-turbo',      'Qwen-Turbo',      'qwen', 0.00040, 0.00040, 'active'),
('qwen-long',        'Qwen-Long',        'qwen', 0.00050, 0.00200, 'active'),
('qwen-vl-max',     'Qwen-VL-Max',     'qwen', 0.04000, 0.12000, 'active'),
('qwen-audio-turbo', 'Qwen-Audio-Turbo', 'qwen', 0.00040, 0.00040, 'active')
ON CONFLICT (model_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  input_price_per_1k = EXCLUDED.input_price_per_1k,
  output_price_per_1k = EXCLUDED.output_price_per_1k,
  status = EXCLUDED.status;

-- OpenAI 系列
INSERT INTO models (model_id, display_name, provider, input_price_per_1k, output_price_per_1k, status) VALUES
('gpt-4o',             'GPT-4o',             'openai', 0.00275, 0.00825, 'active'),
('gpt-4o-mini',        'GPT-4o-mini',        'openai', 0.00015, 0.00060, 'active'),
('gpt-4-turbo',        'GPT-4-Turbo',        'openai', 0.01000, 0.03000, 'active'),
('gpt-4',              'GPT-4',              'openai', 0.03000, 0.06000, 'active'),
('gpt-3.5-turbo',     'GPT-3.5-Turbo',     'openai', 0.00050, 0.00150, 'active'),
('text-embedding-3-small',  'Text-Embedding-3-Small', 'openai', 0.00010, 0.00000, 'active'),
('text-embedding-3-large', 'Text-Embedding-3-Large', 'openai', 0.00013, 0.00000, 'active'),
('dall-e-3',           'DALL-E 3',          'openai', 0.04000, 0.04000, 'active'),
('whisper-1',          'Whisper-1',         'openai', 0.00010, 0.00000, 'active')
ON CONFLICT (model_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  input_price_per_1k = EXCLUDED.input_price_per_1k,
  output_price_per_1k = EXCLUDED.output_price_per_1k,
  status = EXCLUDED.status;

-- Anthropic Claude 系列
INSERT INTO models (model_id, display_name, provider, input_price_per_1k, output_price_per_1k, status) VALUES
('claude-3-5-sonnet-latest', 'Claude 3.5 Sonnet',  'anthropic', 0.00300, 0.01500, 'active'),
('claude-3-5-haiku-latest', 'Claude 3.5 Haiku',  'anthropic', 0.00100, 0.00500, 'active'),
('claude-3-opus-latest',    'Claude 3 Opus',     'anthropic', 0.01500, 0.07500, 'active'),
('claude-3-sonnet-latest',  'Claude 3 Sonnet',   'anthropic', 0.00300, 0.01500, 'active'),
('claude-3-haiku-latest',  'Claude 3 Haiku',   'anthropic', 0.00025, 0.00125, 'active')
ON CONFLICT (model_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  input_price_per_1k = EXCLUDED.input_price_per_1k,
  output_price_per_1k = EXCLUDED.output_price_per_1k,
  status = EXCLUDED.status;

-- Google Gemini 系列
INSERT INTO models (model_id, display_name, provider, input_price_per_1k, output_price_per_1k, status) VALUES
('gemini-2.0-flash',      'Gemini 2.0 Flash',         'google', 0.00010, 0.00060, 'active'),
('gemini-1.5-pro',        'Gemini 1.5 Pro',           'google', 0.00125, 0.00375, 'active'),
('gemini-1.5-flash',      'Gemini 1.5 Flash',        'google', 0.00007, 0.00030, 'active'),
('gemini-1.5-pro-vision', 'Gemini 1.5 Pro Vision',   'google', 0.00125, 0.00375, 'active'),
('text-embedding-004',     'Text-Embedding-004',      'google', 0.00001, 0.00000, 'active')
ON CONFLICT (model_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  input_price_per_1k = EXCLUDED.input_price_per_1k,
  output_price_per_1k = EXCLUDED.output_price_per_1k,
  status = EXCLUDED.status;

-- 检查插入结果
SELECT model_id, display_name, provider, input_price_per_1k, output_price_per_1k
FROM models
WHERE status = 'active'
ORDER BY provider, input_price_per_1k;