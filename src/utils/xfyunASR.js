import CryptoJS from 'crypto-js'

const ASR_CONFIG = {
  APPID: import.meta.env.VITE_XFYUN_APPID,
  APISecret: import.meta.env.VITE_XFYUN_API_SECRET,
  APIKey: import.meta.env.VITE_XFYUN_API_KEY,
  URL: 'wss://iat-api.xfyun.cn/v2/iat'
}

function getAuthUrl() {
  const url = new URL(ASR_CONFIG.URL)
  const host = url.host
  const path = url.pathname
  const date = new Date().toUTCString()
  const sigOrigin = `host: ${host}\ndate: ${date}\nGET ${path} HTTP/1.1`
  const sig = CryptoJS.enc.Base64.stringify(
    CryptoJS.HmacSHA256(sigOrigin, ASR_CONFIG.APISecret)
  )
  const authOrigin = `api_key="${ASR_CONFIG.APIKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${sig}"`
  const auth = btoa(authOrigin)
  return `${ASR_CONFIG.URL}?authorization=${auth}&date=${encodeURIComponent(date)}&host=${host}`
}

// 将 AudioBuffer 数据降采样到 16kHz PCM Int16
function downsampleBuffer(buffer, inputSampleRate) {
  if (inputSampleRate === 16000) return float32ToInt16(buffer)
  const ratio = inputSampleRate / 16000
  const newLength = Math.round(buffer.length / ratio)
  const result = new Int16Array(newLength)
  let offsetResult = 0
  let offsetBuffer = 0
  while (offsetResult < newLength) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio)
    let accum = 0
    let count = 0
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i]
      count++
    }
    result[offsetResult] = Math.max(-32768, Math.min(32767, Math.round((accum / count) * 32768)))
    offsetResult++
    offsetBuffer = nextOffsetBuffer
  }
  return result
}

function float32ToInt16(buffer) {
  const int16 = new Int16Array(buffer.length)
  for (let i = 0; i < buffer.length; i++) {
    int16[i] = Math.max(-32768, Math.min(32767, Math.round(buffer[i] * 32768)))
  }
  return int16
}

function int16ToBase64(int16Array) {
  const bytes = new Uint8Array(int16Array.buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

/**
 * 启动语音识别
 * @param {object} callbacks
 *   onPartialResult(text)    - 实时中间结果
 *   onFinalResult(text)      - 最终识别结果
 *   onError(err)
 *   onStatusChange(status)   - 'starting' | 'listening' | 'processing' | 'done' | 'error'
 * @returns {Function} stop - 调用后停止录音
 */
export async function startASR({ onPartialResult, onFinalResult, onError, onStatusChange }) {
  onStatusChange?.('starting')

  let mediaStream = null
  let audioContext = null
  let processor = null
  let ws = null
  let stopped = false
  let resultBuffer = {}       // sn → text 片段
  let lastText = ''

  function stop() {
    if (stopped) return
    stopped = true
    // 发送最后一帧
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        data: { status: 2, format: 'audio/L16;rate=16000', encoding: 'raw', audio: '' }
      }))
    }
    processor?.disconnect()
    if (mediaStream) mediaStream.getTracks().forEach(t => t.stop())
    if (audioContext?.state !== 'closed') audioContext?.close()
  }

  // 1. 获取麦克风权限
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
  } catch (e) {
    onStatusChange?.('error')
    onError?.(new Error('无法获取麦克风权限：' + e.message))
    return () => {}
  }

  // 2. 建立 AudioContext
  audioContext = new (window.AudioContext || window.webkitAudioContext)()
  const nativeSampleRate = audioContext.sampleRate
  const source = audioContext.createMediaStreamSource(mediaStream)
  const bufferSize = 4096
  processor = audioContext.createScriptProcessor(bufferSize, 1, 1)

  // 3. 建立 WebSocket
  try {
    ws = new WebSocket(getAuthUrl())
  } catch (e) {
    stop()
    onStatusChange?.('error')
    onError?.(e)
    return () => {}
  }

  let wsReady = false
  let firstFrameSent = false   // 是否已发送含业务参数的第一帧
  const audioQueue = []

  function sendFirstFrame(audio) {
    ws.send(JSON.stringify({
      common: { app_id: ASR_CONFIG.APPID },
      business: {
        language: 'zh_cn',
        domain: 'iat',
        accent: 'mandarin',
        vad_eos: 3000
      },
      data: {
        status: 0,
        format: 'audio/L16;rate=16000',
        encoding: 'raw',
        audio: audio || ''
      }
    }))
    firstFrameSent = true
  }

  ws.onopen = () => {
    wsReady = true
    onStatusChange?.('listening')
    // 无论 audioQueue 是否有数据，都先发业务参数帧
    if (audioQueue.length > 0) {
      sendFirstFrame(audioQueue.shift())
      for (const chunk of audioQueue) {
        ws.send(JSON.stringify({
          data: { status: 1, format: 'audio/L16;rate=16000', encoding: 'raw', audio: chunk }
        }))
      }
      audioQueue.length = 0
    } else {
      // 队列为空时发空音频帧占位，确保业务参数先到达服务端
      sendFirstFrame('')
    }
  }

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)
      if (data.code !== 0) {
        onError?.(new Error(`ASR错误 ${data.code}: ${data.message}`))
        onStatusChange?.('error')
        stop()
        return
      }

      // 解析结果
      const result = data.data
      if (!result) return
      const words = result.result?.ws || []
      const sn = result.result?.sn ?? 0
      const isFinal = result.result?.ls === true

      const text = words.map(w => w.cw?.[0]?.w ?? '').join('')
      if (text) {
        resultBuffer[sn] = text
        lastText = Object.keys(resultBuffer)
          .sort((a, b) => Number(a) - Number(b))
          .map(k => resultBuffer[k])
          .join('')
        onPartialResult?.(lastText)
      }

      if (result.status === 2) {
        onStatusChange?.('done')
        onFinalResult?.(lastText)
        ws.close()
      }
    } catch (e) {
      onError?.(e)
    }
  }

  ws.onerror = () => {
    onStatusChange?.('error')
    onError?.(new Error('ASR WebSocket 连接失败'))
    stop()
  }

  ws.onclose = () => {
    if (!stopped) stop()
  }

  // 4. 音频采集 → 发送
  processor.onaudioprocess = (e) => {
    if (stopped) return
    const float32 = e.inputBuffer.getChannelData(0)
    const int16 = downsampleBuffer(float32, nativeSampleRate)
    const b64 = int16ToBase64(int16)

    if (!wsReady) {
      // WebSocket 还未连接，先缓冲
      audioQueue.push(b64)
    } else if (ws.readyState === WebSocket.OPEN) {
      if (!firstFrameSent) {
        // onopen 发了空帧占位，下一帧实际音频以 status:1 继续即可
        // （业务参数已随空帧发出）
      }
      ws.send(JSON.stringify({
        data: { status: 1, format: 'audio/L16;rate=16000', encoding: 'raw', audio: b64 }
      }))
    }
  }

  source.connect(processor)
  processor.connect(audioContext.destination)

  return stop
}
