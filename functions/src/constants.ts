export const ENVIRONMENTS = ["prod", "dev", "stage", "sandbox"];
export const SYSTEM_SOURCE = "flo-plug-engine-v2";
export const ADMIN_ROLE = 'product_admin';
export const FLOPLUG_DEV_STORAGE_BUCKET = 'gs://floplug-dev';
export const FLOPLUG_PROD_STORAGE_BUCKET = 'gs://floplug-prod';
export const FLOPLUG_STAGING_STORAGE_BUCKET = 'gs://floplug-staging';
export const FLOPLUG_SANDBOX_STORAGE_BUCKET = 'gs://floplug-sandbox';
export const FLOPLUG_SCHEMAS_FOLDER = 'schemas';
export const FLOPLUG_RUNS_FOLDER = 'runs';




export const STORAGE_BUCKET_MAP = {
  dev: FLOPLUG_DEV_STORAGE_BUCKET,
  staging: FLOPLUG_STAGING_STORAGE_BUCKET,
  prod: FLOPLUG_PROD_STORAGE_BUCKET,
  sandbox: FLOPLUG_SANDBOX_STORAGE_BUCKET,
} as const;

export const CURRENT_SCHEMA_BUCKET =
  STORAGE_BUCKET_MAP[process.env.NODE_ENV as keyof typeof STORAGE_BUCKET_MAP]
  ?? FLOPLUG_DEV_STORAGE_BUCKET; // fallback
