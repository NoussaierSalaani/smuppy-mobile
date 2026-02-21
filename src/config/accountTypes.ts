export const ACCOUNT_TYPE = {
  PERSONAL: 'personal' as const,
  PRO_CREATOR: 'pro_creator' as const,
  PRO_BUSINESS: 'pro_business' as const,
};

export const isPro = (type: string | undefined | null): boolean =>
  type === ACCOUNT_TYPE.PRO_CREATOR || type === ACCOUNT_TYPE.PRO_BUSINESS;

export const isProCreator = (type: string | undefined | null): boolean =>
  type === ACCOUNT_TYPE.PRO_CREATOR;

export const isProBusiness = (type: string | undefined | null): boolean =>
  type === ACCOUNT_TYPE.PRO_BUSINESS;
