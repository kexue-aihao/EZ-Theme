// 落地页/商店里没登录就点「购买」时先记下意图，登录或注册成功后接着把单下完。
// 与 signature 产物的 signature_pending_purchase 同义（key 改成主题无关的名字）。
import { submitOrder } from '@/api/shop';

const STORAGE_KEY = 'pending_purchase';

export function savePendingPurchase(planId, period) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ plan_id: Number(planId), period, source: 'landing' }));
  } catch (e) {
    // 隐私模式下 localStorage 可能不可写，忽略即可
  }
}

export function readPendingPurchase() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const planId = Number(parsed?.plan_id);
    if (!Number.isInteger(planId) || planId <= 0) return null;
    return typeof parsed?.period === 'string' && parsed.period
      ? { plan_id: planId, period: parsed.period }
      : null;
  } catch (e) {
    return null;
  }
}

export function clearPendingPurchase() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    // 同上
  }
}

/**
 * 登录/注册成功后调用：有待购买意图就顺手把单下掉，返回 trade_no（没有则返回空串）。
 * 无论成功与否都清掉意图，免得下次登录又重放。
 */
export async function consumePendingPurchase() {
  const pending = readPendingPurchase();
  if (!pending) return '';
  clearPendingPurchase();
  try {
    const response = await submitOrder({ plan_id: pending.plan_id, period: pending.period });
    const tradeNo = response?.data;
    return tradeNo ? String(tradeNo) : '';
  } catch (e) {
    return '';
  }
}
