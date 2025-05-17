require('dotenv').config();
const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID, getOrCreateAssociatedTokenAccount } = require('@solana/spl-token');
const { Jupiter } = require('@jup-ag/core');
const axios = require('axios');
const bs58 = require('bs58');
const fs = require('fs').promises;
const path = require('path');

// 配置
const RPC_URL = 'https://mainnet.helius-rpc.com/?api-key=690caee5-296e-490d-b1f2-c6e2247adfea';
const WEBHOOK_EVENTS_URL = 'http://185.84.224.246:3000/events';
const PROCESSED_FILE = path.join(__dirname, 'processed_transactions.json');
const WALLET_PRIVATE_KEY = process.env.WALLET_PRIVATE_KEY;
const MIN_TOKEN_AMOUNT = 0.1;
const MIN_SOL_AMOUNT = 10000000; // 0.01 SOL
const MAX_AGE_SECONDS = 120; // 2 分钟
const FUTURE_TIME_THRESHOLD = 86400; // 1 天
const MONITORED_WALLETS = [
    'ABUqmjGYiZd4mFxVa2ZV4zZUUbB7a7U7EvoPkw4YHvC6',
    'DNfuF1L62WWyW3pNakVkyGGFzVVhj4Yr52jSmdTyeBHm',
    'AGH9ZfvP28RgKjk6QcSsrWGwStFPmGF58rTgsS1Y2pwN',
    '71CPXu3TvH3iUKaY1bNkAAow24k6tjH473SsKprQBABC',
    'Be1wABrhNCprQVep99KurhKJWXfQVNAZ1A5DM21Bi7AM',
    'E6YW64uXfXjXhh3YkJb41woJzTL38idtQicfgUKfRqEi',
    '8BDPTtki1KhMVhvYmT5qr7X1ggHLZAPB5zkf8ZxgLWD5',
    '32QeW9Ej8X5Z1Ka1CMcz1u2FHom9C35vdJHJTwnukwqN',
    '3JbCsBJbRncrJbwmKYo5ww3uMuRgZ2LkS9LY7pZxu5v1',
    '6RVbcfrFFmbXBuuWuxsGgpiJuw1emgP9LGJMnLWEwMQ6',
    'E57hYjjwNAnvXe67C1q7nKRdC2jWMRGLWAJsBJAJrgzR',
    'BUhDg7dW7F6ZF8bQAEwTZo1HyNNrRTCLR1MQNSKVYU2i',
    '9zckZP4aqjo8kqLJu2uaig8pZ7yDNmfTBKmjc86F4wfq',
    '7DZwqAmSkZ5JgxMZ7ZeiAbMTXRXk4dfLS9FViQ7LeREY',
    'GybhvUZzTq4qYBc292dz4HE4oQPZJGC9xGJdEH9uYeHK',
    '2btYi2pqVgtgzLqeAXE122FPhN2xBJMQpE1V9CMNv4EH'
];

console.log('初始化跟单机器人...');
let connection;
try {
    console.log('连接 RPC:', RPC_URL);
    connection = new Connection(RPC_URL, 'confirmed');
} catch (error) {
    console.error('RPC 连接失败:', error.message);
    process.exit(1);
}

let wallet;
try {
    console.log('解码私钥...');
    if (!WALLET_PRIVATE_KEY) {
        throw new Error('未找到 WALLET_PRIVATE_KEY');
    }
    const decodedKey = bs58.decode(WALLET_PRIVATE_KEY);
    if (decodedKey.length !== 64) {
        throw new Error('私钥长度应为 64 字节，当前为 ' + decodedKey.length);
    }
    wallet = Keypair.fromSecretKey(decodedKey);
    console.log('钱包公钥:', wallet.publicKey.toBase58());
} catch (error) {
    console.error('私钥解码失败:', error.message);
    process.exit(1);
}

async function fetchEvents() {
    try {
        const response = await axios.get(WEBHOOK_EVENTS_URL);
        console.log('Webhook 返回事件数量:', response.data.length);
        return response.data;
    } catch (error) {
        console.error('获取事件失败:', error.message);
        return [];
    }
}

async function saveProcessedTransaction(signature) {
    let processed = [];
    try {
        const data = await fs.readFile(PROCESSED_FILE, 'utf8');
        processed = JSON.parse(data);
    } catch (error) {
        console.log('初始化已处理文件:', error.message);
    }
    if (!processed.includes(signature)) {
        processed.push(signature);
        try {
            await fs.writeFile(PROCESSED_FILE, JSON.stringify(processed, null, 2));
            console.log(`保存签名: ${signature}`);
        } catch (writeError) {
            console.error(`保存签名失败: ${signature}, 错误:`, writeError.message);
        }
    }
}

async function isProcessed(signature) {
    try {
        const data = await fs.readFile(PROCESSED_FILE, 'utf8');
        const processed = JSON.parse(data);
        const isProcessed = processed.includes(signature);
        if (isProcessed) {
            console.log(`跳过已处理交易: ${signature}`);
        }
        return isProcessed;
    } catch (error) {
        console.error('读取已处理文件失败:', error.message);
        return false;
    }
}

async function executeSwap(event) {
    const transaction = event[0];
    // 验证必要字段
    if (!transaction || !transaction.signature || !transaction.source || !transaction.timestamp || !transaction.tokenTransfers || !transaction.nativeTransfers) {
        console.log(`跳过无效交易: 签名=${transaction?.signature || '缺失'}, 原因: 缺少必要字段`);
        if (transaction?.signature) {
            await saveProcessedTransaction(transaction.signature);
        }
        return;
    }

    const { signature, tokenTransfers, nativeTransfers, source, timestamp } = transaction;
    if (source !== 'PUMP_FUN' && source !== 'JUPITER') {
        console.log(`忽略非 Pump.fun/Jupiter 交易: ${signature}, 来源: ${source}`);
        await saveProcessedTransaction(signature);
        return;
    }

    // 检查时间戳
    const currentTime = Math.floor(Date.now() / 1000);
    const normalizedTimestamp = timestamp > 1000000000000 ? Math.floor(timestamp / 1000) : timestamp;
    if (!normalizedTimestamp || typeof normalizedTimestamp !== 'number' || isNaN(normalizedTimestamp) || normalizedTimestamp > currentTime + FUTURE_TIME_THRESHOLD || (currentTime - normalizedTimestamp > MAX_AGE_SECONDS)) {
        console.log(`忽略过旧、未来或无效时间戳交易: ${signature}, 原始时间戳: ${timestamp}, 校正时间戳: ${normalizedTimestamp}, 年龄: ${normalizedTimestamp ? currentTime - normalizedTimestamp : '未知'}秒`);
        await saveProcessedTransaction(signature);
        return;
    }

    const totalSol = nativeTransfers.reduce((sum, t) => sum + (t.amount || 0), 0);
    if (totalSol < MIN_SOL_AMOUNT) {
        console.log(`忽略小额 SOL 交易: ${signature}, 总 SOL: ${totalSol / 1e9}`);
        await saveProcessedTransaction(signature);
        return;
    }

    for (const transfer of tokenTransfers) {
        const { mint, tokenAmount, toUserAccount } = transfer;
        if (!mint || !tokenAmount || !toUserAccount) {
            console.log(`跳过无效代币转账: ${signature}, 代币: ${mint || '缺失'}, 数量: ${tokenAmount || '缺失'}`);
            continue;
        }
        if (tokenAmount < MIN_TOKEN_AMOUNT) {
            console.log(`忽略小额代币交易: ${signature}, 代币: ${mint}, 数量: ${tokenAmount}`);
            continue;
        }

        if (MONITORED_WALLETS.some(w => toUserAccount.startsWith(w.slice(0, 8)))) {
            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    console.log(`检测到买入: ${signature}, 代币: ${mint}, 数量: ${tokenAmount}, 尝试: ${attempt}`);
                    if (source === 'JUPITER') {
                        const jupiter = await Jupiter.load({
                            connection,
                            cluster: 'mainnet-beta',
                            user: wallet.publicKey,
                        });
                        const quote = await jupiter.getQuote({
                            inputMint: new PublicKey('So11111111111111111111111111111111111111112'),
                            outputMint: new PublicKey(mint),
                            amount: 2000, // 0.000002 SOL
                            slippageBps: 1000 // 10% 滑点
                        });
                        console.log('报价:', JSON.stringify(quote, null, 2));
                        const { swapTransaction } = await jupiter.exchange({ routeInfo: quote });
                        const tx = swapTransaction;
                        const txid = await connection.sendRawTransaction(tx.serialize(), {
                            skipPreflight: false,
                            maxRetries: 2
                        });
                        await connection.confirmTransaction(txid, 'confirmed');
                        console.log(`Jupiter 跟单成功: ${txid}, 代币: ${mint}, 数量: ${tokenAmount}`);
                        await saveProcessedTransaction(signature);
                        return;
                    } else {
                        console.log(`Pump.fun 跟单待实现: ${signature}`);
                        await saveProcessedTransaction(signature);
                        return;
                    }
                } catch (error) {
                    console.error(`跟单失败: ${signature}, 尝试: ${attempt}, 错误:`, error.message, error.stack);
                    if (attempt === 3) {
                        console.error(`最终失败: ${signature}, 不再重试`);
                        await saveProcessedTransaction(signature);
                    }
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
        }
    }
}

async function main() {
    console.log('启动跟单机器人...');
    while (true) {
        const events = await fetchEvents();
        console.log(`获取到 ${events.length} 条事件`);
        for (const event of events) {
            // 验证事件格式
            if (!event || !Array.isArray(event) || event.length === 0) {
                console.log('跳过无效事件:', JSON.stringify(event));
                continue;
            }
            const transaction = event[0];
            if (!transaction || !transaction.type || !transaction.signature) {
                console.log(`跳过无效交易: 签名=${transaction?.signature || '缺失'}, 类型=${transaction?.type || '缺失'}`);
                if (transaction?.signature) {
                    await saveProcessedTransaction(transaction.signature);
                }
                continue;
            }
            if (transaction.type !== 'SWAP') {
                console.log(`忽略非 SWAP 交易: ${signature}, 类型: ${transaction.type}`);
                await saveProcessedTransaction(transaction.signature);
                continue;
            }
            if (await isProcessed(transaction.signature)) continue;
            await executeSwap(event);
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
}

main().catch(error => {
    console.error('主程序错误:', error.message, error.stack);
    process.exit(1);
});