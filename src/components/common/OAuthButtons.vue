<template>
  <div v-if="visible" class="oauth-buttons">
    <div class="oauth-divider">
      <span>{{ $t('auth.oauth.divider') }}</span>
    </div>

    <div class="oauth-provider-list">
      <button
        v-for="provider in buttonProviders"
        :key="provider.key"
        type="button"
        class="oauth-provider-button"
        :disabled="busy"
        @click="startRedirect(provider.key)"
      >
        {{ provider.label }}
      </button>
    </div>

    <!-- Telegram 登录组件：需要能连上 telegram.org，连不上就提示改用邮箱登录 -->
    <div v-if="hasTelegram" class="oauth-telegram">
      <div :id="containerId" class="oauth-telegram-mount"></div>
      <p v-if="telegramStatus === 'loading'" class="oauth-hint">
        {{ $t('auth.oauth.telegramLoading') }}
      </p>
      <p v-else-if="telegramStatus === 'failed'" class="oauth-hint oauth-hint-error">
        {{ $t('auth.oauth.telegramBlocked') }}
      </p>
      <p v-else-if="telegramStatus === 'ready'" class="oauth-hint">
        {{ $t('auth.oauth.telegramReady') }}
      </p>
    </div>
  </div>
</template>

<script setup name="OAuthButtons">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useToast } from '@/composables/useToast';
import { getCommConfig } from '@/api/user';
import { completeOAuth, getOAuthState } from '@/api/auth';

/**
 * 第三方登录入口（与 signature 产物同形）。
 *
 * Google / GitHub：整页跳到后端的 /passport/oauth/{provider}/redirect，回来时地址栏带
 * ?oauth_ticket=…（失败是 ?oauth_error=…），页面调用 completeOAuth 换登录态。
 * Telegram：加载 telegram-widget.js 用机器人渲染登录按钮，回调里拿 data 直接 complete。
 *
 * 成功/失败都通过 completed 事件交给页面处理（本组件不改路由、不写本地登录态）。
 */
const emit = defineEmits(['completed']);

const { t } = useI18n();
const { showToast } = useToast();

const oauthConfig = ref(null);
const busy = ref(false);
const telegramStatus = ref('loading');
const containerId = `oauth-telegram-${Math.random().toString(36).slice(2, 10)}`;
const callbackName = `ezTelegramAuth_${Math.random().toString(36).slice(2, 10)}`;

const PROVIDERS = [
  { key: 'google', label: 'Google' },
  { key: 'github', label: 'GitHub' }
];

const buttonProviders = computed(() =>
  PROVIDERS.filter((provider) => oauthConfig.value?.[provider.key])
);
const hasTelegram = computed(() => Boolean(oauthConfig.value?.telegram));
const visible = computed(() => Boolean(buttonProviders.value.length || hasTelegram.value));

const handleResult = (data) => {
  emit('completed', data || {});
};

/** 把后端返回的失败原因翻成人话（键都在批 1 搬进来的 auth.oauth.* 里） */
const describeError = (code) => {
  const map = {
    embedded_browser: 'auth.oauth.telegramFailed',
    authorization_cancelled: 'auth.oauth.completeFailed',
    invalid_oauth_state: 'auth.oauth.telegramExpired',
    oauth_verification_failed: 'auth.oauth.telegramFailed'
  };
  return t(map[code] || 'auth.oauth.completeFailed');
};

/** Google / GitHub：记下用的是哪家，回来时 complete 要带上 */
const startRedirect = (provider) => {
  if (busy.value) return;
  busy.value = true;
  try {
    localStorage.setItem('oauth_provider', provider);
  } catch (e) {
    // 隐私模式下写不了也不致命：回来时按 google 兜底
  }
  window.location.assign(`/api/v1/passport/oauth/${provider}/redirect`);
};

// Telegram widget 需要一个全局回调
window[callbackName] = async (user) => {
  telegramStatus.value = 'ready';
  try {
    const stateResponse = await getOAuthState('telegram');
    const state = stateResponse?.data?.state || '';
    const response = await completeOAuth({ provider: 'telegram', state, data: user });
    handleResult(response?.data);
  } catch (err) {
    showToast(err?.response?.message || err?.message || t('auth.oauth.telegramFailed'), 'error');
  }
};

const loadTelegramWidget = () => {
  if (!hasTelegram.value) return;
  const bot = oauthConfig.value.telegram_bot_username;
  if (!bot) {
    telegramStatus.value = 'failed';
    return;
  }
  const script = document.createElement('script');
  script.src = 'https://telegram.org/js/telegram-widget.js?22';
  script.async = true;
  script.setAttribute('data-telegram-login', String(bot).replace(/^@/, ''));
  script.setAttribute('data-size', 'large');
  script.setAttribute('data-radius', '8');
  script.setAttribute('data-request-access', 'write');
  script.setAttribute('data-onauth', `${callbackName}(user)`);
  script.onerror = () => {
    telegramStatus.value = 'failed';
  };
  // 8 秒还没渲染出来就当作连不上 telegram.org
  const timeout = window.setTimeout(() => {
    if (telegramStatus.value === 'loading') telegramStatus.value = 'failed';
  }, 8000);
  script.onload = () => {
    window.clearTimeout(timeout);
    telegramStatus.value = 'ready';
  };
  document.getElementById(containerId)?.appendChild(script);
};

onMounted(async () => {
  try {
    const response = await getCommConfig();
    oauthConfig.value = response?.data?.oauth || null;
  } catch (err) {
    oauthConfig.value = null;
  }
  loadTelegramWidget();
});

onUnmounted(() => {
  delete window[callbackName];
});

defineExpose({ describeError });
</script>

<style lang="scss" scoped>
.oauth-buttons {
  display: flex;
  flex-direction: column;
  gap: 14px;

  .oauth-divider {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--secondary-text-color);
    font-size: 12px;

    &:before,
    &:after {
      content: '';
      flex: 1;
      height: 1px;
      background: var(--border-color);
    }
  }

  .oauth-provider-list {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }

  .oauth-provider-button {
    flex: 1 1 140px;
    min-height: 42px;
    padding: 0 16px;
    border: 1px solid var(--border-color);
    border-radius: 10px;
    background: var(--card-background);
    color: var(--text-color);
    font-size: 14px;
    cursor: pointer;
    transition: border-color 0.2s ease, transform 0.2s ease;

    &:hover:not(:disabled) {
      border-color: var(--theme-color);
      transform: translateY(-1px);
    }

    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  }

  .oauth-telegram {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }

  .oauth-hint {
    margin: 0;
    color: var(--secondary-text-color);
    font-size: 12px;
    text-align: center;
  }

  .oauth-hint-error {
    color: var(--error-color);
  }
}
</style>
