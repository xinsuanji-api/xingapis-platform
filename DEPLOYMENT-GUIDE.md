# 星算纪 API 平台 - GitHub Pages 部署指南

## 📦 项目信息
- **项目路径**：`C:\Users\Windows\.qclaw\workspace\xingapis-platform`
- **总文件数**：41 个功能模块
- **总代码量**：310.7 KB
- **技术栈**：HTML5 + CSS3 + JavaScript (前端) + Supabase (后端)

---

## 🚀 部署到 GitHub Pages - 完整步骤

### **步骤 1：安装 Git（如果尚未安装）**

#### 方法 A：官网下载（推荐）
1. 访问：https://git-scm.com/download/win
2. 下载 **64-bit Git for Windows Setup**
3. 运行安装程序，**全部默认选项**即可
4. 安装完成后，**重启电脑**（重要！）

#### 方法 B：使用 winget（命令行）
```powershell
# 以管理员身份打开 PowerShell
# Win + X → Windows PowerShell (管理员)

winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements
```

#### 验证安装
```bash
git --version
# 应该显示：git version 2.54.0.windows.1
```

---

### **步骤 2：创建 GitHub 仓库**

#### 方法 A：GitHub 网站（最简单）
1. 访问：https://github.com/new
2. **Repository name**：`xingapis-platform`（或 `xinsuanji-api-platform`）
3. **Description**：`星算纪 AI API 平台 - 支持 Qwen、DeepSeek、文心一言`
4. 选择 **Public**（GitHub Pages 需要公开仓库）
5. ✅ 勾选 **Add a README file**
6. 点击 **Create repository**

#### 方法 B：使用 GitHub CLI（如果已安装）
```bash
# 安装 GitHub CLI
winget install --id GitHub.cli

# 登录 GitHub
gh auth login

# 创建仓库
gh repo create xingapis-platform --public --source=. --remote=origin --push
```

---

### **步骤 3：初始化本地 Git 仓库**

打开 **命令提示符** 或 **PowerShell**：

```bash
# 进入项目目录
cd C:\Users\Windows\.qclaw\workspace\xingapis-platform

# 初始化 Git 仓库
git init

# 添加所有文件到暂存区
git add .

# 创建首次提交
git commit -m "🎉 初始提交：星算纪 API 平台 v1.0

- ✅ P0 核心功能（13 个模块，117.4KB）
- ✅ P1 差异化功能（8 个功能，79.2KB）
- ✅ P2 高级功能（12 个功能，70.0KB）
- ✅ P3 生态系统（8 个功能，44.1KB）
- 总计：41 个功能模块，310.7KB 代码"

# 重命名分支为 main（GitHub 默认）
git branch -M main
```

---

### **步骤 4：连接 GitHub 仓库并推送**

```bash
# 添加远程仓库（替换 YOUR_USERNAME 为您的 GitHub 用户名）
git remote add origin https://github.com/YOUR_USERNAME/xingapis-platform.git

# 推送代码到 GitHub
git push -u origin main
```

**⚠️ 首次推送会要求登录 GitHub：**
- 选择 **Sign in with a web browser**
- 复制显示的代码（如：`DEVICE_CODE`）
- 浏览器会自动打开 GitHub 登录页面
- 粘贴代码并授权

---

### **步骤 5：启用 GitHub Pages**

#### 方法 A：GitHub 网站
1. 访问您的仓库：https://github.com/YOUR_USERNAME/xingapis-platform
2. 点击 **Settings**（右侧菜单）
3. 左侧菜单找到 **Pages**
4. **Source** 选择 **Deploy from a branch**
5. **Branch** 选择 **main** 和 **/ (root)**
6. 点击 **Save**
7. 等待 1-2 分钟，GitHub 会显示：
   - 🎉 **Your site is live at https://YOUR_USERNAME.github.io/xingapis-platform/**

#### 方法 B：使用 GitHub CLI
```bash
# 启用 GitHub Pages
gh repo edit --enable-pages --branch=main --path=/

# 查看部署状态
gh workflow view
```

---

### **步骤 6：访问您的网站**

**GitHub Pages 地址：**
```
https://YOUR_USERNAME.github.io/xingapis-platform/
```

**例如：**
- 如果您的用户名是 `zhangsan`
- 网站地址是：`https://zhangsan.github.io/xingapis-platform/`

---

## 🎉 部署成功检查清单

- [ ] 访问 `https://YOUR_USERNAME.github.io/xingapis-platform/`
- [ ] 查看首页（index.html）是否正常显示
- [ ] 点击导航链接，检查页面切换
- [ ] 测试星空海洋特效和游鱼动画
- [ ] 检查浏览器控制台（F12）是否有错误

---

## 🔧 常见问题

### Q1：GitHub Pages 显示 404 错误？
**A**：等待 1-2 分钟，GitHub Pages 需要时间构建。如果超过 5 分钟仍未生效，检查：
- 仓库是否为 **Public**
- 是否有 `index.html` 文件
- 分支是否正确（应该是 `main`）

### Q2：样式或图片未加载？
**A**：检查 `index.html` 中的资源路径是否使用**相对路径**：
```html
<!-- ❌ 错误 -->
<link rel="stylesheet" href="/style.css">

<!-- ✅ 正确 -->
<link rel="stylesheet" href="./style.css">
```

### Q3：如何更新网站？
**A**：每次修改代码后，执行：
```bash
cd C:\Users\Windows\.qclaw\workspace\xingapis-platform
git add .
git commit -m "更新说明"
git push
```
等待 1-2 分钟，GitHub Pages 会自动更新。

### Q4：可以使用自定义域名吗？
**A**：可以！
1. 在仓库根目录创建 `CNAME` 文件
2. 文件内容写入您的域名（如：`xinsuanji.cn`）
3. 在域名服务商添加 **CNAME 记录**指向 `YOUR_USERNAME.github.io`

---

## 🚀 进阶：使用 GitHub Actions 自动部署

创建文件 `.github/workflows/deploy.yml`：

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Deploy to GitHub Pages
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./
```

每次推送到 `main` 分支，GitHub Actions 会自动部署！

---

## 📞 需要帮助？

如果遇到问题，请提供：
- 错误截图
- 命令执行结果
- 仓库地址

联系我们：
- 📧 邮箱：support@xinsuanji.cn
- 💬 微信：XingAPIs_Support

---

**🎉 祝您部署顺利！**
