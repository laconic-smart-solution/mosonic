export type PaymentApiResponse<T> = {
  success: boolean;
  data: T;
  message: string | null;
  timestamp: string;
};

export type TopupPlanRecord = {
  code: string;
  label: string;
  credits: number;
  priceUsd: number;
  priceThb: number;
  sortOrder: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};
