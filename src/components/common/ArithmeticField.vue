<template>
  <div class="form-group arithmetic-field">
    <label for="arithmeticAnswer" class="form-label">
      {{ $t('auth.arithmetic.label') }}
    </label>

    <div v-if="controller.status.value === 'unavailable'" class="ez-arithmetic-warning">
      {{ $t('auth.arithmetic.unavailable') }}
    </div>

    <div class="ez-arithmetic-row">
      <span class="ez-arithmetic-expression" aria-hidden="true">{{ controller.question.value }}</span>
      <span class="input-with-icon ez-arithmetic-input">
        <input
          id="arithmeticAnswer"
          v-model="controller.answer.value"
          type="text"
          inputmode="numeric"
          autocomplete="off"
          :aria-label="$t('auth.arithmetic.label')"
          :placeholder="$t('auth.arithmetic.answerPlaceholder')"
          :disabled="!controller.challenge.value || controller.status.value === 'correct'"
          @keyup.enter="controller.verify()"
        />
        <button
          type="button"
          class="ez-arithmetic-refresh"
          :title="$t('auth.arithmetic.refresh')"
          :aria-label="$t('auth.arithmetic.refresh')"
          :disabled="controller.loading.value"
          @click="controller.refresh()"
        >
          <IconRefresh :size="16" />
        </button>
      </span>
    </div>

    <span v-if="controller.status.value === 'correct'" class="ez-arithmetic-ok">
      <IconCheck :size="16" />
      {{ $t('auth.arithmetic.correct') }}
    </span>
    <span v-else-if="controller.status.value === 'incorrect'" class="ez-arithmetic-bad">
      {{ $t('auth.arithmetic.incorrect') }}
    </span>
  </div>
</template>

<script setup name="ArithmeticField">
import { IconRefresh, IconCheck } from '@tabler/icons-vue';

defineProps({
  controller: {
    type: Object,
    required: true
  }
});
</script>

<style lang="scss" scoped>
.arithmetic-field {
  .ez-arithmetic-warning {
    margin-bottom: 8px;
    color: var(--error-color);
    font-size: 13px;
  }

  .ez-arithmetic-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .ez-arithmetic-expression {
    flex: none;
    padding: 8px 12px;
    border-radius: 8px;
    background: rgba(var(--theme-color-rgb), 0.08);
    color: var(--text-color);
    font-size: 16px;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.04em;
  }

  .ez-arithmetic-input {
    position: relative;
    flex: 1 1 auto;
    display: flex;
    align-items: center;

    input {
      width: 100%;
      padding-right: 38px;
    }
  }

  .ez-arithmetic-refresh {
    position: absolute;
    right: 6px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--secondary-text-color);
    cursor: pointer;

    &:hover:not(:disabled) {
      color: var(--theme-color);
      background: rgba(var(--theme-color-rgb), 0.08);
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  .ez-arithmetic-ok,
  .ez-arithmetic-bad {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-top: 6px;
    font-size: 13px;
  }

  .ez-arithmetic-ok {
    color: var(--success-color);
  }

  .ez-arithmetic-bad {
    color: var(--error-color);
  }
}
</style>
