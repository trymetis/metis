function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function optional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export const env = {
  mailDomain: required("MAIL_DOMAIN").toLowerCase(),
  apiToken: required("API_TOKEN"),
  databaseUrl: required("DATABASE_URL"),
  databaseAuthToken: optional("DATABASE_AUTH_TOKEN"),
  mailBucket: required("MAIL_BUCKET"),
  region: required("AWS_REGION"),
};
