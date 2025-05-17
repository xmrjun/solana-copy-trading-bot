require('dotenv').config();
const { Connection, Keypair, PublicKey, VersionedTransaction } = require('@solana/web3.js');
const axios = require('axios');
const bs58 = require('bs58');

const RPC_URL = 'https://mainnet.helius-rpc.com/?api-key=cdd2340d-0673-4951-a36d-de98e9310f45';
const WALLET_PRIVATE_KEY = process.env.WALLET_PRIVATE_KEY;

async function testTrade() {
    console.log('测试交易...');

    const connection = new Connection(RPC_URL, 'confirmed');

    if (!WALLET_PRIVATE_KEY) {
        throw new Error('未找到 WALLET_PRIVATE_KEY');
    }
    const decodedKey = bs58.decode(WALLET_PRIVATE_KEY);
    if (decodedKey.length !== 64) {
        throw new Error('私钥长度应为 64 字节');
    }
    const wallet = Keypair.fromSecretKey(decodedKey);
    console.log('钱包公钥:', wallet.publicKey.toBase58());

    const inputMint = 'So11111111111111111111111111111111111111112'; // WSOL
    const outputMint = 'F9TgEJLLRUKDRF16HgjUCdJfJ5BK6ucyiW8uJxVPpump'; // 测试代币
    const amount = 10000000; // 0.01 SOL
    const slippageBps = 1000; // 10%

    try {
        console.log('获取报价: WSOL -> F9TgEJLL...pump');
        const quoteResponse = await axios.get('https://quote-api.jup.ag/v6/quote', {
            params: {
                inputMint,
                outputMint,
                amount,
                slippageBps
            }
        });
        const quote = quoteResponse.data;
        console.log('报价:', JSON.stringify(quote, null, 2));

        console.log('获取 swap 交易...');
        const swapResponse = await axios.post('https://quote-api.jup.ag/v6/swap', {
            quoteResponse: quote,
            userPublicKey: wallet.publicKey.toBase58()
        });
        const { swapTransaction } = swapResponse.data;

        const swapTxBuf = Buffer.from(swapTransaction, 'base64');
        const transaction = VersionedTransaction.deserialize(swapTxBuf);
        transaction.sign([wallet]);

        const txid = await connection.sendRawTransaction(transaction.serialize(), {
            skipPreflight: false,
            maxRetries: 5,
            preflightCommitment: 'confirmed'
        });
        await connection.confirmTransaction({
            signature: txid,
            blockhash: transaction.message.recentBlockhash,
            lastValidBlockHeight: (await connection.getLatestBlockhash()).lastValidBlockHeight
        }, 'confirmed', { commitment: 'confirmed', timeout: 60000 }); // 60秒超时
        console.log('交易成功, txid:', txid);
    } catch (error) {
        console.error('交易失败:', error.message);
    }
}

testTrade().catch(error => {
    console.error('测试错误:', error.message);
});
