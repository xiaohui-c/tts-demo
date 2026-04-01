<template>
  <div class="tts-demo">
    <h1 class="title">语音流程演示系统Demo</h1>
    <p class="subtitle">基于讯飞语音合成API · 每一步都会自动播放语音</p>

    <!-- 步骤进度条 -->
    <div class="progress-bar">
      <div
        v-for="(step, index) in steps"
        :key="index"
        class="progress-dot"
        :class="{
          active: index === currentStep,
          completed: index < currentStep
        }"
        @click="goToStep(index)"
      >
        <span class="dot-number">{{ index + 1 }}</span>
        <span class="dot-label">{{ step.title }}</span>
      </div>
      <div class="progress-line">
        <div
          class="progress-fill"
          :style="{ width: `${(currentStep / (steps.length - 1)) * 100}%` }"
        ></div>
      </div>
    </div>

    <!-- 步骤内容卡片 -->
    <div class="step-card">
      <div class="step-header">
        <span class="step-badge">步骤 {{ currentStep + 1 }}/{{ steps.length }}</span>
        <h2 class="step-title">{{ currentStepData.title }}</h2>
      </div>

      <!-- 文本内容区域 - 逐字显示 -->
      <div class="step-content">
        <p class="step-text">{{ displayedText }}<span v-if="isTyping" class="cursor">|</span></p>
      </div>

      <!-- 语音状态 -->
      <div class="audio-status" :class="audioStatusClass">
        <span class="status-icon">{{ audioStatusIcon }}</span>
        <span class="status-text">{{ audioStatusText }}</span>
      </div>

      <!-- 操作按钮 -->
      <div class="step-actions">
        <button
          class="btn btn-secondary"
          :disabled="currentStep === 0 || isProcessing"
          @click="prevStep"
        >
          ← 上一步
        </button>

        <button
          class="btn btn-primary"
          :disabled="isProcessing"
          @click="replayAudio"
        >
          🔊 重新播放
        </button>

        <button
          class="btn btn-secondary"
          :disabled="currentStep === steps.length - 1 || isProcessing"
          @click="nextStep"
        >
          下一步 →
        </button>
      </div>
    </div>

    <!-- 所有步骤列表 -->
    <div class="steps-list">
      <h3>全部步骤</h3>
      <div
        v-for="(step, index) in steps"
        :key="index"
        class="step-item"
        :class="{ active: index === currentStep, completed: index < currentStep }"
        @click="goToStep(index)"
      >
        <span class="step-item-number">{{ index + 1 }}</span>
        <div class="step-item-info">
          <span class="step-item-title">{{ step.title }}</span>
          <span class="step-item-preview">{{ step.content.substring(0, 40) }}...</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { synthesizeSpeech, decodeAudioChunks, playPCMAudio, ensureAudioContext } from '../utils/xfyunTTS.js'

// 演示步骤数据
const steps = ref([
  {
    title: '欢迎使用',
    content: '欢迎使用语音流程演示系统！本系统将引导您逐步了解文本转语音的工作流程。每切换到一个新步骤，系统都会自动为您朗读对应的文本内容。'
  },
  {
    title: '系统介绍',
    content: '本系统基于讯飞超拟人交互API构建，采用WebSocket协议实时传输音频数据。超拟人语音合成技术可以生成自然、流畅、富有情感的语音效果。'
  },
  {
    title: '技术原理',
    content: '语音合成的过程分为三步：首先，客户端将文本发送到讯飞服务器；然后，服务器使用深度学习模型将文本转换为音频数据；最后，客户端接收并播放这些音频。'
  },
  {
    title: '应用场景',
    content: '文本转语音技术广泛应用于智能客服、有声阅读、导航播报、教育培训等领域。通过超拟人合成，语音可以更加贴近真人发音，提升用户体验。'
  },
  {
    title: '操作说明',
    content: '您可以点击上方的步骤节点或使用下方的按钮来切换步骤。每个步骤切换时都会自动合成并播放语音。如果想重听，可以点击重新播放按钮。'
  },
  {
    title: '完成演示',
    content: '恭喜您已经完成了全部的流程演示！您已经了解了讯飞超拟人语音合成的基本使用方式。感谢您的体验，期待您在更多场景中使用语音合成技术！'
  }
])

const currentStep = ref(0)
const displayedText = ref('')
const isTyping = ref(false)
const audioStatus = ref('idle') // idle | connecting | synthesizing | playing | error | done
const isProcessing = ref(false)

// 当前 WebSocket 关闭函数
let closeWs = null
let typingTimer = null

const currentStepData = computed(() => steps.value[currentStep.value])

const audioStatusClass = computed(() => ({
  idle: 'status-idle',
  connecting: 'status-connecting',
  synthesizing: 'status-synthesizing',
  playing: 'status-playing',
  error: 'status-error',
  done: 'status-done'
}[audioStatus.value]))

const audioStatusIcon = computed(() => ({
  idle: '�',
  connecting: '🔄',
  synthesizing: '⏳',
  playing: '🔊',
  error: '❌',
  done: '✅'
}[audioStatus.value]))

const audioStatusText = computed(() => ({
  idle: '语音已就绪，点击任意位置即可播放',
  connecting: '正在请求语音服务...',
  synthesizing: '语音合成中...',
  playing: '正在播放...',
  error: '语音合成失败',
  done: '播放完成'
}[audioStatus.value]))

function startTyping(text) {
  displayedText.value = ''
  isTyping.value = true
  let index = 0

  return new Promise(resolve => {
    typingTimer = setInterval(() => {
      if (index < text.length) {
        displayedText.value += text[index]
        index++
      } else {
        clearInterval(typingTimer)
        isTyping.value = false
        resolve()
      }
    }, 50)
  })
}

function stopTyping() {
  if (typingTimer) {
    clearInterval(typingTimer)
    typingTimer = null
  }
  isTyping.value = false
}

function stopCurrentAudio() {
  if (closeWs) { closeWs(); closeWs = null }
}

// 合成完成但尚未播放的 PCM 数据（等待用户首次交互）
let pendingPCM = null
let userInteracted = false

function onUserInteraction() {
  if (userInteracted) return
  userInteracted = true
  document.removeEventListener('click', onUserInteraction)
  document.removeEventListener('keydown', onUserInteraction)
  if (pendingPCM) {
    const pcm = pendingPCM
    pendingPCM = null
    audioStatus.value = 'playing'
    isProcessing.value = true
    playPCMAudio(pcm)
      .then(() => { audioStatus.value = 'done' })
      .catch(() => { audioStatus.value = 'error' })
      .finally(() => { isProcessing.value = false })
  }
}

async function playStepAudio(text) {
  stopCurrentAudio()
  audioStatus.value = 'connecting'
  isProcessing.value = true
  const audioChunks = []

  return new Promise((resolve) => {
    closeWs = synthesizeSpeech(text, {
      onAudio(b64) {
        audioStatus.value = 'synthesizing'
        audioChunks.push(b64)
      },
      async onComplete() {
        if (audioChunks.length === 0) {
          audioStatus.value = 'done'
          isProcessing.value = false
          resolve()
          return
        }
        try {
          const pcmData = await decodeAudioChunks(audioChunks)
          if (userInteracted) {
            // 用户已交互，直接播放
            audioStatus.value = 'playing'
            await playPCMAudio(pcmData)
            audioStatus.value = 'done'
            isProcessing.value = false
          } else {
            // 尝试调用 ensureAudioContext，如果 AudioContext 可用则直接播放
            try {
              ensureAudioContext()
              audioStatus.value = 'playing'
              await playPCMAudio(pcmData)
              userInteracted = true
              audioStatus.value = 'done'
              isProcessing.value = false
            } catch {
              // AudioContext 被拦截，缓存等待用户点击
              pendingPCM = pcmData
              audioStatus.value = 'idle'
              isProcessing.value = false
              document.addEventListener('click', onUserInteraction)
              document.addEventListener('keydown', onUserInteraction)
            }
          }
        } catch (e) {
          console.error('播放音频失败:', e)
          audioStatus.value = 'error'
          isProcessing.value = false
        }
        resolve()
      },
      onError(err) {
        console.error('TTS错误:', err)
        audioStatus.value = 'error'
        isProcessing.value = false
        resolve()
      }
    })
  })
}

async function activateStep(index) {
  stopTyping()
  stopCurrentAudio()
  currentStep.value = index
  const text = steps.value[index].content
  startTyping(text)
  await playStepAudio(text)
}

function nextStep() {
  if (currentStep.value < steps.value.length - 1) activateStep(currentStep.value + 1)
}

function prevStep() {
  if (currentStep.value > 0) activateStep(currentStep.value - 1)
}

function goToStep(index) {
  if (index !== currentStep.value && !isProcessing.value) activateStep(index)
}

function replayAudio() {
  activateStep(currentStep.value)
}

onMounted(() => {
  activateStep(0)
})

onUnmounted(() => {
  stopTyping()
  stopCurrentAudio()
  document.removeEventListener('click', onUserInteraction)
  document.removeEventListener('keydown', onUserInteraction)
})
</script>

<style scoped>
.start-overlay {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 80vh;
  cursor: pointer;
}

.start-card {
  text-align: center;
  padding: 60px 40px;
  border-radius: 20px;
  background: var(--bg);
  border: 1px solid var(--border);
  box-shadow: var(--shadow);
}

.btn-start {
  margin-top: 24px;
  padding: 16px 48px;
  font-size: 18px;
  border-radius: 12px;
}
.tts-demo {
  max-width: 800px;
  margin: 0 auto;
  padding: 40px 20px;
}

.title {
  text-align: center;
  font-size: 36px;
  margin-bottom: 8px;
  padding: 4px 8px;
  background: linear-gradient(135deg, var(--accent), #6366f1);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  white-space: nowrap;
}

.subtitle {
  text-align: center;
  color: var(--text);
  margin-bottom: 48px;
  font-size: 16px;
}

/* 进度条 */
.progress-bar {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  position: relative;
  margin-bottom: 48px;
  padding: 0 20px;
}

.progress-line {
  position: absolute;
  top: 18px;
  left: 40px;
  right: 40px;
  height: 3px;
  background: var(--border);
  z-index: 0;
  border-radius: 2px;
}

.progress-fill {
  height: 100%;
  background: var(--accent);
  transition: width 0.5s ease;
  border-radius: 2px;
}

.progress-dot {
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  z-index: 1;
  cursor: pointer;
  gap: 8px;
}

.dot-number {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--bg);
  border: 3px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 14px;
  color: var(--text);
  transition: all 0.3s ease;
}

.progress-dot.active .dot-number {
  border-color: var(--accent);
  background: var(--accent);
  color: white;
  box-shadow: 0 0 0 4px var(--accent-bg);
}

.progress-dot.completed .dot-number {
  border-color: var(--accent);
  background: var(--accent);
  color: white;
}

.dot-label {
  font-size: 12px;
  color: var(--text);
  white-space: nowrap;
  transition: color 0.3s;
}

.progress-dot.active .dot-label {
  color: var(--accent);
  font-weight: 600;
}

/* 步骤卡片 */
.step-card {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 32px;
  box-shadow: var(--shadow);
  margin-bottom: 32px;
}

.step-header {
  margin-bottom: 24px;
}

.step-badge {
  display: inline-block;
  padding: 4px 12px;
  background: var(--accent-bg);
  color: var(--accent);
  border-radius: 20px;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 12px;
}

.step-title {
  font-size: 28px;
  margin: 0;
}

.step-content {
  height: 140px;
  padding: 20px;
  background: var(--code-bg);
  border-radius: 12px;
  margin-bottom: 24px;
  overflow: hidden;
}

.step-text {
  font-size: 17px;
  line-height: 1.8;
  margin: 0;
  color: var(--text-h);
}

.cursor {
  animation: blink 0.8s infinite;
  color: var(--accent);
  font-weight: 300;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

/* 音频状态 */
.audio-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-radius: 8px;
  margin-bottom: 24px;
  font-size: 14px;
  transition: all 0.3s;
}

.status-idle {
  background: var(--code-bg);
  color: var(--text);
}

.status-connecting, .status-synthesizing {
  background: #fef3c7;
  color: #92400e;
}

@media (prefers-color-scheme: dark) {
  .status-connecting, .status-synthesizing {
    background: rgba(254, 243, 199, 0.1);
    color: #fbbf24;
  }
}

.status-playing {
  background: var(--accent-bg);
  color: var(--accent);
}

.status-error {
  background: #fee2e2;
  color: #dc2626;
}

@media (prefers-color-scheme: dark) {
  .status-error {
    background: rgba(254, 226, 226, 0.1);
    color: #f87171;
  }
}

.status-done {
  background: #d1fae5;
  color: #065f46;
}

@media (prefers-color-scheme: dark) {
  .status-done {
    background: rgba(209, 250, 229, 0.1);
    color: #34d399;
  }
}

.status-icon {
  font-size: 18px;
}

/* 按钮 */
.step-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.btn {
  padding: 10px 24px;
  border-radius: 8px;
  border: none;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  font-family: var(--sans);
}

.btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-primary {
  background: var(--accent);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  filter: brightness(1.1);
  transform: translateY(-1px);
}

.btn-secondary {
  background: var(--code-bg);
  color: var(--text-h);
  border: 1px solid var(--border);
}

.btn-secondary:hover:not(:disabled) {
  background: var(--accent-bg);
  border-color: var(--accent-border);
}

/* 步骤列表 */
.steps-list {
  padding: 0 4px;
}

.steps-list h3 {
  font-size: 18px;
  margin-bottom: 16px;
  color: var(--text-h);
}

.step-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 16px;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
  margin-bottom: 8px;
  border: 1px solid transparent;
}

.step-item:hover {
  background: var(--code-bg);
}

.step-item.active {
  background: var(--accent-bg);
  border-color: var(--accent-border);
}

.step-item.completed {
  opacity: 0.7;
}

.step-item-number {
  width: 28px;
  height: 28px;
  min-width: 28px;
  border-radius: 50%;
  background: var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}

.step-item.active .step-item-number {
  background: var(--accent);
  color: white;
}

.step-item.completed .step-item-number {
  background: var(--accent);
  color: white;
}

.step-item-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.step-item-title {
  font-weight: 600;
  font-size: 15px;
  color: var(--text-h);
}

.step-item-preview {
  font-size: 13px;
  color: var(--text);
}

/* 响应式 */
@media (max-width: 640px) {
  .tts-demo {
    padding: 20px 16px;
  }

  .title {
    font-size: 28px;
  }

  .dot-label {
    display: none;
  }

  .step-card {
    padding: 20px;
  }

  .step-title {
    font-size: 22px;
  }

  .step-actions {
    flex-direction: column;
  }

  .btn {
    width: 100%;
  }
}
</style>
