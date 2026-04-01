import CryptoJS from 'crypto-js'

// ==================== 开发环境：直连讯飞 WebSocket ====================
// 密钥从 .env.local 读取，Vite 生产构建时此段代码被完全移除（tree-shaking）

function uint8ArrayToBase64(bytes) {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

const DEV_CONFIG = {
  APPID: import.meta.env.VITE_XFYUN_APPID,
  APISecret: import.meta.env.VITE_XFYUN_API_SECRET,
  APIKey: import.meta.env.VITE_XFYUN_API_KEY,
  URL: 'wss://cbm01.cn-huabei-1.xf-yun.com/v1/private/mcd9m97e6'
}

function getAuthUrl() {
  const { host, pathname: path } = new URL(DEV_CONFIG.URL)
  const date = new Date().toUTCString()
  const sigOrigin = `host: ${host}\ndate: ${date}\nGET ${path} HTTP/1.1`
  const sig = CryptoJS.enc.Base64.stringify(CryptoJS.HmacSHA256(sigOrigin, DEV_CONFIG.APISecret))
  const authOrigin = `api_key="${DEV_CONFIG.APIKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${sig}"`
  return `${DEV_CONFIG.URL}?authorization=${btoa(authOrigin)}&date=${encodeURIComponent(date)}&host=${host}`
}

function _synthesizeViaWS(text, { onAudio, onComplete, onError }) {
  let ws
  try { ws = new WebSocket(getAuthUrl()) } catch (e) { onError?.(e); return () => {} }

  ws.onopen = () => {
    const textB64 = uint8ArrayToBase64(new TextEncoder().encode(text))
    ws.send(JSON.stringify({
      header: { app_id: DEV_CONFIG.APPID, status: 2 },
      parameter: {
        oral: { oral_level: 'mid' },
        tts: {
          vcn: 'x5_lingxiaoxuan_flow', speed: 50, volume: 50, pitch: 50,
          audio: { encoding: 'raw', sample_rate: 24000, channels: 1, bit_depth: 16, frame_size: 0 }
        }
      },
      payload: { text: { encoding: 'utf8', compress: 'raw', format: 'plain', status: 2, seq: 0, text: textB64 } }
    }))
  }

  ws.onmessage = async (event) => {
    try {
      const raw = event.data instanceof Blob ? await event.data.text() : event.data
      const data = JSON.parse(raw)
      if (data.header?.code !== 0) { onError?.(new Error(`TTS ${data.header?.code}: ${data.header?.message}`)); ws.close(); return }
      if (data.payload?.audio?.audio) onAudio?.(data.payload.audio.audio)
      if (data.payload?.audio?.status === 2) { onComplete?.(); ws.close() }
    } catch (e) { onError?.(e) }
  }

  ws.onerror = () => onError?.(new Error('WebSocket连接错误'))
  ws.onclose = () => {}
  return () => { if (ws?.readyState === WebSocket.OPEN) ws.close() }
}

// ==================== 生产环境：调用 Vercel Serverless Function ====================
// 密钥存储在 Vercel 环境变量中，不暴露给前端

function _synthesizeViaAPI(text, { onAudio, onComplete, onError }) {
  const ctrl = new AbortController()

  fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
    signal: ctrl.signal
  }).then(async (res) => {
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      onError?.(new Error(err.error || `HTTP ${res.status}`))
      return
    }
    // 后端返回原始 PCM 二进制，转为 base64 后交给现有 decodeAudioChunks
    const buf = await res.arrayBuffer()
    const bytes = new Uint8Array(buf)
    let binary = ''
    for (const b of bytes) binary += String.fromCharCode(b)
    onAudio?.(btoa(binary))
    onComplete?.()
  }).catch((e) => {
    if (e.name !== 'AbortError') onError?.(e)
  })

  return () => ctrl.abort()
}

// ==================== 公共 API ====================

/**
 * 合成语音：开发环境直连讯飞 WebSocket，生产环境调用 Vercel Serverless Function
 */
export function synthesizeSpeech(text, callbacks) {
  if (import.meta.env.PROD) return _synthesizeViaAPI(text, callbacks)
  return _synthesizeViaWS(text, callbacks)
}

export async function decodeAudioChunks(audioChunks) {
  const binaryChunks = audioChunks.map(chunk => {
    const binaryStr = atob(chunk)
    const bytes = new Uint8Array(binaryStr.length)
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i)
    return bytes
  })
  const totalLength = binaryChunks.reduce((acc, c) => acc + c.length, 0)
  const merged = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of binaryChunks) { merged.set(chunk, offset); offset += chunk.length }
  return merged
}

let sharedAudioContext = null

export function ensureAudioContext() {
  if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
    sharedAudioContext = new (window.AudioContext || window.webkitAudioContext)()
  }
  if (sharedAudioContext.state === 'suspended') sharedAudioContext.resume()
  return sharedAudioContext
}

export function playPCMAudio(pcmData) {
  return new Promise((resolve, reject) => {
    try {
      const audioContext = ensureAudioContext()
      const sampleRate = 24000
      const int16Array = new Int16Array(pcmData.buffer, pcmData.byteOffset, pcmData.byteLength / 2)
      const float32Array = new Float32Array(int16Array.length)
      for (let i = 0; i < int16Array.length; i++) float32Array[i] = int16Array[i] / 32768
      const audioBuffer = audioContext.createBuffer(1, float32Array.length, sampleRate)
      audioBuffer.getChannelData(0).set(float32Array)
      const source = audioContext.createBufferSource()
      source.buffer = audioBuffer
      source.connect(audioContext.destination)
      source.onended = resolve
      source.start()
    } catch (e) { reject(e) }
  })
}
