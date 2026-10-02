import { ref, computed } from 'vue';
import { getArithmeticChallenge, verifyArithmeticChallenge } from '@/api/auth';

/**
 * 算术验证码（后端 arithmetic_verification_enable 开启时才出现）。
 *
 * 流程与 signature 产物一致：拉题 → 用户填答案 → verify → 服务端把这次挑战标记为已通过。
 * 注意：后端不在这条链路上强制校验（邮箱注册路由本身已撤销，OAuth 那条明确不做机器人检查），
 * 它是建站方设的机器人门槛，**前端必须自己拦** —— verified 不为真时不要提交表单。
 */
export function useArithmeticChallenge() {
  const loading = ref(false);
  /** idle | verifying | correct | incorrect | unavailable */
  const status = ref('idle');
  const challenge = ref(null);
  const answer = ref('');

  const question = computed(() =>
    challenge.value ? `${challenge.value.left} ${challenge.value.operator} ${challenge.value.right} = ?` : ''
  );

  const verified = computed(() => status.value === 'correct');

  /** 换一道题（不动 status：答错后换题时还要保留「答错了」的提示） */
  const loadChallenge = async () => {
    loading.value = true;
    try {
      const response = await getArithmeticChallenge();
      const data = response?.data ?? response ?? {};
      challenge.value = data.enabled !== false && data.challenge_id ? data : null;
      if (!challenge.value) status.value = 'unavailable';
    } catch (err) {
      challenge.value = null;
      status.value = 'unavailable';
    } finally {
      loading.value = false;
    }
  };

  const load = async () => {
    status.value = 'idle';
    answer.value = '';
    await loadChallenge();
  };

  const verify = async () => {
    if (!challenge.value || status.value === 'verifying') return;
    if (String(answer.value).trim() === '') return;
    status.value = 'verifying';
    try {
      const response = await verifyArithmeticChallenge(challenge.value.challenge_id, answer.value);
      const data = response?.data ?? response ?? {};
      if (data.verified) {
        status.value = 'correct';
        return;
      }
      // 答错：后端已把这道题作废，换一道新的，同时保留错误提示
      answer.value = '';
      await loadChallenge();
      status.value = 'incorrect';
    } catch (err) {
      status.value = 'unavailable';
    }
  };

  return { loading, status, challenge, answer, question, verified, load, verify, refresh: load };
}
