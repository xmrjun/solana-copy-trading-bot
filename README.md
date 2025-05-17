Solana 跟单机器人
这是一个基于 Node.js 的 Solana 区块链跟单机器人，用于监控特定钱包并复制其 Pump.fun 和 Jupiter 交易。
项目概述
本机器人通过 Helius Webhook 获取交易事件，筛选来自监控钱包的 Pump.fun 和 Jupiter 交换交易，并使用 Jupiter API 执行类似交易。包含健壮的事件解析、时间戳验证和签名跟踪，避免重复处理。
前提条件

Node.js：v16 或更高版本
Solana 钱包：私钥存储在 .env 文件中
Helius RPC：Solana 主网的 API 密钥
PM2：用于运行机器人的进程管理器
Git：版本控制

安装步骤

克隆仓库：
git clone https://github.com/xmrjun/solana-copy-trading-bot.git
cd solana-copy-trading-bot


安装依赖：
npm install @solana/web3.js @solana/spl-token @jup-ag/core axios bs58 dotenv


配置环境：创建 .env 文件：
echo "WALLET_PRIVATE_KEY=your_base58_private_key" > .env


将 your_base58_private_key 替换为你的 Solana 钱包私钥。
确保 .env 在 .gitignore 中，避免泄露敏感数据。


配置 Helius Webhook：

在 helius.xyz 设置 Webhook，URL 为 http://185.84.224.246:3000/events。
监控 copy_trader.js 中列出的钱包（MONITORED_WALLETS）。



使用方法

运行机器人：
pm2 start copy_trader.js --name copy-trader


查看日志：
pm2 logs copy-trader --lines 50


停止机器人：
pm2 stop copy-trader



配置项

RPC_URL：copy_trader.js 中的 Helius RPC 端点。
WEBHOOK_EVENTS_URL：http://185.84.224.246:3000/events。
MIN_TOKEN_AMOUNT：最小跟单代币数量（默认：0.1）。
MIN_SOL_AMOUNT：最小跟单 SOL 数量（默认：0.01 SOL）。
MAX_AGE_SECONDS：交易最大年龄（默认：120 秒）。
FUTURE_TIME_THRESHOLD：未来时间戳容忍度（默认：1 天）。
MONITORED_WALLETS：监控的钱包地址列表。

功能特性

事件解析：健壮验证，处理无效 Webhook 事件。
时间戳过滤：跳过过旧或未来交易。
签名跟踪：使用 processed_transactions.json 避免重复交易。
Jupiter 交易：以 0.000002 SOL 和 10% 滑点执行交易。
Pump.fun 支持：未来实现占位。

故障排查

Webhook 问题：

若事件时间戳为未来（如 2025-05-20），检查 helius.xyz 的 Webhook 设置。
确保 WEBHOOK_EVENTS_URL 可访问：curl -X GET http://185.84.224.246:3000/events > webhook_data.json
cat webhook_data.json




未定义错误：

确保 copy_trader.js 包含事件验证（如 if (!event || !Array.isArray(event))）。
检查 Webhook 数据格式是否正确。


Jupiter 交易失败：

若报 Assertion failed，在 executeSwap 中降低 amount（如 1000，即 0.000001 SOL）。
检查钱包余额（默认：HgAYFVHnDkQKFtfLUgnpsnHw8GyyHhyGp9g5HTNpbVEF）。



贡献指南

Fork 本仓库。
创建特性分支（git checkout -b feature/xxx）。
提交更改（git commit -m "添加特性 xxx"）。
推送到分支（git push origin feature/xxx）。
提交 Pull Request。

许可证
MIT 许可证。详见 LICENSE。
联系方式
如有问题，请通过 GitHub Issues 提交，或联系（替换为你的联系方式）。

