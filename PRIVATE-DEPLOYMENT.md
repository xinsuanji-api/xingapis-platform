# 私有部署指南

## 概述
星算纪 API 平台支持私有部署，您可以在自己的服务器或私有云环境中运行整个平台。

## 系统要求

### 最低配置
- CPU：4 核
- 内存：8GB
- 存储：100GB SSD
- 带宽：100Mbps

### 推荐配置
- CPU：8 核
- 内存：16GB
- 存储：500GB SSD
- 带宽：1Gbps

### 软件要求
- 操作系统：Ubuntu 20.04+ / CentOS 7+ / Windows Server 2019+
- Docker：20.10+
- Docker Compose：2.0+
- PostgreSQL：14+（或使用 Supabase）
- Redis：6.0+（可选，用于缓存）

## 部署步骤

### 1. 下载部署包
```bash
# 从官网下载最新部署包
wget https://releases.xinsuanji.cn/private/xingapis-platform-latest.tar.gz

# 解压
tar -xzf xingapis-platform-latest.tar.gz
cd xingapis-platform
```

### 2. 配置环境变量
```bash
# 复制环境变量模板
cp .env.example .env

# 编辑配置
vi .env
```

**关键配置项：**
```env
# 数据库配置
DATABASE_URL=postgresql://user:password@localhost:5432/xingapis

# Redis 配置（可选）
REDIS_URL=redis://localhost:6379

# JWT 密钥（务必修改！）
JWT_SECRET=your-super-secret-jwt-key

# 支付宝配置（可选）
ALIPAY_APP_ID=your-app-id
ALIPAY_PRIVATE_KEY=your-private-key

# 阿里云百炼配置
BAILIAN_API_KEY=your-bailian-api-key

# 域名配置
PUBLIC_URL=https://api.your-company.com
```

### 3. 启动服务
```bash
# 使用 Docker Compose 启动所有服务
docker-compose up -d

# 查看运行状态
docker-compose ps

# 查看日志
docker-compose logs -f
```

### 4. 初始化数据库
```bash
# 运行数据库迁移
docker-compose exec api npm run db:migrate

# 插入种子数据（可选）
docker-compose exec api npm run db:seed
```

### 5. 配置反向代理（Nginx）
```nginx
server {
    listen 80;
    server_name api.your-company.com;

    # 重定向到 HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.your-company.com;

    # SSL 证书
    ssl_certificate /path/to/your/cert.pem;
    ssl_certificate_key /path/to/your/key.pem;

    # API 反向代理
    location / {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 控制台反向代理
    location /console {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### 6. 配置 ICP 备案（如果在中国大陆）
- 在阿里云备案系统提交备案申请
- 备案通过后才能开通 80/443 端口
- 预计时间：20-40 个工作日

## 高级配置

### 高可用部署
```yaml
# docker-compose.ha.yml
version: '3.8'

services:
  api:
    deploy:
      replicas: 3  # 3 个 API 实例
    environment:
      - NODE_ENV=production

  postgres:
    deploy:
      replicas: 1
    volumes:
      - postgres-data:/var/lib/postgresql/data

  redis:
    deploy:
      replicas: 1

  nginx:
    deploy:
      replicas: 2  # 2 个 Nginx 实例（负载均衡）
```

### 监控和日志
```bash
# 安装监控组件
docker-compose -f docker-compose.monitoring.yml up -d

# 包含：
# - Prometheus（指标收集）
# - Grafana（可视化）
# - Loki（日志聚合）
# - Jaeger（链路追踪）
```

### 备份策略
```bash
# 每日自动备份脚本
#!/bin/bash
DATE=$(date +%Y%m%d)
pg_dump -U postgres xingapis > backup-$DATE.sql
gzip backup-$DATE.sql

# 上传到云存储
aws s3 cp backup-$DATE.sql.gz s3://your-bucket/backups/

# 保留最近 30 天
find . -name "backup-*.sql.gz" -mtime +30 -delete
```

## 故障排查

### API 无法访问
```bash
# 检查 API 进程
docker-compose ps api

# 查看 API 日志
docker-compose logs api

# 检查端口占用
netstat -tulpn | grep 8000
```

### 数据库连接有问题
```bash
# 测试数据库连接
docker-compose exec api npm run db:test

# 检查数据库日志
docker-compose logs postgres

# 重置数据库
docker-compose exec postgres psql -U postgres -c "DROP DATABASE xingapis;"
docker-compose exec postgres psql -U postgres -c "CREATE DATABASE xingapis;"
docker-compose exec api npm run db:migrate
```

### 支付回调失败
```bash
# 检查回调 URL 是否可访问
curl https://api.your-company.com/webhook/alipay

# 检查防火墙规则
sudo iptables -L -n

# 查看支付 webhook 日志
docker-compose logs api | grep "payment"
```

## 技术支持

### 企业级 SLA
- **响应时间**：7x24 小时，15 分钟内响应
- **可用性保障**：99.99% 可用性 SLA
- **专属技术支持**：企业客户分配专属技术客户经理

### 联系方式
- **紧急故障**：400-xxx-xxxx（7x24）
- **技术问题**：tech-support@xinsuanji.cn
- **客户经理**：am@xinsuanji.cn

### 培训服务
- **部署培训**：现场或远程部署指导（8 小时）
- **运维培训**：系统运维和故障排查（16 小时）
- **开发培训**：二次开发和定制培训（24 小时）

## 定价

### 私有部署许可证
| 版本 | 价格 | 支持 |
|------|------|------|
| 基础版 | ¥50,000/年 | 社区支持 |
| 标准版 | ¥150,000/年 | 8x5 技术支持 |
| 企业版 | ¥500,000/年 | 7x24 专属支持 + SLA |

### 可选服务
- **部署服务**：¥20,000（一次性）
- **培训服务**：¥10,000/天
- **定制开发**：¥2,000/人天

---

**需要帮助？** 联系我们的企业销售团队：enterprise@xinsuanji.cn
