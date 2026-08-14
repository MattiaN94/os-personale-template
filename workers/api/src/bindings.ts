export interface Env {
  DB: D1Database
  ASSETS: Fetcher
  DOCUMENTS?: R2Bucket
  BACKUPS?: R2Bucket
  APP_ORIGIN: string
  OWNER_EMAIL_SECRET: string
  WORKSPACE_ID_SECRET: string
  ACCESS_ENFORCED: string
  CF_ACCESS_TEAM_DOMAIN: string
  CF_ACCESS_AUD: string
  GPT_SERVICE_TOKEN_ID_SECRET: string
  LOCAL_DEV_MODE: string
  DOCUMENTS_ENABLED: string
  BACKUPS_ENABLED: string
  GOOGLE_CALENDAR_ENABLED: string
  GOOGLE_OAUTH_CLIENT_ID: string
  GOOGLE_OAUTH_CLIENT_SECRET: string
  GOOGLE_CALENDAR_TOKEN_KEY: string
  BACKUP_ENCRYPTION_KEY: string
  FIELD_ENCRYPTION_SECRET: string
}

export interface AccessIdentity {
  actorId: string
  actorType: 'owner' | 'gpt'
  email?: string
  serviceTokenId?: string
}

export type Variables = {
  requestId: string
  identity: AccessIdentity
}
