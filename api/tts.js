import crypto from 'crypto'
import { WebSocket } from 'ws'

const TTS_WSS = 'wss://cbm01.cn-huabei-1.xf-yun.com/v1/private/mcd9m97e6'

function buildAuthUrl() {
  const { hostname: host, pathname: path } = new URL(TTS_WSS)
  const date = new Date().toUTCString()
  const sigOrigin = `host: ${host}\ndate: ${date}\nGET ${path} HTTP/1.1`
  const sig = crypto
    .createHmac('sha256', process.env.XFYUN_API_SECRET)
    .update(sigOrigin)
    .digest('base64')
  const authOrigin = `api_key="${process.env.XFYUN_API_KEY}", algorithm="hmac-sha256", headers="host date request-line", signature="${sig}"`
  const auth = Buffer.from(authOrigin).toString('base64')
  return `${TTS_WSS}?authorization=${auth}&date=${encodeURIComponent(date)}&host=${host}`
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).end()
    return
  }

  const { text } = req.body || {}
  if (!text?.trim()) {
    res.status(400).json({ error: 'text is required' })
    return
  }

  const authUrl = buildAuthUrl()
  const textB64 = Buffer.from(text, 'utf-8').toString('base64')

  const wsPayload = JSON.stringify({
    header: { app_id: process.env.XFYUN_APPID, status: 2 },
    parameter: {
      oral: { oral_level: 'mid' },
      tts: {
        vcn: 'x5_lingxiaoxuan_flow',
        speed: 50, volume: 50, pitch: 50,
        audio: { encoding: 'raw', sample_rate: 24000, channels: 1, bit_depth: 16, frame_size: 0 }
      }
    },
    payload: {
      text: { encoding: 'utf8', compress: 'raw', format: 'plain', status: 2, seq: 0, text: textB64 }
    }
  })

  await new Promise((resolve) => {
    const audioChunks = []

    const timer = setTimeout(() => {
      ws.terminate()
      if (!res.headersSent) res.status(504).json({ error: 'TTS timeout' })
      resolve()
    }, 28000)

    const ws = new WebSocket(authUrl)

    ws.on('open', () => ws.send(wsPayload))

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString())
        const code = msg.header?.code ?? -1
        if (code !== 0) {
          clearTimeout(timer)
          ws.close()
          if (!res.headersSent) res.status(502).json({ error: `讯飞错误 ${code}: ${msg.header?.message}` })
          resolve()
          return
        }
        const audio = msg.payload?.audio?.audio
        if (audio) audioChunks.push(Buffer.from(audio, 'base64'))
        if (msg.payload?.audio?.status === 2) {
          clearTimeout(timer)
          ws.close()
          const pcm = Buffer.concat(audioChunks)
          res.setHeader('Content-Type', 'audio/pcm')
          res.setHeader('Cache-Control', 'no-store')
          res.send(pcm)
          resolve()
        }
      } catch (e) {
        clearTimeout(timer)
        if (!res.headersSent) res.status(500).json({ error: e.message })
        resolve()
      }
    })

    ws.on('error', (e) => {
      clearTimeout(timer)
      if (!res.headersSent) res.status(502).json({ error: e.message })
      resolve()
    })
  })
}
