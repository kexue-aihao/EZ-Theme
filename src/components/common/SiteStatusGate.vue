<template>
  <!-- 检查中：给一个不挡路的小标记（与产物一致——此刻还不知道该不该拦） -->
  <div v-if="loading" class="ez-status-loading">
    <span class="ez-status-mark" aria-hidden="true"></span>
    <span>{{ $t('statusGate.checking') }}</span>
  </div>

  <!-- 读不到站点状态：不静默放行，也不假装正常，给一页可重试的提示 -->
  <main v-else-if="error" class="ez-status-page is-error">
    <div class="ez-status-panel">
      <span class="ez-status-kicker">SERVICE STATUS</span>
      <h1>{{ $t('statusGate.errorTitle') }}</h1>
      <p>{{ error }}</p>
      <div class="ez-status-actions">
        <button type="button" class="ez-status-action" @click="load">
          {{ $t('statusGate.retry') }}
        </button>
      </div>
    </div>
  </main>

  <!-- 维护 / 停服：整页拦截，路由内容不渲染 -->
  <main
    v-else-if="status.mode !== 'normal'"
    class="ez-status-page"
    :class="`is-${status.mode}`"
    role="status"
    aria-live="polite"
  >
    <div class="ez-status-orbit" aria-hidden="true">
      <span class="ez-status-orbit-line"></span>
      <span class="ez-status-orbit-node"></span>
      <span class="ez-status-orbit-node ez-status-orbit-node-secondary"></span>
    </div>
    <div class="ez-status-panel">
      <span class="ez-status-kicker">
        {{
          status.mode === 'maintenance'
            ? $t('statusGate.kickerMaintenance')
            : $t('statusGate.kickerShutdown')
        }}
      </span>
      <h1>{{ status.title }}</h1>
      <p>{{ status.message }}</p>
      <div v-if="remaining !== null" class="ez-status-countdown">
        <span class="ez-status-countdown-label">{{ $t('statusGate.recoveryLabel') }}</span>
        <strong v-if="remaining > 0">{{ countdownText }}</strong>
        <strong v-else>{{ $t('statusGate.recoveryReached') }}</strong>
      </div>
      <div class="ez-status-actions">
        <button
          v-if="status.mode === 'maintenance'"
          type="button"
          class="ez-status-action"
          @click="load"
        >
          {{ $t('statusGate.retry') }}
        </button>
        <a
          v-if="status.mode === 'shutdown' && status.support_url"
          class="ez-status-action ez-status-action-secondary"
          :href="status.support_url"
          target="_blank"
          rel="noopener noreferrer"
        >
          {{ $t('statusGate.support') }}
        </a>
      </div>
    </div>
  </main>

  <slot v-else />
</template>

<script setup name="SiteStatusGate">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { getWebsiteConfig } from '@/api/auth';

const { t } = useI18n();

// 后端没给 title/message 时的兜底（正常情况由 /guest/comm/config 提供）
const defaultStatus = (mode) => ({
  mode,
  title: mode === 'shutdown' ? t('statusGate.titleShutdown') : t('statusGate.titleMaintenance'),
  message: t('statusGate.message'),
  recovery_at: null,
  server_time: null,
  support_url: ''
});

const loading = ref(true);
const error = ref('');
const status = ref(defaultStatus('normal'));
const now = ref(Math.floor(Date.now() / 1000));

let timer = null;
/** 服务端与本地的时钟差：倒计时按服务端时间算，免得本地时间不准导致倒计时乱跳 */
let clockOffset = 0;

const remaining = computed(() =>
  status.value.recovery_at
    ? Math.max(0, Number(status.value.recovery_at) - (now.value + clockOffset))
    : null
);

const countdownText = computed(() => {
  const total = Math.floor(remaining.value || 0);
  const pad = (n) => String(n).padStart(2, '0');
  return [
    pad(Math.floor(total / 86400)) + t('statusGate.days'),
    pad(Math.floor((total % 86400) / 3600)) + t('statusGate.hours'),
    pad(Math.floor((total % 3600) / 60)) + t('statusGate.minutes'),
    pad(total % 60) + t('statusGate.seconds')
  ].join(' ');
});

const load = async () => {
  loading.value = true;
  error.value = '';
  try {
    const response = await getWebsiteConfig();
    const raw = response?.data?.site_status || {};
    const mode = ['maintenance', 'shutdown'].includes(raw.mode) ? raw.mode : 'normal';
    status.value = {
      ...defaultStatus(mode),
      ...raw,
      mode,
      recovery_at: raw.recovery_at ? Number(raw.recovery_at) : null,
      server_time: raw.server_time ? Number(raw.server_time) : null,
      support_url: typeof raw.support_url === 'string' ? raw.support_url : ''
    };
    if (status.value.server_time) {
      clockOffset = status.value.server_time - Math.floor(Date.now() / 1000);
    }
  } catch (err) {
    status.value = defaultStatus('normal');
    error.value = err?.message || t('common.networkError');
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  timer = window.setInterval(() => {
    now.value = Math.floor(Date.now() / 1000);
  }, 1000);
  load();
});

onUnmounted(() => {
  if (timer) window.clearInterval(timer);
});
</script>

<style lang="scss" scoped>
.ez-status-loading,
.ez-status-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 32px 20px;
  color: var(--text-color, #292524);
  background: var(--background-color, #f8f7f2);
}

.ez-status-loading {
  grid-auto-flow: column;
  gap: 12px;
  font-size: 14px;
}

.ez-status-panel {
  width: min(100%, 560px);
  text-align: center;
}

.ez-status-kicker {
  color: var(--theme-color, #171717);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
}

.ez-status-page.is-maintenance .ez-status-kicker {
  color: var(--warning-color, #8a5b18);
}

.ez-status-page.is-shutdown .ez-status-kicker {
  color: var(--error-color, #a0443f);
}

.ez-status-countdown {
  margin: 28px auto 0;
  width: min(100%, 430px);
  padding: 16px 18px;
  border: 1px solid var(--border-color, #d6d3d1);
  background: color-mix(in srgb, var(--card-background, #fff) 85%, transparent);
  text-align: left;
}

.ez-status-countdown-label {
  display: block;
  margin-bottom: 6px;
  color: var(--secondary-text-color, #57534e);
  font-size: 12px;
}

.ez-status-countdown strong {
  display: block;
  font-variant-numeric: tabular-nums;
  font-size: clamp(19px, 4vw, 28px);
  letter-spacing: 0;
  white-space: nowrap;
}

.ez-status-actions {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-top: 24px;
}

.ez-status-action {
  min-height: 44px;
  padding: 0 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--theme-color, #171717);
  background: var(--theme-color, #171717);
  color: #fff;
  text-decoration: none;
  cursor: pointer;
}

.ez-status-action-secondary {
  background: transparent;
  color: var(--theme-color, #171717);
}

.ez-status-orbit {
  position: relative;
  width: 112px;
  height: 112px;
  margin: 0 auto 28px;
  border: 1px solid currentColor;
  border-radius: 50%;
  opacity: 0.75;

  &:before,
  &:after {
    content: '';
    position: absolute;
    inset: 15px;
    border: 1px solid currentColor;
    border-left-color: transparent;
    border-radius: 50%;
    opacity: 0.45;
  }

  &:after {
    inset: 29px;
    border-right-color: transparent;
  }
}

.ez-status-orbit-line {
  position: absolute;
  width: 42px;
  height: 1px;
  left: 35px;
  top: 55px;
  background: currentColor;
  transform: rotate(-24deg);
  opacity: 0.55;
}

.ez-status-orbit-node {
  position: absolute;
  width: 8px;
  height: 8px;
  top: 19px;
  right: 20px;
  border-radius: 50%;
  background: currentColor;
  animation: ez-status-pulse 2.8s ease-in-out infinite;
}

.ez-status-orbit-node-secondary {
  top: auto;
  right: auto;
  bottom: 22px;
  left: 20px;
  animation-delay: -1.4s;
}

.is-maintenance .ez-status-orbit {
  color: var(--warning-color, #8a5b18);
}

.is-shutdown .ez-status-orbit {
  color: var(--error-color, #a0443f);
  border-radius: 20px;
  border-style: dashed;
}

.is-shutdown .ez-status-orbit-line {
  width: 28px;
  left: 42px;
}

.is-shutdown .ez-status-orbit-node {
  animation-duration: 3.4s;
}

.ez-status-mark {
  width: 9px;
  height: 9px;
  border: 1px solid currentColor;
  border-radius: 50%;
  animation: ez-status-pulse 2.8s ease-in-out infinite;
}

@keyframes ez-status-pulse {
  0%,
  100% {
    transform: scale(0.8);
    opacity: 0.35;
  }

  50% {
    transform: scale(1.15);
    opacity: 1;
  }
}

@media (max-width: 640px) {
  .ez-status-loading,
  .ez-status-page {
    padding: 24px 16px;
  }

  .ez-status-countdown strong {
    white-space: normal;
  }
}
</style>
