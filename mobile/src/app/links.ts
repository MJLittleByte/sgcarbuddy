/** Public links shown in the app. Keep in sync with site/site.config.json (privacy / support site). */
export const SUPPORT_EMAIL = 'krishve1589@gmail.com';
export const SITE_URL = 'https://mjlittlebyte.github.io/sgcarbuddy/';
export const PRIVACY_URL = `${SITE_URL}privacy/`;

export const mailto = (subject: string) => `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`;
