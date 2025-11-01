
export enum PaymentStatus {
  Paid = 'Paid',
  Partial = 'Partial',
  NotPaid = 'Not Paid',
}

export enum Gender {
  Male = 'Male',
  Female = 'Female',
  Other = 'Other',
}

export enum MembershipPlan {
  FifteenDays = '15 Days',
  OneMonth = '1 Month',
  TwoMonths = '2 Months',
  ThreeMonths = '3 Months',
  SixMonths = '6 Months',
  OneYear = '1 Year',
}

export interface Member {
  id: string;
  fullName: string;
  age: number;
  gender: Gender;
  contactNumber?: string;
  membershipPlan: MembershipPlan;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  gymFees: number;
  paymentStatus: PaymentStatus;
  amountPaid: number;
  dueAmount: number;
  expectedPaymentDate: string | null;
  remarks: string;
  registrationDate: string; // ISO string
  photo?: string | null; // Base64 encoded image
}

export interface Supplement {
  id: string;
  memberId: string;
  memberName: string;
  purchaseDate: string; // YYYY-MM-DD
  supplementAmount: number;
  paymentStatus: PaymentStatus;
  amountPaid: number;
  dueAmount: number;
  expectedPaymentDate: string | null;
  remarks: string;
  createdDate: string; // ISO string
}

export interface ReportStats {
  newMembers: number;
  activeMembers: number;
  expiredMembers: number;
  gymCollected: number;
  gymDue: number;
  supplementSales: number;
  supplementDue: number;
  supplementsSold: number;
}