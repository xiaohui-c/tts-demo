<template>
  <div class="tts-demo">
    <h1 class="title">语音流程演示系统</h1>
    <p class="subtitle">支持语音识别导航 · 讯飞超拟人语音合成</p>

    <div class="stats-bar">
      <div class="stat-item">
        <span class="stat-value">{{ currentStep + 1 }}/{{ steps.length }}</span>
        <span class="stat-label">当前步骤</span>
      </div>
      <div class="stat-item">
        <span class="stat-value">{{ completedSteps }}</span>
        <span class="stat-label">已完成</span>
      </div>
      <div class="stat-item">
        <span class="stat-value">{{ voiceCommandCount }}</span>
        <span class="stat-label">语音指令</span>
      </div>
      <div class="stat-item">
        <span class="stat-value stat-mode" :class="{ listening: asrStatus === 'listening' }">
          {{ asrStatus === 'listening' ? '聆听中' : '待命' }}
        </span>
        <span class="stat-label">语音状态</span>
      </div>
    </div>

    <div class="progress-bar">
      <div v-for="(step, index) in steps" :key="index" class="progress-dot"
        :class="{ active: index === currentStep, completed: index < currentStep }"
        @click="goToStep(index)">
        <span class="dot-number">
          <span v-if="index < currentStep">✓</span>
          <span v-else>{{ index + 1 }}</span>
        </span>
        <span class="dot-label">{{ step.title }}</span>
      </div>
      <div class="progress-line">
        <div class="progress-fill" :style="{ width: `${(currentStep / (steps.length - 1)) * 100}%` }"></div>
      </div>
    </div>

    <div class="main-grid">
      <div class="step-card">
        <div class="step-header">
          <div class="step-meta">
            <span class="step-badge">步骤 {{ currentStep + 1 }} / {{ steps.length }}</span>
            <span class="step-tag" :style="{ background: stepColor(currentStep) }">{{ currentStepData.type || '流程' }}</span>
          </div>
          <h2 class="step-title">{{ currentStepData.title }}</h2>
        </div>
        <div class="step-content">
          <p class="step-text">{{ displayedText }}<span v-if="isTyping" class="cursor">|</span></p>
        </div>
        <div v-if="currentStepData.points && currentStepData.points.length" class="step-points">
          <div v-for="(pt, i) in currentStepData.points" :key="i" class="point-item"
            :class="{ visible: displayedText.length > 20 }" :style="{ transitionDelay: `${i * 0.1}s` }">
            <span class="point-icon">{{ pt.icon }}</span>
            <span class="point-text">{{ pt.text }}</span>
          </div>
        </div>
        <div class="audio-status" :class="audioStatusClass">
          <span class="status-icon">{{ audioStatusIcon }}</span>
          <span class="status-text">{{ audioStatusText }}</span>
        </div>
        <div class="step-actions">
          <button class="btn btn-secondary" :disabled="currentStep === 0 || isProcessing" @click="prevStep">← 上一步</button>
          <button class="btn btn-primary" :disabled="isProcessing" @click="replayAudio">🔊 重播</button>
          <button class="btn btn-secondary" :disabled="currentStep === steps.length - 1 || isProcessing" @click="nextStep">下一步 →</button>
        </div>
      </div>

      <div class="voice-panel">
        <div class="mic-section">
          <div class="mic-wrapper">
            <div v-show="asrStatus === 'listening'" class="mic-pulse pulse-1"></div>
            <div v-show="asrStatus === 'listening'" class="mic-pulse pulse-2"></div>
            <button class="mic-btn"
              :class="{ 'mic-active': asrStatus === 'listening', 'mic-processing': asrStatus === 'processing', 'mic-error': asrStatus === 'error' }"
              @click="toggleVoice">
              <span class="mic-icon">{{ micIcon }}</span>
            </button>
          </div>
          <p class="mic-hint">{{ micHint }}</p>
        </div>

        <div class="transcript-box" :class="{ active: asrStatus === 'listening' || partialText }">
          <div class="transcript-label">
            <span>实时识别</span>
            <span v-if="asrStatus === 'listening'" class="listening-dot">●</span>
          </div>
          <p class="transcript-text">{{ partialText || (asrStatus === 'listening' ? '聆听中，请说话...' : '—') }}</p>
        </div>

        <div v-if="lastIntent" class="intent-box" :class="`intent-${lastIntent.intent}`">
          <div class="intent-header">
            <span class="intent-icon">{{ intentIcon(lastIntent.intent) }}</span>
            <span class="intent-type">{{ intentLabel(lastIntent.intent) }}</span>
            <span class="intent-score">置信度 {{ Math.round(lastIntent.score * 100) }}%</span>
          </div>
          <div class="intent-detail">
            <span class="intent-matched">匹配：「{{ lastIntent.matched }}」</span>
            <span class="intent-action">→ {{ actionLabel(lastIntent) }}</span>
          </div>
        </div>

        <div class="command-history">
          <div class="history-header">
            <span>语音指令记录</span>
            <button v-if="commandHistory.length" class="clear-btn" @click="clearHistory">清空</button>
          </div>
          <div class="history-list">
            <div v-for="(cmd, i) in commandHistory" :key="i" class="history-item" :class="`history-${cmd.intent}`">
              <div class="history-item-top">
                <span class="history-icon">{{ intentIcon(cmd.intent) }}</span>
                <span class="history-text">{{ cmd.text }}</span>
                <span class="history-time">{{ cmd.time }}</span>
              </div>
              <div class="history-item-result">{{ cmd.result }}</div>
            </div>
            <div v-if="!commandHistory.length" class="history-empty">暂无语音指令记录</div>
          </div>
        </div>
      </div>
    </div>

    <div class="steps-list">
      <h3>全部步骤</h3>
      <div v-for="(step, index) in steps" :key="index" class="step-item"
        :class="{ active: index === currentStep, completed: index < currentStep }"
        @click="goToStep(index)">
        <span class="step-item-number" :style="index < currentStep ? { background: stepColor(index) } : {}">
          {{ index < currentStep ? '✓' : index + 1 }}
        </span>
        <div class="step-item-info">
          <span class="step-item-title">{{ step.title }}</span>
          <span class="step-item-preview">{{ step.content.substring(0, 40) }}...</span>
        </div>
        <span v-if="index === currentStep" class="step-item-current">当前</span>
      </div>
    </div>

    <div class="voice-tips">
      <button class="tips-toggle" @click="showTips = !showTips">{{ showTips ? '×' : '?' }}</button>
      <div v-show="showTips" class="tips-content">
        <h4>语音指令说明</h4>
        <div class="tips-group">
          <span class="tips-group-title">📍 导航指令</span>
          <p>「下一步」「上一步」「继续」「返回」</p>
          <p>「第二步」「系统介绍」「从头开始」</p>
        </div>
        <div class="tips-group">
          <span class="tips-group-title">📖 讲解指令</span>
          <p>「介绍一下」「解释一下」「更多信息」</p>
        </div>
        <div class="tips-group">
          <span class="tips-group-title">🔁 重播指令</span>
          <p>「再说一遍」「重新播放」「没听清」</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { synthesizeSpeech, decodeAudioChunks, playPCMAudio, ensureAudioContext } from '../utils/xfyunTTS.js'
import { startASR } from '../utils/xfyunASR.js'
import { recognizeIntent } from '../utils/intentRecognizer.js'

const steps = ref([
  {
    title: '欢迎使用', type: '开始',
    content: '欢迎使用语音流程演示系统！本系统将引导您逐步了解文本转语音与语音识别的工作流程。每切换到一个新步骤，系统都会自动为您朗读对应的文本内容。',
    points: [{ icon: '🎙', text: '支持语音指令导航' }, { icon: '🔊', text: '讯飞超拟人语音合成' }, { icon: '🧠', text: '智能意图识别' }]
  },
  {
    title: '系统介绍', type: '介绍',
    content: '本系统基于讯飞超拟人交互API构建，采用WebSocket协议实时传输音频数据。超拟人语音合成技术可以生成自然、流畅、富有情感的语音效果。',
    points: [{ icon: '🌐', text: 'WebSocket 实时传输' }, { icon: '🤖', text: '深度学习语音模型' }, { icon: '✨', text: '超拟人音色 x5_lingxiaoxuan' }]
  },
  {
    title: '技术原理', type: '技术',
    content: '语音合成的过程分为三步：首先，客户端将文本发送到讯飞服务器；然后，服务器使用深度学习模型将文本转换为音频数据；最后，客户端接收并播放这些音频。',
    points: [{ icon: '1️⃣', text: '文本发送至讯飞服务器' }, { icon: '2️⃣', text: '深度学习模型推理生成 PCM' }, { icon: '3️⃣', text: '前端 AudioContext 播放' }]
  },
  {
    title: '语音识别', type: '功能',
    content: '迭代二新增语音识别功能！系统使用讯飞中文大模型将您的语音转为文字，再通过 Fuse.js 进行意图识别，判断是导航意图还是讲解意图，从而执行对应操作。',
    points: [{ icon: '🎤', text: '讯飞 IAT 中文大模型识别' }, { icon: '🔍', text: 'Fuse.js 模糊意图匹配' }, { icon: '⚡', text: '实时流式识别回调' }]
  },
  {
    title: '应用场景', type: '场景',
    content: '文本转语音技术广泛应用于智能客服、有声阅读、导航播报、教育培训等领域。通过超拟人合成，语音可以更加贴近真人发音，提升用户体验。',
    points: [{ icon: '📞', text: '智能客服与导览' }, { icon: '📖', text: '有声阅读与教育' }, { icon: '🗺', text: '导航播报与无障碍访问' }]
  },
  {
    title: '完成演示', type: '结束',
    content: '恭喜您已完成全部的流程演示！您已了解了讯飞超拟人语音合成与语音识别的基本使用方式。感谢您的体验，期待您在更多场景中使用语音技术！',
    points: [{ icon: '🎉', text: '演示流程全部完成' }, { icon: '💡', text: '可对照代码学习实现细节' }, { icon: '🚀', text: '期待您的更多创意应用' }]
  }
])

const STEP_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']
function stepColor(index) { return STEP_COLORS[index % STEP_COLORS.length] }

const currentStep = ref(0)
const displayedText = ref('')
const isTyping = ref(false)
const audioStatus = ref('idle')
const isProcessing = ref(false)
let closeWs = null, typingTimer = null, pendingPCM = null, userInteracted = false

const completedSteps = computed(() => currentStep.value)
const currentStepData = computed(() => steps.value[currentStep.value])

const audioStatusClass = computed(() => ({ idle:'status-idle', connecting:'status-connecting', synthesizing:'status-synthesizing', playing:'status-playing', error:'status-error', done:'status-done' }[audioStatus.value]))
const audioStatusIcon = computed(() => ({ idle:'🎵', connecting:'🔄', synthesizing:'⏳', playing:'🔊', error:'❌', done:'✅' }[audioStatus.value]))
const audioStatusText = computed(() => ({ idle:'语音已就绪，点击任意处播放', connecting:'正在请求语音服务...', synthesizing:'语音合成中...', playing:'正在播放...', error:'语音合成失败', done:'播放完成' }[audioStatus.value]))

const asrStatus = ref('idle')
const partialText = ref('')
const lastIntent = ref(null)
const commandHistory = ref([])
const voiceCommandCount = ref(0)
const showTips = ref(false)
let stopASRFn = null

const micIcon = computed(() => ({ idle:'🎤', starting:'⏳', listening:'⏹', processing:'🔍', done:'✅', error:'❌' }[asrStatus.value] || '🎤'))
const micHint = computed(() => ({ idle:'点击麦克风开始语音识别', starting:'正在启动麦克风...', listening:'正在聆听，再次点击停止', processing:'识别处理中...', done:'识别完成', error:'出错，请重试' }[asrStatus.value] || ''))

function intentIcon(intent) { return { navigate:'📍', explain:'📖', replay:'🔁', unknown:'❓' }[intent] || '❓' }
function intentLabel(intent) { return { navigate:'导航意图', explain:'讲解意图', replay:'重播意图', unknown:'未识别' }[intent] || '未知' }
function actionLabel(result) {
  if (!result) return ''
  if (result.action === 'next') return '跳转到下一步'
  if (result.action === 'prev') return '跳转到上一步'
  if (result.action === 'first') return '跳转到第一步'
  if (result.action === 'last') return '跳转到最后一步'
  if (result.action === 'goto') return `跳转到第 ${(result.step || 0) + 1} 步`
  if (result.action === 'explain') return '为当前步骤补充讲解'
  if (result.action === 'replay') return '重新播放当前语音'
  return '未执行操作'
}

async function toggleVoice() {
  if (asrStatus.value === 'listening') {
    stopASRFn && stopASRFn(); stopASRFn = null; asrStatus.value = 'processing'
  } else {
    partialText.value = ''; lastIntent.value = null; asrStatus.value = 'starting'
    stopASRFn = await startASR({
      onStatusChange(s) { if (s==='listening') asrStatus.value='listening'; else if (s==='done') asrStatus.value='done'; else if (s==='error') asrStatus.value='error' },
      onPartialResult(text) { partialText.value = text },
      onFinalResult(text) { asrStatus.value = 'processing'; partialText.value = text; handleTranscript(text) },
      onError(err) { console.error('ASR:', err); asrStatus.value = 'error'; appendHistory({ text:'识别失败', intent:'unknown', result: err.message }); setTimeout(() => { asrStatus.value = 'idle' }, 2500) }
    })
  }
}

function handleTranscript(text) {
  if (!text || !text.trim()) { asrStatus.value = 'idle'; return }
  const stepTitles = steps.value.map(s => s.title)
  const result = recognizeIntent(text, stepTitles)
  lastIntent.value = result; voiceCommandCount.value++
  let actionDesc = ''
  if (result.intent === 'navigate') {
    if (result.action === 'next') {
      if (currentStep.value < steps.value.length - 1) { actionDesc = `已跳转到「${steps.value[currentStep.value + 1].title}」`; nextStep() }
      else actionDesc = '已是最后一步'
    } else if (result.action === 'prev') {
      if (currentStep.value > 0) { actionDesc = `已返回「${steps.value[currentStep.value - 1].title}」`; prevStep() }
      else actionDesc = '已是第一步'
    } else if (result.action === 'first') { goToStep(0); actionDesc = '已跳转到第一步' }
    else if (result.action === 'last') { goToStep(steps.value.length - 1); actionDesc = '已跳转到最后一步' }
    else if (result.action === 'goto' && result.step !== undefined) {
      const idx = Math.max(0, Math.min(steps.value.length - 1, result.step))
      goToStep(idx); actionDesc = `已跳转到「${steps.value[idx].title}」`
    }
  } else if (result.intent === 'explain') { replayAudio(); actionDesc = `正在为您详细讲解「${currentStepData.value.title}」` }
  else if (result.intent === 'replay') { replayAudio(); actionDesc = '正在重新播放' }
  else actionDesc = '未能识别意图，请重试'
  appendHistory({ text, intent: result.intent, result: actionDesc })
  setTimeout(() => { if (asrStatus.value !== 'listening') asrStatus.value = 'idle' }, 2000)
}

function appendHistory({ text, intent, result }) {
  const now = new Date()
  const time = [now.getHours(), now.getMinutes(), now.getSeconds()].map(n => String(n).padStart(2, '0')).join(':')
  commandHistory.value.unshift({ text, intent, result, time })
  if (commandHistory.value.length > 10) commandHistory.value.pop()
}
function clearHistory() { commandHistory.value = []; voiceCommandCount.value = 0 }

function startTyping(text) {
  displayedText.value = ''; isTyping.value = true; let index = 0
  return new Promise(resolve => {
    typingTimer = setInterval(() => {
      if (index < text.length) displayedText.value += text[index++]
      else { clearInterval(typingTimer); isTyping.value = false; resolve() }
    }, 50)
  })
}
function stopTyping() { if (typingTimer) { clearInterval(typingTimer); typingTimer = null }; isTyping.value = false }
function stopCurrentAudio() { if (closeWs) { closeWs(); closeWs = null } }

function onUserInteraction() {
  if (userInteracted) return; userInteracted = true
  document.removeEventListener('click', onUserInteraction); document.removeEventListener('keydown', onUserInteraction)
  if (pendingPCM) {
    const pcm = pendingPCM; pendingPCM = null; audioStatus.value = 'playing'; isProcessing.value = true
    playPCMAudio(pcm).then(() => { audioStatus.value = 'done' }).catch(() => { audioStatus.value = 'error' }).finally(() => { isProcessing.value = false })
  }
}

async function playStepAudio(text) {
  stopCurrentAudio(); audioStatus.value = 'connecting'; isProcessing.value = true; const audioChunks = []
  return new Promise(resolve => {
    closeWs = synthesizeSpeech(text, {
      onAudio(b64) { audioStatus.value = 'synthesizing'; audioChunks.push(b64) },
      async onComplete() {
        if (!audioChunks.length) { audioStatus.value = 'done'; isProcessing.value = false; resolve(); return }
        try {
          const pcmData = await decodeAudioChunks(audioChunks)
          if (userInteracted) {
            audioStatus.value = 'playing'; await playPCMAudio(pcmData); audioStatus.value = 'done'; isProcessing.value = false
          } else {
            try {
              ensureAudioContext(); audioStatus.value = 'playing'; await playPCMAudio(pcmData)
              userInteracted = true; audioStatus.value = 'done'; isProcessing.value = false
            } catch {
              pendingPCM = pcmData; audioStatus.value = 'idle'; isProcessing.value = false
              document.addEventListener('click', onUserInteraction); document.addEventListener('keydown', onUserInteraction)
            }
          }
        } catch(e) { console.error(e); audioStatus.value = 'error'; isProcessing.value = false }
        resolve()
      },
      onError(err) { console.error(err); audioStatus.value = 'error'; isProcessing.value = false; resolve() }
    })
  })
}

async function activateStep(index) { stopTyping(); stopCurrentAudio(); currentStep.value = index; const text = steps.value[index].content; startTyping(text); await playStepAudio(text) }
function nextStep() { if (currentStep.value < steps.value.length - 1) activateStep(currentStep.value + 1) }
function prevStep() { if (currentStep.value > 0) activateStep(currentStep.value - 1) }
function goToStep(index) { if (index !== currentStep.value && !isProcessing.value) activateStep(index) }
function replayAudio() { activateStep(currentStep.value) }

onMounted(() => activateStep(0))
onUnmounted(() => {
  stopTyping(); stopCurrentAudio()
  if (stopASRFn) stopASRFn()
  document.removeEventListener('click', onUserInteraction); document.removeEventListener('keydown', onUserInteraction)
})
</script>

<style scoped>
.tts-demo { max-width: 1100px; margin: 0 auto; padding: 40px 20px 80px; }
.title { text-align: center; font-size: 34px; margin-bottom: 8px; background: linear-gradient(135deg, var(--accent), #8b5cf6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
.subtitle { text-align: center; color: var(--text); margin-bottom: 32px; font-size: 15px; }

.stats-bar { display: flex; justify-content: center; gap: 40px; margin-bottom: 36px; padding: 16px 32px; background: var(--bg); border: 1px solid var(--border); border-radius: 14px; box-shadow: var(--shadow); }
.stat-item { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.stat-value { font-size: 22px; font-weight: 700; color: var(--accent); }
.stat-value.stat-mode { font-size: 14px; padding: 3px 12px; border-radius: 20px; background: var(--code-bg); color: var(--text); transition: all 0.3s; }
.stat-value.stat-mode.listening { background: #fee2e2; color: #dc2626; animation: pulse-text 1s infinite; }
@keyframes pulse-text { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
.stat-label { font-size: 12px; color: var(--text); }

.progress-bar { display: flex; justify-content: space-between; align-items: flex-start; position: relative; margin-bottom: 40px; padding: 0 20px; }
.progress-line { position: absolute; top: 18px; left: 40px; right: 40px; height: 3px; background: var(--border); z-index: 0; border-radius: 2px; }
.progress-fill { height: 100%; background: linear-gradient(90deg, var(--accent), #8b5cf6); transition: width 0.5s ease; border-radius: 2px; }
.progress-dot { display: flex; flex-direction: column; align-items: center; position: relative; z-index: 1; cursor: pointer; gap: 8px; }
.dot-number { width: 36px; height: 36px; border-radius: 50%; background: var(--bg); border: 3px solid var(--border); display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 14px; color: var(--text); transition: all 0.3s ease; }
.progress-dot.active .dot-number { border-color: var(--accent); background: var(--accent); color: white; box-shadow: 0 0 0 4px var(--accent-bg); }
.progress-dot.completed .dot-number { border-color: #10b981; background: #10b981; color: white; }
.dot-label { font-size: 12px; color: var(--text); white-space: nowrap; transition: color 0.3s; }
.progress-dot.active .dot-label { color: var(--accent); font-weight: 600; }

.main-grid { display: grid; grid-template-columns: 1fr 360px; gap: 24px; margin-bottom: 32px; align-items: start; }

.step-card { background: var(--bg); border: 1px solid var(--border); border-radius: 16px; padding: 28px; box-shadow: var(--shadow); }
.step-header { margin-bottom: 20px; }
.step-meta { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.step-badge { display: inline-block; padding: 3px 12px; background: var(--accent-bg); color: var(--accent); border-radius: 20px; font-size: 13px; font-weight: 600; }
.step-tag { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 12px; font-weight: 600; color: white; }
.step-title { font-size: 26px; margin: 0; }
.step-content { min-height: 110px; padding: 18px; background: var(--code-bg); border-radius: 12px; margin-bottom: 18px; }
.step-text { font-size: 16px; line-height: 1.9; margin: 0; color: var(--text-h); }
.cursor { animation: blink 0.8s infinite; color: var(--accent); }
@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
.step-points { display: flex; flex-direction: column; gap: 8px; margin-bottom: 18px; }
.point-item { display: flex; align-items: center; gap: 10px; padding: 10px 14px; background: var(--code-bg); border-radius: 8px; border-left: 3px solid var(--accent); opacity: 0; transform: translateX(-10px); transition: all 0.4s ease; }
.point-item.visible { opacity: 1; transform: translateX(0); }
.point-icon { font-size: 18px; }
.point-text { font-size: 14px; color: var(--text-h); }

.audio-status { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-radius: 8px; margin-bottom: 18px; font-size: 14px; transition: all 0.3s; }
.status-idle { background: var(--code-bg); color: var(--text); }
.status-connecting, .status-synthesizing { background: #fef3c7; color: #92400e; }
.status-playing { background: var(--accent-bg); color: var(--accent); }
.status-error { background: #fee2e2; color: #dc2626; }
.status-done { background: #d1fae5; color: #065f46; }
@media (prefers-color-scheme: dark) {
  .status-connecting, .status-synthesizing { background: rgba(254,243,199,.1); color: #fbbf24; }
  .status-error { background: rgba(254,226,226,.1); color: #f87171; }
  .status-done { background: rgba(209,250,229,.1); color: #34d399; }
}
.status-icon { font-size: 16px; }
.step-actions { display: flex; gap: 10px; justify-content: center; }
.btn { padding: 9px 20px; border-radius: 8px; border: none; font-size: 14px; font-weight: 500; cursor: pointer; transition: all 0.2s; font-family: var(--sans); }
.btn:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-primary { background: var(--accent); color: white; }
.btn-primary:hover:not(:disabled) { filter: brightness(1.1); transform: translateY(-1px); }
.btn-secondary { background: var(--code-bg); color: var(--text-h); border: 1px solid var(--border); }
.btn-secondary:hover:not(:disabled) { background: var(--accent-bg); border-color: var(--accent-border); }

.voice-panel { display: flex; flex-direction: column; gap: 14px; }
.mic-section { background: var(--bg); border: 1px solid var(--border); border-radius: 16px; padding: 24px 20px; display: flex; flex-direction: column; align-items: center; gap: 12px; box-shadow: var(--shadow); }
.mic-wrapper { position: relative; display: flex; align-items: center; justify-content: center; width: 80px; height: 80px; }
.mic-pulse { position: absolute; border-radius: 50%; border: 2px solid #ef4444; opacity: 0; animation: mic-ring 1.5s ease-out infinite; width: 80px; height: 80px; }
.pulse-2 { animation-delay: 0.6s; }
@keyframes mic-ring { 0% { transform: scale(1); opacity: 0.6; } 100% { transform: scale(1.8); opacity: 0; } }
.mic-btn { width: 64px; height: 64px; border-radius: 50%; border: none; background: var(--accent); cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 26px; transition: all 0.2s; box-shadow: 0 4px 16px rgba(0,0,0,0.15); position: relative; z-index: 1; }
.mic-btn:hover { transform: scale(1.05); }
.mic-btn.mic-active { background: #ef4444; }
.mic-btn.mic-processing { background: #f59e0b; }
.mic-btn.mic-error { background: #6b7280; }
.mic-hint { font-size: 13px; color: var(--text); text-align: center; margin: 0; }

.transcript-box { background: var(--bg); border: 1px solid var(--border); border-radius: 12px; padding: 14px 16px; transition: border-color 0.3s; box-shadow: var(--shadow); }
.transcript-box.active { border-color: var(--accent); }
.transcript-label { display: flex; align-items: center; justify-content: space-between; font-size: 11px; color: var(--text); margin-bottom: 8px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
.listening-dot { color: #ef4444; animation: pulse-text 0.8s infinite; }
.transcript-text { font-size: 15px; color: var(--text-h); margin: 0; min-height: 24px; word-break: break-all; }

.intent-box { border-radius: 12px; padding: 14px 16px; border: 1px solid transparent; }
.intent-navigate { background: rgba(99,102,241,.08); border-color: rgba(99,102,241,.3); }
.intent-explain { background: rgba(16,185,129,.08); border-color: rgba(16,185,129,.3); }
.intent-replay { background: rgba(245,158,11,.08); border-color: rgba(245,158,11,.3); }
.intent-unknown { background: var(--code-bg); border-color: var(--border); }
.intent-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.intent-icon { font-size: 16px; }
.intent-type { font-size: 13px; font-weight: 700; color: var(--text-h); }
.intent-score { margin-left: auto; font-size: 12px; color: var(--text); }
.intent-detail { display: flex; flex-direction: column; gap: 2px; }
.intent-matched { font-size: 12px; color: var(--text); }
.intent-action { font-size: 13px; font-weight: 600; color: var(--accent); }

.command-history { background: var(--bg); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; box-shadow: var(--shadow); }
.history-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid var(--border); font-size: 13px; font-weight: 600; color: var(--text-h); }
.clear-btn { background: none; border: none; cursor: pointer; font-size: 12px; color: var(--text); padding: 2px 8px; border-radius: 4px; }
.clear-btn:hover { background: var(--code-bg); color: #ef4444; }
.history-list { max-height: 260px; overflow-y: auto; }
.history-item { padding: 10px 16px; border-bottom: 1px solid var(--border); }
.history-item:last-child { border-bottom: none; }
.history-navigate { border-left: 3px solid #6366f1; }
.history-explain { border-left: 3px solid #10b981; }
.history-replay { border-left: 3px solid #f59e0b; }
.history-unknown { border-left: 3px solid #9ca3af; }
.history-item-top { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.history-icon { font-size: 14px; }
.history-text { font-size: 14px; font-weight: 600; color: var(--text-h); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.history-time { font-size: 11px; color: var(--text); flex-shrink: 0; }
.history-item-result { font-size: 12px; color: var(--text); padding-left: 22px; }
.history-empty { padding: 20px 16px; text-align: center; font-size: 13px; color: var(--text); }

.steps-list { padding: 0 4px; }
.steps-list h3 { font-size: 18px; margin-bottom: 16px; color: var(--text-h); }
.step-item { display: flex; align-items: center; gap: 16px; padding: 12px 16px; border-radius: 10px; cursor: pointer; transition: all 0.2s; margin-bottom: 8px; border: 1px solid transparent; }
.step-item:hover { background: var(--code-bg); }
.step-item.active { background: var(--accent-bg); border-color: var(--accent-border); }
.step-item-number { width: 28px; height: 28px; min-width: 28px; border-radius: 50%; background: var(--border); display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 600; color: white; }
.step-item.active .step-item-number { background: var(--accent); }
.step-item-info { display: flex; flex-direction: column; gap: 2px; flex: 1; }
.step-item-title { font-weight: 600; font-size: 15px; color: var(--text-h); }
.step-item-preview { font-size: 12px; color: var(--text); }
.step-item-current { font-size: 11px; padding: 2px 8px; background: var(--accent); color: white; border-radius: 10px; flex-shrink: 0; }

.voice-tips { position: fixed; bottom: 24px; right: 24px; z-index: 100; display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
.tips-toggle { width: 40px; height: 40px; border-radius: 50%; border: none; background: var(--accent); color: white; font-size: 18px; cursor: pointer; box-shadow: 0 4px 16px rgba(0,0,0,0.2); display: flex; align-items: center; justify-content: center; }
.tips-toggle:hover { filter: brightness(1.1); }
.tips-content { background: var(--bg); border: 1px solid var(--border); border-radius: 14px; padding: 18px; box-shadow: 0 8px 32px rgba(0,0,0,0.15); width: 240px; }
.tips-content h4 { margin: 0 0 12px; font-size: 15px; color: var(--text-h); }
.tips-group { margin-bottom: 12px; }
.tips-group:last-child { margin-bottom: 0; }
.tips-group-title { font-weight: 600; font-size: 13px; color: var(--text-h); margin: 0 0 4px; display: block; }
.tips-group p { font-size: 12px; color: var(--text); margin: 2px 0; }

@media (max-width: 800px) {
  .main-grid { grid-template-columns: 1fr; }
  .stats-bar { gap: 20px; padding: 14px 16px; flex-wrap: wrap; }
  .dot-label { display: none; }
  .step-card { padding: 18px; }
  .tts-demo { padding: 20px 14px 80px; }
}
</style>
