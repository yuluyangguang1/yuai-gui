/**
 * Topic Pub/Sub Bus (inspired by AutoGen)
 * EventBus with topic-based routing, wildcard subscriptions, and history buffer.
 */
import { ref, readonly } from 'vue';
import { defineStore } from 'pinia';

// ── Types ──

export interface BusMessage<T = unknown> {
  id: string;
  topic: string;
  payload: T;
  sender: string;
  timestamp: number;
}

export interface BusSubscription {
  id: string;
  topic: string; // exact topic or pattern with wildcards like 'agent.*'
  callback: (message: BusMessage) => void;
  once: boolean;
}

const MAX_HISTORY_PER_TOPIC = 100;

// ── Wildcard Matching ──

/**
 * Check if a topic matches a pattern.
 * Supports exact match and single-level wildcard '.*' at the end.
 * e.g., 'agent.*' matches 'agent.claude', 'agent.codex', etc.
 */
function topicMatches(topic: string, pattern: string): boolean {
  if (topic === pattern) return true;
  // Wildcard: 'agent.*' matches any 'agent.xxx'
  if (pattern.endsWith('.*')) {
    const prefix = pattern.slice(0, -2); // remove '.*'
    return topic === prefix || topic.startsWith(prefix + '.');
  }
  // Wildcard: '*' matches anything
  if (pattern === '*') return true;
  return false;
}

// ── Store ──

export const useMessageBusStore = defineStore('messageBus', () => {
  // History buffer per topic
  const history = ref<Map<string, BusMessage[]>>(new Map());

  // All subscriptions
  const subscriptions = ref<BusSubscription[]>([]);

  // Total message counter for stats
  const totalPublished = ref(0);

  // Topics we've seen
  const knownTopics = ref<Set<string>>(new Set());

  /**
   * Subscribe to a topic (or wildcard pattern).
   * Returns an unsubscribe function.
   */
  function subscribe(
    topic: string,
    callback: (message: BusMessage) => void,
    options?: { once?: boolean }
  ): () => void {
    const sub: BusSubscription = {
      id: `sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      topic,
      callback,
      once: options?.once ?? false,
    };
    subscriptions.value.push(sub);
    knownTopics.value.add(topic);

    // Return unsubscribe function
    return () => {
      unsubscribe(sub.id);
    };
  }

  /**
   * Subscribe once — auto-unsubscribes after first message.
   */
  function subscribeOnce(
    topic: string,
    callback: (message: BusMessage) => void
  ): () => void {
    return subscribe(topic, callback, { once: true });
  }

  /**
   * Unsubscribe by subscription id.
   */
  function unsubscribe(subscriptionId: string): boolean {
    const idx = subscriptions.value.findIndex(s => s.id === subscriptionId);
    if (idx >= 0) {
      subscriptions.value.splice(idx, 1);
      return true;
    }
    return false;
  }

  /**
   * Unsubscribe all subscriptions for a topic or pattern.
   */
  function unsubscribeAll(topic: string): number {
    const before = subscriptions.value.length;
    subscriptions.value = subscriptions.value.filter(s => s.topic !== topic);
    return before - subscriptions.value.length;
  }

  /**
   * Publish a message to a topic. All matching subscribers are notified.
   */
  function publish<T = unknown>(
    topic: string,
    payload: T,
    sender: string = 'system'
  ): BusMessage<T> {
    const message: BusMessage<T> = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      topic,
      payload,
      sender,
      timestamp: Date.now(),
    };

    totalPublished.value++;
    knownTopics.value.add(topic);

    // Record in history buffer
    let topicHistory = history.value.get(topic);
    if (!topicHistory) {
      topicHistory = [];
      history.value.set(topic, topicHistory);
    }
    topicHistory.push(message as BusMessage);
    if (topicHistory.length > MAX_HISTORY_PER_TOPIC) {
      topicHistory.splice(0, topicHistory.length - MAX_HISTORY_PER_TOPIC);
    }
    // Force reactivity
    history.value = new Map(history.value);

    // Collect matching subscriptions (snapshot to avoid mutation during iteration)
    const matching = subscriptions.value.filter(s => topicMatches(topic, s.topic));
    const toRemove: string[] = [];

    for (const sub of matching) {
      try {
        sub.callback(message as BusMessage);
      } catch (e) {
        console.error(`[MessageBus] Subscriber error for topic "${topic}":`, e);
      }
      if (sub.once) {
        toRemove.push(sub.id);
      }
    }

    // Remove one-time subscribers
    if (toRemove.length > 0) {
      const removeSet = new Set(toRemove);
      subscriptions.value = subscriptions.value.filter(s => !removeSet.has(s.id));
    }

    return message;
  }

  /**
   * Get history for a specific topic.
   */
  function getHistory(topic: string): BusMessage[] {
    return history.value.get(topic) ?? [];
  }

  /**
   * Get history for topics matching a pattern.
   */
  function getHistoryByPattern(pattern: string): BusMessage[] {
    const result: BusMessage[] = [];
    for (const [topic, messages] of history.value) {
      if (topicMatches(topic, pattern)) {
        result.push(...messages);
      }
    }
    result.sort((a, b) => a.timestamp - b.timestamp);
    return result;
  }

  /**
   * Clear history for a topic.
   */
  function clearHistory(topic?: string): void {
    if (topic) {
      history.value.delete(topic);
    } else {
      history.value.clear();
    }
    history.value = new Map(history.value);
  }

  /**
   * Get active subscription count for a topic.
   */
  function subscriptionCount(topic: string): number {
    return subscriptions.value.filter(s => topicMatches(topic, s.topic)).length;
  }

  return {
    // State
    history: readonly(history),
    subscriptions: readonly(subscriptions),
    totalPublished: readonly(totalPublished),
    knownTopics: readonly(knownTopics),

    // Methods
    subscribe,
    subscribeOnce,
    unsubscribe,
    unsubscribeAll,
    publish,
    getHistory,
    getHistoryByPattern,
    clearHistory,
    subscriptionCount,
  };
});
