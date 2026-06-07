# 开源项目计划

## 概述
星算纪致力于**开源共建**，我们开放核心组件，与社区共同打造最佳 AI API 平台。

## 开源协议
我们的开源项目采用 **Apache 2.0** 协议（宽松商用协议），您可以：
- ✅ 自由使用、修改、分发
- ✅ 用于商业项目（无需开源您的代码）
- ✅ 专利授权保护
- ✅ 修改后闭源（无需回馈上游）

## 开源项目列表

### 1. xingapis-sdk（多语言 SDK）
**仓库地址**：[github.com/xingapis/xingapis-sdk](https://github.com/xingapis/xingapis-sdk)

**支持语言**：
- ✅ Python（3.8+）
- ✅ JavaScript/TypeScript（ES6+）
- ✅ Go（1.18+）
- ✅ Java（8+）
- ✅ C#（.NET 6+）
- ✅ PHP（7.4+）
- ✅ Rust（1.60+）
- ✅ Swift（5.5+）
- ✅ Kotlin（1.6+）

**功能**：
- 统一的 API 接口
- 自动重试和 错误处理
- 流式响应支持
- 多模型切换
- 异步/同步调用
- 完整类型定义（TypeScript/Python）

**快速开始（Python）**：
```python
pip install xingapis-sdk

from xingapis import XingAPIsClient

client = XingAPIsClient(api_key="YOUR_API_KEY")
response = client.chat.create(
    model="qwen-plus",
    messages=[{"role": "user", "content": "你好！"}]
)
print(response.choices[0].message.content)
```

**快速开始（TypeScript）**：
```typescript
npm install xingapis-sdk

import { XingAPIsClient } from 'xingapis-sdk';

const client = new XingAPIsClient({ apiKey: 'YOUR_API_KEY' });
const response = await client.chat.create({
  model: 'qwen-plus',
  messages: [{ role: 'user', content: '你好！' }],
});
console.log(response.choices[0].message.content);
```

**贡献指南**：
1. Fork 仓库
2. 创建分支（`git checkout -b feature/your-feature`）
3. 提交代码（`git commit -m 'Add some feature'`）
4. 推送分支（`git push origin feature/your-feature`）
5. 创建 Pull Request

**待贡献功能**：
- ✅ 增加 Ruby SDK
- ✅ 增加 Dart/Flutter SDK
- ⏳ 增加 R 语言 SDK
- ⏳ 增加 MATLAB SDK
- ⏳ 优化 TypeScript 类型定义
- ⏳ 增加更多使用示例

---

### 2. xingapis-proxy（API 转发网关）
**仓库地址**：[github.com/xingapis/xingapis-proxy](https://github.com/xingapis/xingapis-proxy)

**功能**：
- 统一的 API 转发（支持 10+ AI 模型）
- 智能路由（根据延迟/成本/可用性自动选择）
- 缓存机制（Redis/内存）
- 速率限制（防止滥用）
- 请求日志和 监控
- 错误处理和 重试
- 支持 Docker 部署

**技术栈**：
- 语言：Go 1.18+
- 框架：Gin
- 缓存：Redis
- 数据库：PostgreSQL
- 部署：Docker + Kubernetes

**快速部署（Docker）**：
```bash
docker run -d \
  --name xingapis-proxy \
  -p 8080:8080 \
  -e BAILIAN_API_KEY=your-bailian-api-key \
  -e REDIS_URL=redis://localhost:6379 \
  xingapis/proxy:latest
```

**配置示例（`config.yaml`）**：
```yaml
server:
  port: 8080

upstreams:
  qwen:
    endpoint: "https://dashscope.aliyuncs.com/api/v1"
    api_key_env: "BAILIAN_API_KEY"
    timeout: 30s

  deepseek:
    endpoint: "https://api.deepseek.com/v1"
    api_key_env: "DEEPSEEK_API_KEY"
    timeout: 30s

cache:
  type: redis
  url: redis://localhost:6379
  ttl: 300s

rate_limit:
  requests_per_minute: 60
  burst: 10
```

**贡献指南**：
- 增加新模型支持（PR 欢迎！）
- 优化路由算法
- 增加更多缓存后端（Memcached、BigCache）
- 增加 Prometheus 监控指标
- 优化错误处理和 重试逻辑

---

### 3. xingapis-dashboard（监控仪表盘）
**仓库地址**：[github.com/xingapis/xingapis-dashboard](https://github.com/xingapis/xingapis-dashboard)

**功能**：
- 实时 API 调用监控（QPS、延迟、错误率）
- Token 使用统计（按模型、按用户）
- 成本分析（按天、按模型）
- 告警通知（邮件、Slack、Webhook）
- 自定义仪表盘（拖拽式）

**技术栈**：
- 前端：Next.js 14 + TypeScript + Tailwind CSS
- 后端：Node.js + Express
- 数据库：PostgreSQL
- 时序数据库：Prometheus
- 可视化：Grafana

**快速部署**：
```bash
git clone https://github.com/xingapis/xingapis-dashboard.git
cd xingapis-dashboard
npm install
npm run dev  # 开发模式，访问 http://localhost:3000
```

**环境变量（`.env.local`）**：
```
DATABASE_URL=postgresql://user:password@localhost:5432/xingapis
PROMETHEUS_URL=http://localhost:9090
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-super-secret-jwt-key
```

**贡献指南**：
- 增加新图表类型
- 增加新通知渠道（钉钉、企业微信、Discord）
- 优化前端性能
- 增加更多自定义选项
- 改进移动端体验

---

### 4. xingapis-cli（命令行工具）
**仓库地址**：[github.com/xingapis/xingapis-cli](https://github.com/xingapis/xingapis-cli)

**功能**：
- 一键部署 API 转发网关
- 测试 API 连接和 延迟
- 生成 API Key 和 管理
- 查看使用统计和 账单
- 配置文件管理

**安装**：
```bash
# macOS/Linux
brew install xingapis/tap/xingapis-cli

# Windows
scoop bucket add xingapis https://github.com/xingapis/scoop-bucket
scoop install xingapis-cli

# Go 安装（跨平台）
go install github.com/xingapis/xingapis-cli@latest
```

**使用示例**：
```bash
# 配置 API Key
xingapis config set api_key YOUR_API_KEY

# 测试 API 连接
xingapis test --model qwen-plus

# 查看使用统计
xingapis stats --month 2026-06

# 生成 API Key
xingapis keys create --name "My API Key"

# 部署转发网关
xingapis deploy proxy --port 8080
```

**贡献指南**：
- 增加新命令
- 优化输出格式（表格、JSON、YAML）
- 增加 Shell 补全（Bash、Zsh、Fish）
- 增加 Windows 原生支持
- 编写更详细的文档

---

### 5. xingapis-examples（示例代码库）
**仓库地址**：[github.com/xingapis/xingapis-examples](https://github.com/xingapis/xingapis-examples)

**包含示例**：
- ✅ 智能客服系统（Python + Flask）
- ✅ AI 写作助手（TypeScript + Next.js）
- ✅ 代码补全插件（VS Code Extension）
- ✅ 智能搜索引擎（Python + FastAPI）
- ✅ 多模态图像处理（Python + Streamlit）
- ✅ 语音转文字（Python + Whisper）
- ✅ 文本嵌入和 语义搜索（Python + Sentence Transformers）
- ✅ AI 翻译工具（Python + Tkinter GUI）

**贡献指南**：
- 提交您的项目示例
- 改进现有示例的文档
- 增加更多语言/框架的示例
- 优化示例代码的结构和 可读性

---

## 贡献者奖励

### 🏆 贡献者排行榜
| 排名 | GitHub 用户 | 贡献数 | 奖励 |
|------|-------------|--------|------|
| 1 | @dev_guru | 128 | MacBook Pro 16" + ¥10,000 |
| 2 | @code_wizard | 95 | iPhone 16 Pro + ¥5,000 |
| 3 | @ai_fan | 72 | AirPods Pro 3 + ¥2,000 |
| 4-10 | ... | 30+ | ¥500 现金 |
| 11-50 | ... | 10+ | ¥100 现金 |
| 50+ | ... | 1+ | ¥50 现金 |

### 🎁 贡献者专属权益
- ✅ 所有贡献者获得 **星算纪贡献者** 徽章
- ✅ 前 10 名获得 **终身免费** API 额度（$100/月）
- ✅ 前 50 名获得 **1 年免费** API 额度（$50/月）
- ✅ 所有贡献者获得 **合作伙伴计划** 白金会员资格
- ✅ 优秀贡献者受邀成为 **官方技术顾问**

## 开源社区活动

### 📅 每月线上 Meetup
- **时间**：每月第一个周六 14:00-16:00（北京时间）
- **形式**：Zoom 会议 + B 站直播
- **内容**：技术分享、项目进展、Q&A
- **报名**：[meetup.xinsuanji.cn](https://meetup.xinsuanji.cn)

### 🏆 黑客松大赛（每季度）
- **奖金池**：¥50,000
- **赛道**：
  - 最佳应用（基于星算纪 API）
  - 最佳工具（开发者工具/SDK）
  - 最佳文档（教程/博客/视频）
- **报名**：[hackathon.xinsuanji.cn](https://hackathon.xinsuanji.cn)

### 💬 社区论坛
- **地址**：[discuss.xinsuanji.cn](https://discuss.xinsuanji.cn)
- **板块**：
  - 技术讨论
  - 项目展示
  - 问题求助
  - 功能建议
  - 开源贡献

## 联系我们

### 开源项目邮箱
📧 opensource@xinsuanji.cn

### 开源项目 GitHub 组织
🔗 [github.com/xingapis](https://github.com/xingapis)

### 开源社区论坛
🔗 [discuss.xinsuanji.cn](https://discuss.xinsuanji.cn)

### 开源贡献者微信群
📱 添加微信 `XingAPIs_OpenSource`，备注"开源贡献"

---

**加入我们，共建开源生态！** 🚀
