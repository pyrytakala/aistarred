export class TranscriptProviderError extends Error {}

export interface TranscriptProvider {
  readonly name: string;
  listChannelVideosSince(
    channelUrl: string,
    options?: {
      months?: number;
      probeLimit?: number;
      maxVideos?: number | null;
      requestDelay?: number;
    },
  ): Promise<Array<[string, Record<string, unknown>]>>;
  getMetadata(videoId: string): Promise<Record<string, unknown>>;
  getTranscript(videoId: string): Promise<[string, Record<string, unknown>]>;
  metadataToIndexFields(payload: Record<string, unknown>): Record<string, unknown>;
}
