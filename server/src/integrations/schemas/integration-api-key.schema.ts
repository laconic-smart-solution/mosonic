export interface IntegrationApiKey {
  keyId: string;
  userId: string;
  name: string;
  keyHash: string;
  scopes: string[];
  enabled: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export type IntegrationApiKeyDocument = IntegrationApiKey;
