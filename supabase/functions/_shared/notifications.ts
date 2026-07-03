// Swappable notification-channel abstraction. The scheduler depends only on the
// NotificationProvider interface, so the channel can be replaced later (push, email,
// another chat platform) by adding a new provider and flipping NOTIFY_PROVIDER — with no
// change to the timing/idempotency logic.

export interface OutboundMessage {
  to: string; // recipient address for the channel — a Telegram chat ID
  body: string;
}

export interface SendResult {
  ok: boolean;
  provider: string;
  providerMessageId: string | null;
  error: string | null;
}

export interface NotificationProvider {
  readonly name: string;
  send(msg: OutboundMessage): Promise<SendResult>;
}

/** Real messages via the Telegram Bot API (sendMessage). */
export class TelegramProvider implements NotificationProvider {
  readonly name = 'telegram';
  constructor(private botToken: string) {}

  async send(msg: OutboundMessage): Promise<SendResult> {
    const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: msg.to, text: msg.body }),
      });
      const data = await res.json();
      if (!res.ok || data?.ok !== true) {
        return {
          ok: false,
          provider: this.name,
          providerMessageId: null,
          error: data?.description ?? `Telegram HTTP ${res.status}`,
        };
      }
      return {
        ok: true,
        provider: this.name,
        providerMessageId:
          data?.result?.message_id != null ? String(data.result.message_id) : null,
        error: null,
      };
    } catch (err) {
      return {
        ok: false,
        provider: this.name,
        providerMessageId: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

/** Records a "send" without hitting any external service — for local dev and tests. */
export class MockProvider implements NotificationProvider {
  readonly name = 'mock';
  public sent: OutboundMessage[] = [];

  send(msg: OutboundMessage): Promise<SendResult> {
    this.sent.push(msg);
    return Promise.resolve({
      ok: true,
      provider: this.name,
      providerMessageId: `mock-${crypto.randomUUID()}`,
      error: null,
    });
  }
}

/** Build the provider selected by NOTIFY_PROVIDER (defaults to mock if unset/misconfig). */
export function providerFromEnv(env: {
  NOTIFY_PROVIDER?: string;
  TELEGRAM_BOT_TOKEN?: string;
}): NotificationProvider {
  if (env.NOTIFY_PROVIDER === 'telegram' && env.TELEGRAM_BOT_TOKEN) {
    return new TelegramProvider(env.TELEGRAM_BOT_TOKEN);
  }
  return new MockProvider();
}
