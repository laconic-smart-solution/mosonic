export interface IWebhookEventRepository {
  tryRecord(
    eventId: string,
    event: string,
    processedAt: Date,
  ): Promise<'created' | 'duplicate'>;
}
