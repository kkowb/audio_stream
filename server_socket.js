import WebSocket, { WebSocketServer } from 'ws';

let log = console.log.bind(console);
// Map<ws, botId>
const botIdMap = new Map();
const listenerMap = new Map();

let extractBotAudio = function (data) {
    const botId = data?.data?.bot?.id;
    const bufferBase64 = data?.data?.data?.buffer;
    const audioBuffer = Buffer.from(bufferBase64, 'base64');
    return { botId, audioBuffer };
};

let registerBotConnection = function (ws, botId) {
    if (!botIdMap.has(ws)) {
        botIdMap.set(ws, botId);
        log(`🤖 机器人连接成功，botId: ${botId}`);
    }
};

let preparePayload = function (botId, audioBuffer) {
    return JSON.stringify({
        botId,
        audio: audioBuffer.toString('base64'),
    });
};

let sendToSubscribers = function (botId, payload) {
    const listeners = listenerMap.get(botId);
    if (!listeners) return;

    for (const client of listeners) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
        }
    }
};

let handleSubscribe = function (ws, botId) {
    if (!botId) {
        return
    };
    if (!listenerMap.has(botId)) {
        listenerMap.set(botId, new Set());
    }
    listenerMap.get(botId).add(ws);
    log(`👂 客户端订阅了 botId: ${botId}`);
};

let saveAudioToBinFile = function (botId, audioBuffer) {
    const dirPath = path.resolve('./audio_bin');
    const filePath = path.join(dirPath, `${botId}.bin`);

    try {
        fs.appendFileSync(filePath, audioBuffer);
        log(`📁 保存音频到 ${filePath}（追加 ${audioBuffer.length} 字节）`);
    } catch (err) {
        log(`❌ 写入 ${filePath} 失败: ${err.message}`);
    }
};


let processAudioMessage = function (ws, data) {
    const result = extractBotAudio(data);
    if (!result) {
        log('⚠️ 收到音频但缺少必要字段，跳过');
        return;
    }
    const { botId, audioBuffer } = result;
    registerBotConnection(ws, botId);
    const payload = preparePayload(botId, audioBuffer);
    sendToSubscribers(botId, payload);
    log(` 来自机器人 ${botId} 的音频，大小: ${audioBuffer.length} 字节`);
    saveAudioToBinFile(botId, audioBuffer);
};

let handleMessage = function (ws, message) {
    let data = JSON.parse(message);
    if (data.type === 'subscribe') {
        handleSubscribe(ws, data.botId);
        return;
    }
    if (data.event === 'audio_mixed_raw.data') {
        processAudioMessage(ws, data);
    }
};

let isBot = function (ws) {
    return botIdMap.has(ws);
};

let cleanupBot = function (ws) {
    const botId = botIdMap.get(ws);
    if (!botId) {
        return;
    };

    log(`🔴 机器人 ${botId} 的连接已关闭`);

    botIdMap.delete(ws);
    listenerMap.delete(botId);

    const disconnectNotice = JSON.stringify({
        type: 'bot_disconnected',
        botId,
    });

    sendToSubscribers(botId, disconnectNotice);
};

let cleanupClient = function (ws) {
    for (const [botId, clients] of listenerMap.entries()) {
        if (clients.has(ws)) {
            clients.delete(ws);
            log(`🔴 客户端从 botId ${botId} 的监听列表中移除`);
            if (clients.size === 0) {
                listenerMap.delete(botId);
            }
            break;
        }
    }
};

let handleClose = function (ws) {
    if (isBot(ws)) {
        cleanupBot(ws);
    } else {
        cleanupClient(ws);
    }
};

let handleError = function (ws, err) {
    const botId = botIdMap.get(ws) || '未知机器人';
    log(`❗ WebSocket 错误（机器人 ${botId}）: ${err.message}`);
};

let main = function () {
    const PORT = 2000;
    const server = new WebSocketServer({ port: PORT });
    server.on('connection', (ws) => {
        log('🟢 新的客户端连接');
        ws.on('message', (message) => handleMessage(ws, message));
        ws.on('close', () => handleClose(ws));
        ws.on('error', (err) => handleError(ws, err));
    });
    log(`🚀 WebSocket 服务器已启动，监听端口 ${PORT}`);
};

main();
