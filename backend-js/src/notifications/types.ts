export type NotificationChannel = "games" | "messages" | "social";

export interface PushNotificationContent {
  title: string;
  body: string;
  subtitle?: string;
  channelId: NotificationChannel;
  sound?: "default" | null;
}

export type GamePushEvent = "started" | "rematch" | "turn" | "finished";

export interface GamePushContext {
  event: GamePushEvent;
  gameId: number;
  actorId: number;
  actorName: string;
  recipientId: number;
  recipientName: string;
  winner: number;
  state: unknown;
}

export type GameNotificationModifier = (
  notification: PushNotificationContent,
  context: GamePushContext,
) => PushNotificationContent;
