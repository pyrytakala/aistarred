import { loadEnv } from "../lib/env.js";
import { TranscriptApiProvider } from "./transcriptapi.js";
import { SupadataProvider } from "./supadata.js";
import { TranscriptProviderError, type TranscriptProvider } from "./types.js";

export { TranscriptProviderError, type TranscriptProvider } from "./types.js";

const PROVIDERS = {
  [TranscriptApiProvider.name]: TranscriptApiProvider,
  [SupadataProvider.name]: SupadataProvider,
} as const;

export function defaultProviderName(): string {
  loadEnv();
  const configured = (process.env.TRANSCRIPT_PROVIDER ?? "").trim().toLowerCase();
  if (configured) {
    return configured;
  }
  if ((process.env.TRANSCRIPTAPI_API_KEY ?? "").trim()) {
    return TranscriptApiProvider.name;
  }
  if ((process.env.SUPADATA_API_KEY ?? "").trim()) {
    return SupadataProvider.name;
  }
  return TranscriptApiProvider.name;
}

export function getProvider(name?: string | null, useCache = true): TranscriptProvider {
  const providerName = (name ?? defaultProviderName()).trim().toLowerCase();
  const Provider = PROVIDERS[providerName as keyof typeof PROVIDERS];
  if (!Provider) {
    throw new TranscriptProviderError(
      `Unknown transcript provider '${providerName}'. Supported: ${Object.keys(PROVIDERS).join(", ")}`,
    );
  }
  return new Provider(useCache);
}
