<template>

  <div class="landing-page" :class="{ 'dark-theme': isDarkTheme }" ref="landingPageRef">



    

    <!-- 背景装饰 -->

    <div class="background-decoration">

      <div class="bg-circle circle-1" :class="{ 'dark-mode': isDarkTheme }"></div>

      <div class="bg-circle circle-2" :class="{ 'dark-mode': isDarkTheme }"></div>

      <div class="bg-circle circle-3" :class="{ 'dark-mode': isDarkTheme }"></div>

    </div>

    

    <!-- 顶部工具栏 -->

    <div class="top-toolbar">

      <ThemeToggle />

      <LanguageSelector />
      <button type="button" class="landing-login-button" @click="navigateToLogin">
        {{ $t('common.login') }}
      </button>


    </div>

    

    <!-- 中央内容区 -->

    <div class="content-container">

      <div class="site-title">

        <img v-if="siteConfig.showLogo" src="/images/logo.png" alt="Logo" class="site-logo-img" />

        {{ siteConfig.siteName }}

      </div>

      <div class="landing-text">{{ $t('landing.mainText') }}</div>

    </div>

    

    <!-- 底部箭头 -->

    <div class="scroll-arrow-container" @click="scrollToPlans">

      <div class="scroll-arrow">

        <IconChevronDown :size="32" :stroke-width="1.5" />

      </div>

      <div class="scroll-text">{{ $t('landing.scrollToPlans') }}</div>

    </div>

    

    <!-- 套餐区 -->
    <section id="plans" ref="plansSectionRef" class="landing-plans" aria-labelledby="landing-plans-title">
      <div class="plans-header">
        <h2 id="landing-plans-title" class="plans-title">{{ $t('landing.plans.title') }}</h2>
        <p class="plans-note">{{ $t('landing.plans.note') }}</p>
      </div>

      <div class="period-toggle" role="tablist" :aria-label="$t('landing.plans.title')">
        <button
          v-for="option in periodOptions"
          :key="option.key"
          type="button"
          role="tab"
          class="period-option"
          :class="{ active: period === option.key }"
          :aria-selected="period === option.key ? 'true' : 'false'"
          @click="period = option.key"
        >
          {{ $t(option.labelKey) }}
        </button>
      </div>

      <div v-if="orderError" class="plans-alert" role="alert">{{ orderError }}</div>

      <div class="plans-grid" aria-live="polite">
        <template v-if="plansLoading">
          <div
            v-for="n in 3"
            :key="'skeleton-' + n"
            class="plan-card plan-skeleton"
            aria-hidden="true"
          >
            <div class="skeleton-line skeleton-badge"></div>
            <div class="skeleton-line skeleton-title"></div>
            <div class="skeleton-line skeleton-price"></div>
            <div class="skeleton-line"></div>
            <div class="skeleton-line"></div>
          </div>
        </template>

        <div v-else-if="plansError" class="plans-message">
          <p>{{ plansError }}</p>
          <button type="button" class="plans-retry-button" @click="fetchPlans">
            {{ $t('landing.plans.retry') }}
          </button>
        </div>

        <template v-else-if="visiblePlans.length">
          <div
            v-for="(plan, index) in visiblePlans"
            :key="plan.id"
            class="plan-card"
            :class="{ featured: index === 1 }"
          >
            <div class="plan-card-top">
              <span class="plan-index">0{{ index + 1 }}</span>
              <span v-if="index === 1" class="plan-badge">{{ $t('landing.plans.featured') }}</span>
            </div>

            <h3 class="plan-name">{{ plan.name }}</h3>

            <div class="plan-price">
              <template v-if="hasPrice(plan)">
                <span class="plan-price-amount">¥{{ formatAmount(priceOf(plan)) }}</span>
                <span class="plan-price-period">/ {{ $t(currentPeriodLabelKey) }}</span>
              </template>
              <span v-else class="plan-price-period">--</span>
            </div>

            <div class="plan-meta">
              <div class="plan-meta-item">
                <span class="plan-meta-label">{{ $t('landing.plans.traffic') }}</span>
                <span class="plan-meta-value">{{ transferLabel(plan) }}</span>
              </div>
              <div class="plan-meta-item">
                <span class="plan-meta-label">{{ $t('landing.plans.devices') }}</span>
                <span class="plan-meta-value">{{ deviceLabel(plan) }}</span>
              </div>
            </div>

            <div class="plan-description">
              <div
                v-if="planDescriptions[plan.id].html"
                class="html-content"
                v-html="planDescriptions[plan.id].html"
              ></div>
              <ul v-else class="plan-features">
                <li
                  v-for="(feature, i) in planDescriptions[plan.id].features"
                  :key="i"
                  :class="{ 'disabled-feature': feature.support === false }"
                >{{ feature.feature }}</li>
              </ul>
            </div>

            <button
              type="button"
              class="plan-buy-button"
              :disabled="!hasPrice(plan) || isSoldOut(plan) || busyPlanId === plan.id"
              @click="buy(plan)"
            >
              {{
                isSoldOut(plan)
                  ? $t('landing.plans.soldOut')
                  : busyPlanId === plan.id ? $t('landing.plans.processing') : $t('landing.plans.buy')
              }}
            </button>
          </div>
        </template>

        <div v-else class="plans-message">
          <p>{{ $t('landing.plans.empty') }}</p>
          <button type="button" class="plans-retry-button" @click="fetchPlans">
            {{ $t('landing.plans.retry') }}
          </button>
        </div>
      </div>
    </section>
    <!-- 页面过渡遮罩 -->

    <div class="page-transition-mask" :class="{ 'active': isTransitioning }"></div>

  </div>

</template>



<script>

import { ref, onMounted, onUnmounted, computed } from 'vue';

import { useRouter } from 'vue-router';

import { useStore } from 'vuex';

import { useI18n } from 'vue-i18n';

import { SITE_CONFIG, DEFAULT_CONFIG } from '@/utils/baseConfig';


import ThemeToggle from '@/components/common/ThemeToggle.vue';

import LanguageSelector from '@/components/common/LanguageSelector.vue';

import { IconChevronDown } from '@tabler/icons-vue';
import { fetchGuestPlans, submitOrder } from '@/api/shop';
import { checkLoginStatus } from '@/api/auth';
import { savePendingPurchase } from '@/utils/pendingPurchase';
import DOMPurify from 'dompurify';

import DomainAuthAlert from '@/components/common/DomainAuthAlert.vue';



export default {

  name: 'LandingPage',

  components: {

    ThemeToggle,

    LanguageSelector,

    IconChevronDown,

    DomainAuthAlert

  },

  setup() {

    const router = useRouter();

    const store = useStore();

    const { t } = useI18n();

    const landingPageRef = ref(null);

    

    const isDarkTheme = computed(() => store.getters.currentTheme === 'dark');

    

    const siteConfig = ref(SITE_CONFIG);

    const defaultConfig = ref(DEFAULT_CONFIG);

    

    const isTransitioning = ref(false);

    


    

    const navigateToLogin = () => {

      if (isTransitioning.value) {

        return;

      }



      isTransitioning.value = true;

      

      document.body.classList.add('page-transitioning');

      

      console.log(t('landing.navigatingToLogin', 'Navigating to login page'));

      

      setTimeout(() => {

        router.push('/login');

      }, 600); 
    };

    

    // ---- 套餐区（公开接口，未登录也能看）----

    const plansSectionRef = ref(null);

    const plans = ref([]);

    const plansLoading = ref(false);

    const plansError = ref('');

    const orderError = ref('');

    const busyPlanId = ref(null);

    const period = ref('month_price');

    const periodOptions = [

      { key: 'month_price', labelKey: 'landing.plans.periods.month' },

      { key: 'quarter_price', labelKey: 'landing.plans.periods.quarter' },

      { key: 'half_year_price', labelKey: 'landing.plans.periods.halfYear' },

      { key: 'year_price', labelKey: 'landing.plans.periods.year' }

    ];

    const currentPeriodLabelKey = computed(() => {

      const option = periodOptions.find((item) => item.key === period.value);

      return option ? option.labelKey : periodOptions[0].labelKey;

    });

    const visiblePlans = computed(() =>

      plans.value.filter((plan) => plan.show !== 0 && plan.show !== false)

    );

    const scrollToPlans = () => {

      plansSectionRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });

    };

    const fetchPlans = async () => {

      plansLoading.value = true;

      plansError.value = '';

      try {

        const response = await fetchGuestPlans();

        plans.value = Array.isArray(response?.data) ? response.data : [];

      } catch (err) {

        plansError.value = err?.response?.message || err?.message || t('landing.plans.loadFailed');

      } finally {

        plansLoading.value = false;

      }

    };

    const priceOf = (plan) => plan[period.value];

    const hasPrice = (plan) => priceOf(plan) !== null && priceOf(plan) !== undefined;

    const isSoldOut = (plan) =>

      plan.capacity_limit !== null && plan.capacity_limit !== undefined && plan.capacity_limit <= 0;

    // 后端价格以分为单位

    const formatAmount = (amount) => (Number(amount) / 100).toFixed(2);

    const transferLabel = (plan) =>

      plan.transfer_enable > 0

        ? t('landing.plans.trafficAmount', { count: plan.transfer_enable })

        : t('landing.plans.unlimited');

    const deviceLabel = (plan) =>

      plan.device_limit > 0

        ? t('landing.plans.deviceAmount', { count: plan.device_limit })

        : t('landing.plans.unlimited');

    const describeContent = (content) => {
      const value = String(content || '');
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed) && parsed.length > 0 && parsed.every((item) =>
          item !== null && typeof item === 'object' && !Array.isArray(item) &&
          Object.prototype.hasOwnProperty.call(item, 'feature')
        )) {
          return { html: '', features: parsed };
        }
      } catch (error) {
        // HTML and plain text descriptions do not use the feature JSON format.
      }

      const holder = document.createElement('div');
      holder.innerHTML = DOMPurify.sanitize(value, {
        USE_PROFILES: { html: true },
        ADD_ATTR: ['target'],
        FORBID_TAGS: ['style', 'form', 'input', 'button', 'select', 'textarea']
      });
      holder.querySelectorAll('a[target="_blank"]').forEach((link) => {
        link.setAttribute('rel', 'noopener noreferrer');
      });

      if (holder.childElementCount > 0) {
        return { html: holder.innerHTML, features: [] };
      }

      const lines = String(holder.textContent || '').split('\n')
        .map((line) => line.trim()).filter(Boolean);
      return {
        html: '',
        features: (lines.length ? lines : [t('landing.plans.defaultFeature')])
          .map((feature) => ({ feature }))
      };
    };

    const planDescriptions = computed(() => Object.fromEntries(
      plans.value.map((plan) => [plan.id, describeContent(plan.content)])
    ));

    const buy = async (plan) => {

      if (!hasPrice(plan) || isSoldOut(plan) || busyPlanId.value === plan.id) return;

      busyPlanId.value = plan.id;

      orderError.value = '';

      // 没登录：先把想买什么记下来，登录/注册成功后接着下单

      if (!checkLoginStatus()) {

        savePendingPurchase(plan.id, period.value);

        busyPlanId.value = null;

        router.push('/register');

        return;

      }

      try {

        const response = await submitOrder({ plan_id: Number(plan.id), period: period.value });

        const tradeNo = response?.data;

        if (tradeNo) {

          router.push({ path: '/payment', query: { trade_no: tradeNo } });

        } else {

          orderError.value = response?.message || t('landing.plans.loadFailed');

        }

      } catch (err) {

        orderError.value = err?.response?.message || err?.message;

      } finally {

        busyPlanId.value = null;

      }

    };

    onMounted(() => {

      fetchPlans();

    });


    

    return {
      landingPageRef,
      siteConfig,
      defaultConfig,
      isDarkTheme,
      isTransitioning,
      navigateToLogin,
      plansSectionRef,
      plans,
      plansLoading,
      plansError,
      orderError,
      busyPlanId,
      period,
      periodOptions,
      currentPeriodLabelKey,
      visiblePlans,
      scrollToPlans,
      fetchPlans,
      priceOf,
      hasPrice,
      isSoldOut,
      formatAmount,
      transferLabel,
      deviceLabel,
      planDescriptions,
      buy,
    };

  }

};

</script>



<style lang="scss" scoped>

@use '@/assets/styles/plan-content' as plan-content;

.landing-page {

  position: relative;

  width: 100%;

  min-height: 100vh;

  overflow-x: hidden;

  display: flex;

  flex-direction: column;

  justify-content: center;

  align-items: center;

  background-color: var(--background-color);

  color: var(--text-color);

  transition: background-color 0.3s ease, color 0.3s ease;

}





.background-decoration {

  position: absolute;

  top: 0;

  left: 0;

  width: 100%;

  height: 100%;

  z-index: 0;

  overflow: hidden;

  

  @supports (-webkit-touch-callout: none) {

    display: none;

  }

  

  .bg-circle {

    position: absolute;

    border-radius: 50%;

    filter: blur(80px);

    opacity: 0.4; 

    animation: float 20s infinite ease-in-out;

    transition: opacity 0.5s ease, background-color 0.5s ease;

    

    @supports (-webkit-touch-callout: none) {

      filter: blur(20px);

      opacity: 0.15;

      animation-duration: 40s; 
    }

    

    &.dark-mode {

      opacity: 0.25; 

      filter: blur(100px) saturate(0.7); 

      

      @supports (-webkit-touch-callout: none) {

        filter: blur(15px) saturate(0.5);

        opacity: 0.1;

      }

    }

  }

  

  .circle-1 {

    width: 600px;

    height: 600px;

    background: var(--theme-color);

    top: -10%;

    left: -10%;

    animation-duration: 25s;

    

    &.dark-mode {

      background: rgba(0, 148, 124, 0.6); 

    }

  }

  

  .circle-2 {

    width: 500px;

    height: 500px;

    background: #A747FE;

    top: 40%;

    right: -5%;

    animation-duration: 30s;

    

    &.dark-mode {

      background: rgba(167, 71, 254, 0.5); 

    }

  }

  

  .circle-3 {

    width: 450px;

    height: 450px;

    background: #37DEC9;

    bottom: -10%;

    left: 20%;

    animation-duration: 35s;

    

    &.dark-mode {

      background: rgba(55, 222, 201, 0.5); 

    }

  }

}



@keyframes float {

  0%, 100% {

    transform: translate(0, 0) rotate(0deg);

  }

  25% {

    transform: translate(5%, 5%) rotate(5deg);

  }

  50% {

    transform: translate(0, 10%) rotate(0deg);

  }

  75% {

    transform: translate(-5%, 5%) rotate(-5deg);

  }

}





.top-toolbar {

  position: fixed;

  top: 20px;

  right: 25px;

  display: flex;

  gap: 12px;

  z-index: 100;

}





.content-container {

  position: relative;

  z-index: 10;

  text-align: center;

  padding: 0 20px;

  max-width: 800px;

}



.site-title {

  font-size: 48px;

  font-weight: 700;

  margin-bottom: 20px;

  background: linear-gradient(to right, var(--theme-color), #a78bfa);

  -webkit-background-clip: text;

  background-clip: text;

  color: transparent;

  text-align: center;

  letter-spacing: -0.5px;

  display: flex;

  align-items: center;

  justify-content: center;

  gap: 15px;

  

  .site-logo-img {

    height: 40px;

    width: 40px;

    border-radius: 10px;

    object-fit: cover;

  }

}



.landing-text {

  font-size: 1.5rem;

  font-weight: 400;

  line-height: 1.5;

  margin-bottom: 2rem;

  color: var(--text-color);

  opacity: 0.9;

  

  @media (max-width: 768px) {

    font-size: 1.25rem;

  }

  

  @media (max-width: 480px) {

    font-size: 1rem;

  }

}





.scroll-arrow-container {

  position: fixed;

  bottom: 40px;

  left: 50%;

  transform: translateX(-50%);

  display: flex;

  flex-direction: column;

  align-items: center;

  cursor: pointer;

  z-index: 10;

  transition: transform 0.3s ease;

  

  &:hover {

    transform: translateX(-50%) translateY(5px);

    

    .scroll-arrow {

      animation-play-state: paused;

    }

  }

}



.scroll-arrow {

  color: var(--theme-color);

  animation: bounce 2s infinite;

  margin-bottom: 8px;

}



.scroll-text {

  font-size: 0.875rem;

  color: var(--secondary-text-color);

  opacity: 0.8;

}



@keyframes bounce {

  0%, 20%, 50%, 80%, 100% {

    transform: translateY(0);

  }

  40% {

    transform: translateY(-20px);

  }

  60% {

    transform: translateY(-10px);

  }

}





.page-transition-mask {

  position: fixed;

  top: 0;

  left: 0;

  width: 100%;

  height: 100%;

  background-color: var(--background-color);

  z-index: 1000;

  opacity: 0;

  pointer-events: none;

  transition: opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1);

  

  &.active {

    opacity: 1;

    pointer-events: all;

  }

}





@media (max-width: 768px) {

  .scroll-arrow-container {

    bottom: 30px;

  }

}


.landing-hero {
  position: relative;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  z-index: 10;
}

.landing-login-button {
  min-height: 36px;
  padding: 6px 18px;
  border: 1px solid var(--border-color);
  border-radius: 18px;
  background: var(--card-background);
  color: var(--text-color);
  font-size: 14px;
  cursor: pointer;
  transition: border-color 0.2s ease, transform 0.2s ease;

  &:hover,
  &:focus-visible {
    border-color: var(--theme-color);
    transform: translateY(-1px);
    outline: none;
  }
}

.landing-plans {
  position: relative;
  z-index: 10;
  max-width: 1200px;
  margin: 0 auto;
  padding: 60px 20px 80px;
}

.plans-header {
  text-align: center;
  margin-bottom: 30px;
}

.plans-title {
  margin: 0 0 10px;
  font-size: 32px;
  font-weight: 700;
  letter-spacing: -0.5px;
  color: var(--text-color);
}

.plans-note {
  margin: 0;
  font-size: 14px;
  color: var(--secondary-text-color);
}

.plans-alert {
  max-width: 600px;
  margin: 0 auto 20px;
  padding: 12px 16px;
  border: 1px solid var(--error-color);
  border-radius: 12px;
  background: rgba(var(--theme-color-rgb), 0.05);
  color: var(--error-color);
  font-size: 14px;
  text-align: center;
}

.plans-message {
  grid-column: 1 / -1;
  padding: 40px 20px;
  border: 1px solid var(--border-color);
  border-radius: 16px;
  background: var(--card-background);
  text-align: center;
  color: var(--secondary-text-color);

  p {
    margin: 0 0 16px;
  }
}

.plans-retry-button {
  min-height: 36px;
  padding: 6px 20px;
  border: none;
  border-radius: 10px;
  background: var(--theme-color);
  color: var(--on-theme-color, #fff);
  font-size: 14px;
  cursor: pointer;
  transition: opacity 0.2s ease;

  &:hover,
  &:focus-visible {
    opacity: 0.9;
    outline: none;
  }
}

.period-toggle {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 30px;
}

.period-option {
  min-height: 36px;
  padding: 6px 18px;
  border: 1px solid var(--border-color);
  border-radius: 18px;
  background: var(--card-background);
  color: var(--secondary-text-color);
  font-size: 14px;
  cursor: pointer;
  transition: border-color 0.2s ease, background-color 0.2s ease, color 0.2s ease;

  &:hover,
  &:focus-visible {
    border-color: var(--theme-color);
    outline: none;
  }

  &.active {
    border-color: var(--theme-color);
    background: rgba(var(--theme-color-rgb), 0.1);
    color: var(--theme-color);
    font-weight: 600;
  }
}

.plans-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
}

.plan-card {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 24px;
  border: 1px solid var(--border-color);
  border-radius: 16px;
  background: var(--card-background);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
  transition: border-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;

  &:hover {
    border-color: var(--theme-color);
    transform: translateY(-2px);
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.08);
  }

  &.featured {
    border: 2px solid var(--theme-color);
  }
}

.plan-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.plan-index {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: var(--secondary-text-color);
}

.plan-badge {
  padding: 3px 10px;
  border-radius: 10px;
  background: rgba(var(--theme-color-rgb), 0.1);
  color: var(--theme-color);
  font-size: 12px;
  font-weight: 600;
}

.plan-name {
  margin: 0 0 12px;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-color);
  word-wrap: break-word;
}

.plan-price {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 16px;
}

.plan-price-amount {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-color);
}

.plan-price-period {
  font-size: 13px;
  color: var(--secondary-text-color);
}

.plan-meta {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  padding: 12px;
  border-radius: 12px;
  background: rgba(var(--theme-color-rgb), 0.05);
  margin-bottom: 16px;
}

.plan-meta-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.plan-meta-label {
  font-size: 12px;
  color: var(--secondary-text-color);
}

.plan-meta-value {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
}

.plan-description {
  min-width: 0;
  max-width: 100%;
  margin-bottom: 20px;
  flex: 1;
  text-align: left;

  .html-content {
    @include plan-content.rich-content;
    font-size: 14px;
    line-height: 1.6;
    color: var(--text-color);
  }
}

.plan-features {
  list-style: none;
  margin: 0;
  padding: 0;

  li {
    position: relative;
    padding: 4px 0 4px 18px;
    font-size: 14px;
    color: var(--secondary-text-color);
    overflow-wrap: anywhere;

    &.disabled-feature {
      opacity: 0.6;
      text-decoration: line-through;
    }

    &:before {
      content: '';
      position: absolute;
      left: 0;
      top: 12px;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--theme-color);
    }
  }
}

.plan-buy-button {
  min-height: 44px;
  border: none;
  border-radius: 10px;
  background: var(--theme-color);
  color: var(--on-theme-color, #fff);
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s ease, transform 0.2s ease;

  &:hover:not(:disabled),
  &:focus-visible:not(:disabled) {
    opacity: 0.9;
    transform: translateY(-1px);
    outline: none;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.plan-skeleton {
  pointer-events: none;
}

.skeleton-line {
  height: 14px;
  margin-bottom: 14px;
  border-radius: 7px;
  background: rgba(var(--theme-color-rgb), 0.08);
  animation: skeleton-pulse 1.4s ease-in-out infinite;
}

.skeleton-badge {
  width: 40%;
}

.skeleton-title {
  width: 70%;
  height: 20px;
}

.skeleton-price {
  width: 55%;
  height: 26px;
}

@keyframes skeleton-pulse {
  0%,
  100% {
    opacity: 0.55;
  }

  50% {
    opacity: 1;
  }
}

@media (max-width: 1024px) {
  .plans-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .plans-grid {
    grid-template-columns: 1fr;
  }

  .landing-plans {
    padding: 40px 16px 60px;
  }

  .plans-title {
    font-size: 26px;
  }
}

</style> 
