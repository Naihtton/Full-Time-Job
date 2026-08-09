/**
 * CustomerDataSource - Handles customer-related API calls
 *
 * Communicates with:
 * - customer-service: GET /api/v1/customers/enum
 * - customer-service: GET /api/v1/customers
 * - customer-service: POST /api/v1/customers/search
 * - customer-service: GET /api/v1/customers/occupations
 * - customer-service: POST /api/v1/product-holding/banking/account-list
 * - customer-service: POST /api/v1/product-holding/banking/bulk-account-inquiry
 * - customer-service: GET /api/v1/customers/{customerId}/overview
 * - customer-service: GET /api/v1/customers/{id}/privilege-info
 * - customer-service: GET /api/v1/customers/{id}/privilege-detail
 * - customer-service: GET /api/v1/customers/{id}/business-specific
 * - customer-service: GET /api/v1/customers/{id}/behavior/investment-preference
 */

import { BaseDataSource } from './base.datasource.js'
import { config } from '../config/config.js'
import {
  type ServiceResponse,
  handleError,
  handleValidationErrors,
  createResponseMessage,
  DEFAULT_SUB_CODE_SUCCESS,
  DEFAULT_SUB_CODE_ERROR,
} from '../types/response.types.js'
import type {
  CreateFeedbackContactRequestInput,
  UpdateCustomerTeamMemberInput,
  UpsertContactPersonInput,
} from '../config/types.js'

// ============================================================================
// Types
// ============================================================================

/**
 * Standard response format from backend services
 */
interface StandardResponseDto<T = any> {
  statusCode: string
  success: boolean
  message: string
  body: {
    data: T
  }
}

export interface CustomerContact {
  contactTypeCode: string
  contactType: string
  contactValue: string
  isContactable: boolean
  isPrimary: boolean
  createdDateTime: string
  extValue: string | null
}

export interface CreateCustomerIndividualContactInput {
  contactTypeCode: string
  value: string
  extValue?: string
}

export interface CreateCustomerIndividualInput {
  ownerOcCode?: string
  titleCode?: string
  firstNameTh?: string
  middleNameTh?: string
  lastNameTh?: string
  firstNameEn?: string
  middleNameEn?: string
  lastNameEn?: string
  identificationTypeCode?: string
  identificationNo?: string
  issuingCountryCode?: string
  phoneNumbers?: CreateCustomerIndividualContactInput[]
  emails?: CreateCustomerIndividualContactInput[]
}

export interface CreateCustomerIndividualResponseData {
  customerId: string
}

export interface CustomerSearchItem {
  id: string
  customerCode: string | null
  customerNameEn: string | null
  customerNameTh: string | null
  customerCategoryCode: string | null
  customerCategoryEn: string | null
  customerCategoryTh: string | null
  titleCode: string | null
  typeEn: string | null
  typeTh: string | null
  identificationTypeEn: string | null
  identificationTypeTh: string | null
  identificationNo: string | null
  dateOfBirth: string | null
  registrationDate: string | null
  ocCode: string | null
  customerGroupTypeEn: string | null
  customerGroupTypeTh: string | null
  monthlyIncomeMin: number | null
  monthlyIncomeMax: number | null
  yearlyRevenueMin: number | null
  yearlyRevenueMax: number | null
  phoneContacts: CustomerContact[] | null
  emailContacts: CustomerContact[] | null
  firstName: string | null
  middleName: string | null
  lastName: string | null
}

export interface EnumStandardListCodeItem {
  code: string
  valueEn: string
  valueTh: string
}

export interface EnumStandardListCodePagedData {
  content: EnumStandardListCodeItem[]
  page: number
  size: number
  totalElements: number
  totalPages: number
}

// Banking Account List Types
// GraphQL/web-portal still use statusCode/success/body (legacy wrapper).
// customer-service banking account-list now returns autoMap Response<T>:
// { code, message, messageTemplate?, data }
export interface BankingAccountListData {
  totalRecord: number
  accountRelation: AccountRelation[]
}

/** Raw autoMap response from customer-service banking account-list */
export interface BankingAccountListBackendResponse {
  code?: string
  message?: string
  /** Backend MessageModel — unused fields are null (same as header) */
  messageTemplate?: {
    title?: string | null
    header?: string | null
    body?: string | null
    actionButton?: string | null
    cancelButton?: string | null
  }
  data?: BankingAccountListData
  // legacy fields kept for backward compatibility during rollout
  statusCode?: string
  success?: boolean
  body?: {
    data?: BankingAccountListData
  }
}

/**
 * GraphQL contract for getBankingAccountList (legacy StandardResponseDto shape).
 * Datasource maps autoMap backend payload into this structure.
 */
export interface BankingAccountListResponse {
  statusCode: string
  success: boolean
  message: string
  body: {
    data: BankingAccountListData
  }
}

export interface AccountRelation {
  applicationCode: string
  accountNumber: string
  accountName: string
  accountStatus: string
  accountSubStatus: string
  accountBranchCode: string
  accountCardRef: string
  accountType: string
  accountTypeOfBook: string
}

const EMPTY_BANKING_ACCOUNT_LIST_DATA: BankingAccountListData = {
  totalRecord: 0,
  accountRelation: [],
}

/**
 * Normalize customer-service banking account-list payload (autoMap or legacy)
 * into the GraphQL BankingAccountListResponse shape.
 */
function mapBankingAccountListToGraphQL(
  response: BankingAccountListBackendResponse | null | undefined,
  fallbackMessage = 'Success'
): BankingAccountListResponse {
  const data = response?.data ?? response?.body?.data ?? EMPTY_BANKING_ACCOUNT_LIST_DATA
  const code = response?.code ?? response?.statusCode ?? '200'
  const message = response?.messageTemplate?.body ?? response?.message ?? fallbackMessage
  const numericStatus = Number.parseInt(code, 10)
  const success =
    response?.success ??
    ((!Number.isNaN(numericStatus) && numericStatus >= 200 && numericStatus < 400) ||
      code.startsWith('GEN-S') ||
      code === 'SUCCESS' ||
      code === '200')

  return {
    statusCode: code,
    success: Boolean(success),
    message,
    body: {
      data: {
        totalRecord: data?.totalRecord ?? 0,
        accountRelation: data?.accountRelation ?? [],
      },
    },
  }
}

function filterBankingAccountRelations(accountRelation: AccountRelation[] = []): AccountRelation[] {
  return accountRelation.filter((acc) => acc.applicationCode === 'ST' || acc.applicationCode === 'IM')
}

// Auto Finance Contract List Types (Raw StandardResponseDto)
export interface AutoFinanceContractListResponse {
  statusCode: string
  success: boolean
  message: string
  body: {
    data: {
      totalRecord: number
      contractList: AutoFinanceContract[]
    }
  }
}

export interface AutoFinanceContract {
  contractNumber: string
  status: string
  mainStatus: string
  displayLabel: string
}

// Home Loan Contract List Types (Raw StandardResponseDto)
export interface HomeLoanContractListResponse {
  statusCode: string
  success: boolean
  message: string
  body: {
    data: {
      totalRecord: number
      contractList: HomeLoanContract[]
    }
  }
}

export interface HomeLoanContract {
  accountNumber: string
  status: string
  accountName: string
}

// Debit Card Inquiry Types
export interface DebitCardInquiryInput {
  cardRefNumber: string
}

export interface DebitCard {
  cardStatus: string
  cardSubStatus: string
  cardProductName: string
  productId?: string
  productName?: string
  ref: string
  cardNo: string
  cardName: string
  accountNoSaving: string | null
  accountNoCurrent: string | null
  expired: string
}

export interface DebitCardInquiryData {
  totalRecord: number
  debitcards: DebitCard[]
}

export interface DebitCardInquiryResponse {
  statusCode: string
  success: boolean
  message: string
  body: {
    data: DebitCardInquiryData
  }
}

// Bulk Account Inquiry Types
export interface BulkAccountInquiryInput {
  accountNumber: string
  currency: string
  bankCode: string
}

export interface AccountBalance {
  balType: string
  amtSign: string
  amt: number
}

export interface DepositAccount {
  accountStatus: string
  accountSubStatus: string | null
  miscellaneousMessage: string | null
  productId: string | null
  productName: string
  accountNo: string
  accountName: string
  homeBranch: string | null
  typeOfBook: string | null
  openDate: string | null
  availableBalance: number
  accountBalance: number
  accountNumber: string
  branchRegion: string | null
  branchName: string | null
  onlineOpenFlag: string | null
  accountOpenDate: string | null
  accountCloseDate: string | null
  acctBalList: AccountBalance[]
  accountTypeName: string | null
  accountOpenDateFormat: string | null
  accountCloseDateFormat: string | null
  availableBalanceFormat: string | null
  accountBalanceFormat: string | null
  odAmountFormat: string | null
  totalHoldAmountFormat: string | null
  accumulatedFormat: string | null
}

export interface BulkAccountInquiryData {
  totalRecord: number
  deposit: DepositAccount[]
}

export interface BulkAccountInquiryResponse {
  statusCode: string
  success: boolean
  message: string
  body: {
    data: BulkAccountInquiryData
  }
}

// Auto Finance Types
export interface HirePurchaseData {
  accountStatus?: string
  accountType?: string
  productName?: string
  productId?: string
  paymentsMadeTotalTerm?: number
  termIncreasement?: number
}

export interface CollateralAssetData {
  registerNumber?: string
  province?: string
  maker?: string
  model?: string
  color?: string
}

export interface HirePurchaseResponse {
  success: boolean
  body: {
    data: HirePurchaseData
  }
}

export interface CollateralAssetResponse {
  success: boolean
  body: {
    data: CollateralAssetData
  }
}

export interface AutoFinanceDetails {
  accountNumber: string
  // From Hire Purchase API
  accountStatus: string | null
  accountTypeDescription: string | null
  productName: string | null
  productId: string | null
  termPayment: string | null
  termIncreasement: string | null
  // From Collateral Asset API
  registerNumber: string | null
  province: string | null
  maker: string | null
  model: string | null
  color: string | null
}

// Electronic Card List Types
export interface ElectronicCardListData {
  totalCards: number
  cards: ElectronicCardItem[]
}

export interface ElectronicCardItem {
  cardNo: string
  cardRef: string
  cardStatus: string
  cardType: string
  cardName: string
  acNoSaving: string | null
  acNoCurrent: string | null
  feeAmount: number
  nextFeeDate: string
  expiryDate: string
}

export interface CustomerOccupationItem {
  code: string
  nameTh: string
  nameEn: string
}

export interface PrivilegeDetailItem {
  flightDate?: string | null
  remark?: string | null
  sdlNo?: string | null
  sdlBranch?: string | null
  sdlSize?: string | null
  accountNo?: string | null
}

export interface PrivilegeItem {
  privType: string
  status: 'ELIGIBLE' | 'INELIGIBLE'
  reason: string | null
  availableClaims: number | null
  recentlyUsedDate: string | null
  detail: PrivilegeDetailItem | null
}

export interface PrivilegeInfo {
  rmId: string | null
  cardType: string | null
  firstMonthPriv: string | null
  endMonthPriv: string | null
  detailOfPriv: string | null
  privPack: string | null
  customerPrivCode: string | null
}

export interface ContactChannelItem {
  seq?: number
  nameEn?: string
  nameTh?: string
  isAllowed?: boolean
}

export interface CustomerAddress {
  seq?: number
  typeCode?: string
  typeTh?: string
  typeEn?: string
  addressTh?: string
  addressEn?: string
  isCurrentAddress?: boolean
  currentAddressDescTh?: string
  currentAddressDescEn?: string
  isReachable?: boolean
  reachableDescTh?: string
  reachableDescEn?: string
  lastModifiedBy?: string
  lastModifiedByTh?: string
  lastModifiedByEn?: string
  lastModifiedDatetime?: string
}

export interface CustomerAddressPagedData {
  content: CustomerAddress[]
  page: number
  size: number
  totalElements: number
  totalPages: number
  first: boolean
  last: boolean
  queriedDateTime?: string
}

export interface CustomerPhoneContact {
  seq?: number
  contact?: string
  extend?: string
  contactTypeCode?: string
  contactTypeTh?: string
  contactTypeEn?: string
  isReachable?: boolean
  isSecuredChannel?: boolean
  lastModifiedBy?: string
  lastModifiedByTh?: string
  lastModifiedByEn?: string
  lastModifiedDatetime?: string
}

export interface CustomerPhonePagedData {
  content: CustomerPhoneContact[]
  page: number
  size: number
  totalElements: number
  totalPages: number
  first: boolean
  last: boolean
  queriedDateTime?: string
}

export interface PhoneMatchingCustomer {
  id: string
  rmId: string | null
  type: string | null
  typeEn: string | null
  typeTh: string | null
  customerCategory: string | null
  customerCategoryEn: string | null
  customerCategoryTh: string | null
  customerFirstNameTh: string | null
  customerMiddleNameTh: string | null
  customerLastNameTh: string | null
  customerFirstNameEn: string | null
  customerMiddleNameEn: string | null
  customerLastNameEn: string | null
  identificationNo: string | null
  identificationType: string | null
  identificationTypeEn: string | null
  identificationTypeTh: string | null
  dateOfBirth: string | null
  customerSegment: string | null
  customerSegmentEn: string | null
  customerSegmentTh: string | null
  rmType: string | null
}

export interface PhoneMatchingData {
  customers: PhoneMatchingCustomer[]
  totalCustomers: number
}

export interface CustomerEmailContact {
  seq?: number
  contact?: string
  mailCode?: string
  isSecuredChannel?: boolean
  lastModifiedBy?: string
  lastModifiedByTh?: string
  lastModifiedByEn?: string
  lastModifiedDatetime?: string
}

export interface CustomerEmailPagedData {
  content: CustomerEmailContact[]
  page: number
  size: number
  totalElements: number
  totalPages: number
  first: boolean
  last: boolean
  queriedDateTime?: string
}

export interface CustomerContactPerson {
  id: string
  titleCode: string | null
  titleEn: string | null
  titleTh: string | null
  name: string | null
  nickname: string | null
  birthDate: string | null
  positionCode: string | null
  positionEn: string | null
  positionTh: string | null
  relationshipLevelCode: string | null
  relationshipLevelEn: string | null
  relationshipLevelTh: string | null
  remarks: string | null
  createdBy: string | null
  createdDateTime: string | null
  updatedBy: string | null
  updatedDateTime: string | null
  homePhone: string | null
  homePhoneExtension: string | null
  officePhone: string | null
  officePhoneExtension: string | null
  mobilePhone: string | null
  email: string | null
}

export interface CustomerContactPersonPagedData {
  content: CustomerContactPerson[]
  page: number
  size: number
  totalElements: number
  totalPages: number
  first: boolean
  last: boolean
}

export interface ConsentDetail {
  consentType?: string
  consentName?: string
  consentStatus?: boolean
  channel?: string
  consentVersion?: string
  submitUserId?: string
  lastModifiedDatetime?: string
}

export interface ModelConsentProductGroup {
  consentType?: string
  productGroupName?: string
  consentStatus?: boolean
  channel?: string
  consentVersion?: string
  submitUserId?: string
  lastModifiedDatetime?: string
}

export interface ModelConsent {
  consentName?: string
  productGroups?: ModelConsentProductGroup[]
}

export interface CustomerConsent {
  marketingConsent?: ConsentDetail
  crossSellConsent?: ConsentDetail
  modelConsent?: ModelConsent
}

export interface CustomerIdentification {
  identificationMethod?: string
  identificationMethodTh?: string
  identificationMethodEn?: string
  cddStatus?: boolean
}

export interface GeneralInfoResponse {
  customerOwner: string | null
  /** @deprecated Use typeTh and typeEn instead */
  type: string | null
  typeTh: string | null
  typeEn: string | null
  /** @deprecated Use customerCategoryTh and customerCategoryEn instead */
  customerCategory: string | null
  customerCategoryTh: string | null
  customerCategoryEn: string | null
  rmId: string | null
  customerOcCode: string | null
  /** @deprecated Use customerGroupTypeTh and customerGroupTypeEn instead */
  customerGroupType: string | null
  customerGroupTypeTh: string | null
  customerGroupTypeEn: string | null
  /** @deprecated Use bankGroupTh and bankGroupEn instead */
  bankGroup: string | null
  bankGroupTh: string | null
  bankGroupEn: string | null
  riskLevel: number | null
  ciMoa: string | null
  individualInfo: IndividualInfo | null
  juristicInfo: JuristicInfo | null
  systemInformation: SystemInfo | null
}

export interface IndividualInfo {
  /** @deprecated Use identificationTypeTh and identificationTypeEn instead */
  identificationType: string | null
  identificationTypeTh: string | null
  identificationTypeEn: string | null
  identificationNumber: string | null
  dateOfExpiry: string | null
  titleTh: string | null
  titleEn: string | null
  firstNameTh: string | null
  firstNameEn: string | null
  middleNameTh: string | null
  middleNameEn: string | null
  lastNameTh: string | null
  lastNameEn: string | null
  dateOfBirth: string | null
  age: string | null
  /** @deprecated Use genderTh and genderEn instead */
  gender: string | null
  genderTh: string | null
  genderEn: string | null
  /** @deprecated Use nationalityTh and nationalityEn instead */
  nationality: string | null
  nationalityTh: string | null
  nationalityEn: string | null
  /** @deprecated Use maritalStatusTh and maritalStatusEn instead */
  maritalStatus: string | null
  maritalStatusTh: string | null
  maritalStatusEn: string | null
  numberOfDependents: number | null
  /** @deprecated Use educationLevelTh and educationLevelEn instead */
  educationLevel: string | null
  educationLevelTh: string | null
  educationLevelEn: string | null
  /** @deprecated Use occupationTh and occupationEn instead */
  occupation: string | null
  occupationTh: string | null
  occupationEn: string | null
  occupationDetail: string | null
  position: string | null
  /** @deprecated Use customerSegmentTh and customerSegmentEn instead */
  customerSegment: string | null
  customerSegmentTh: string | null
  customerSegmentEn: string | null
  monthlySegment: string | null
  segmentUpdate: string | null
  firstMthJoinScb: string | null
  firstMthJoinPrivate: string | null
}

export interface JuristicInfo {
  /** @deprecated Use identificationTypeTh and identificationTypeEn instead */
  identificationType: string | null
  identificationTypeTh: string | null
  identificationTypeEn: string | null
  identificationNumber: string | null
  titleTh: string | null
  titleEn: string | null
  nameTh: string | null
  nameEn: string | null
  registrationDate: string | null
  businessTypeTh: string | null
  businessTypeEn: string | null
  customerSegment: string | null
}

export interface SystemInfo {
  createdBy: string | null
  createdDateTime: string | null
  lastModifiedBy: string | null
  lastModifiedDateTime: string | null
}

export interface CustomerSearchPostInput {
  filters?: Record<string, unknown> | null
  page?: number
  size?: number
  sort?: Array<{ field: string; direction: 'ASC' | 'DESC' }>
}

export interface CustomerSearchPagedData {
  content: CustomerSearchItem[]
  page: number
  size: number
  totalElements: number
  totalPages: number
  first: boolean
  last: boolean
}
export interface CustomerTotalAccountData {
  totalAccounts: number
  totalAccountsST?: number
  totalAccountsIM?: number
  totalAccountsEC?: number
  totalAccountsOE?: number
  totalCL?: number
  totalSSME?: number
}

export interface DigitalBankingNotificationCountData {
  count: number
  isEnable: boolean
}

/**
 * Customer Service Response Wrapper
 * Different from standard ServiceResponse used by other services
 */
export interface CustomerServiceResponse<T> {
  statusCode: string
  success: boolean
  message: string
  body: T
}

// ============================================================================
// Banking Types
// ============================================================================

export interface AccountInquiryInput {
  accountNumber: string
  currency: string
  bankCode: string
}

// FRC Inquiry Types
export interface FrcInquiryInput {
  accountNumber: string
  startTranDate?: string
  endTranDate?: string
  startPaidDate?: string
  endPaidDate?: string
}

export interface AmountCurrency {
  amount: number | null
  currencyCode: string | null
}

export interface NetAmountCurrency {
  equivalentAmount: number | null
  payRate: number | null
  payType: string | null
}

export interface FrcTransactionItem {
  expectedPaidDate: string | null
  remitBankName: string | null
  orderBankName: string | null
  senderName: string | null
  paidDate: string | null
  amtCurrency: AmountCurrency | null
  netAmtCurrency: NetAmountCurrency | null
  transferFee: number | null
  netBaht: number | null
  remittanceType: string | null
  status: string | null
  referenceNumber: string | null
}

export interface FrcInquiryData {
  items: FrcTransactionItem[]
  totalRecord: number
}

// Fixed Sub Deposits Inquiry Types
export interface FixedSubDepositsInquiryInput {
  accountNumber: string
  requestCode?: string
  overrideFlag?: string
}

export interface SubDepositItem {
  depositNumber: string
  depositDate: string
  maturityDate: string
  balanceAmount: number
  subDepositHoldAmount: number
  remainingBalanceAmount: number
}

export interface FixedSubDepositsInquiryData {
  subDeposits: SubDepositItem[]
}

// Banking Notification Types
export interface BankingNotificationInput {
  customerRefNumber: string
  productType: string
  productNumber: string
}

export interface NotificationRegistrationInfo {
  registrationStatus?: string | null
  registrationDate?: string | null
  registrationChannel?: string | null
}

export interface AlertDestinationInfo {
  alertChannel?: string | null
  address?: string | null
  language?: string | null
}

export interface AlertProfileInfo {
  alertType?: string | null
  alertStatus?: string | null
  frequency?: string | null
  daysBeforeDue?: number | null
  minimumAmount?: number | null
}

export interface BankingNotificationData {
  registrationInfo?: NotificationRegistrationInfo | null
  alertDestinationInfo?: AlertDestinationInfo[] | null
  alertProfileInfo?: AlertProfileInfo[] | null
}

export interface BankingAccountData {
  accountId: string
  accountNumber: string
  accountName?: string
  accountType?: string
  productNameTh?: string
  productNameEn?: string
  balance: number
  currency: string
  bankCode: string
  status?: string
  openDate?: string
  branchCode?: string
  interestRate?: number

  // Additional fields from bulk account inquiry (raw data)
  branchRegion?: string
  branchName?: string
  onlineOpenFlag?: string
  accountOpenDate?: string
  accountCloseDate?: string
  acctBalList?: Array<{
    balType?: string
    amtSign?: string
    amt?: number
  }>

  // Calculated fields (from customer-service)
  accountTypeName?: string // Calculated account type name (Saving, Current, Fix, Longterm)
  typeOfBook?: string // Passbook, Non-passbook, Online, N/A
  homeBranch?: string // branchRegion + " - " + branchName

  // Formatted date fields (DD/MM/YYYY format)
  accountOpenDateFormat?: string
  accountCloseDateFormat?: string

  // Formatted balance fields (NN,2 format - e.g., 90,000.00)
  availableBalanceFormat?: string
  accountBalanceFormat?: string
  odAmountFormat?: string
  totalHoldAmountFormat?: string
  accumulatedFormat?: string
}

export interface AccountLongtermSubDepositsData {
  accountNumber: string
  firstDepositDate?: string
  paymentAmount?: number
  maturityTenor?: number
  maturityDate?: string
}

/**
 * Account Detail Response (from POST /accountdetail)
 * Aggregated data from bulkAccountInquiry + longtermSubDeposits + productAddress + promptPay
 * This matches the nested structure returned by customer-service AccountDetailResponseDto
 */
export interface AccountDetailData {
  bulkAccountInquiry: {
    accountType: string | null
    accountTypeDes: string | null
    accountNo: string | null
    accountName: string | null
    homeBranch: string | null
    typeOfBook: string | null
    openDate: string | null
    closeDate: string | null
    availableBalance: number | null
    accountBalance: number | null
    odAmount: number | null
    totalHoldAmount: number | null
    accumulatedInterest: number | null
    currency: string | null
    accountSubStatus: string | null
    accountStatus: string | null // Mapped status (Active, Inactive, Suspend)
  }
  longtermSubDeposits: {
    longTermDepositStartDate: string | null
    installmentAmount: number | null
    tenor: number | null
    longTermDepositWithdrawalDate: string | null
  } | null
  productAddress: {
    address: string | null
  } | null
  promptPay: {
    promptPayMobile: string | null
    promptPayCID: string | null
  } | null
  chequeDeposit: {
    todayHold: number | null
    yesterdayHold: number | null
  } | null
  standingOrderDebit: {
    domDebit: string | null
    debitAccount: string | null
    currency: string | null
  } | null
}

// ============================================================================
// Bulk Account Inquiry Types (from customer-service)
// ============================================================================

export interface DepositAccountData {
  // Original fields
  accountNo: string // Note: customer-service sends "accountNo" not "accountNumber"
  accountName?: string
  accountStatus?: string
  accountSubStatus?: string
  miscellaneousMessage?: string
  productName?: string
  homeBranch?: string
  typeOfBook?: string
  openDate?: string
  availableBalance?: number
  accountBalance?: number

  // Additional fields from bulk account inquiry (for future calculations)
  accountNumber?: string
  branchRegion?: string
  branchName?: string
  onlineOpenFlag?: string
  accountOpenDate?: string
  accountCloseDate?: string
  acctBalList?: Array<{
    balType?: string
    amtSign?: string
    amt?: number
  }>

  // Calculated fields from customer-service
  accountTypeName?: string // Calculated from accountType (Saving, Current, Fix, Longterm)

  // Formatted date fields (DD/MM/YYYY format)
  accountOpenDateFormat?: string
  accountCloseDateFormat?: string

  // Formatted balance fields (NN,2 format - e.g., 90,000.00)
  availableBalanceFormat?: string
  accountBalanceFormat?: string
  odAmountFormat?: string
  totalHoldAmountFormat?: string
  accumulatedFormat?: string
}

export interface BulkAccountInquiryBackendResponse {
  statusCode: string
  success: boolean
  message: string
  body: {
    data: {
      totalRecord: number
      deposit: DepositAccountData[]
    }
  }
}

// ============================================================================
// Customer Account List Types
// ============================================================================

export interface AccountRelationData {
  applicationCode: string
  accountNumber: string
  accountName: string
  accountStatus: string
  accountSubStatus?: string
  accountBranchCode: string
  accountCardRef: string
  accountType: string
  accountTypeOfBook: string
}

export interface AccountListDataData {
  totalRecord: number
  accountRelation: AccountRelationData[]
}

export interface AccountListBodyData {
  data: AccountListDataData
}

export interface CustomerAccountListResponse {
  statusCode: string
  success: boolean
  message: string
  body: AccountListBodyData
}

export interface CodeNameField {
  code: string
  nameTh: string
  nameEn: string
}

export interface CustomerEngagementItem {
  id: string
  type: string
  title: string
  titleTh: string
  description: string
  name: string
  nameTh: string
  campaignName: string
  insight: string
  saleScript: string
  bestTimeToContact: string
  isLead: boolean
  leadId: string | null
  rank: number | null
}

export interface CustomerEngagement {
  items: CustomerEngagementItem[]
}

export interface ConsentSubCategory {
  code: string
  nameTh: string
  nameEn: string
}

export interface ConsentItem {
  consentType: string
  consentName: string
  subCategories: ConsentSubCategory[] | null
}

export interface ProductRestriction {
  productCode: string
  productName: string
}

export interface OverviewMetrics {
  pendingLeads: number
  pendingOpportunities: number
  cases: number
  complaints: number
}

export interface CustomerOverviewData {
  customerType: string
  overviewMetrics: OverviewMetrics
  customerEngagement: CustomerEngagement | null
  consentsWithNoStatus: ConsentItem[] | null
  doNotContactForMarketing: CodeNameField[] | null
  doNotOfferProducts: ProductRestriction[] | null
}

export interface CustomerHeaderData {
  customerName: string | null
  age: number | null
  customerSegment: string | null
  customerOwner: string | null
  phoneNumber: string | null
  emailAddress: string | null
  type: string | null
  ocCode: string | null
  customerGroup: string | null
  customerGroupType: string | null
  industry: string | null
  customerCategory: string | null
}

export interface TeamMember {
  id: string
  staffId: string
  staffName: string | null
  ocCode: string | null
  userRole: string | null
  team: string | null
  phoneNumber: string | null
  email: string | null
  roleCode: string
  roleNameEn: string | null
  roleNameTh: string | null
  permission: 'VIEW' | 'VIEW_EDIT'
}

export interface TeamMemberPagedData {
  content: TeamMember[]
  page: number
  size: number
  totalElements: number
  totalPages: number
}

export interface AddCustomerTeamMemberInput {
  staffId: string
  roleCode: string
  permission: 'VIEW' | 'VIEW_EDIT'
}

export interface UserAccountNameResponse {
  staffId: string
  firstName: string
  middleName: string | null
  lastName: string
  ocCode: string
  roleId: string
  roleName: string
  team: string
  phone: string
  email: string
}

export interface UserAccountNamePagedData {
  content: UserAccountNameResponse[]
  page: number
  size: number
  totalElements: number
  totalPages: number
  first: boolean | null
  last: boolean | null
}

export interface CustomerOwnerData {
  user: string | null
  staffId: string | null
  ocCode: string | null
  role: string | null
  team: string | null
  mobile: string | null
  phoneNumber: string | null
  phoneExtension: string | null
  emailAddress: string | null
  status: string | null
}

/**
 * Responsible RM item representing a role and its assigned user
 */
export interface ResponsibleRmItem {
  roleCode: string
  labelEn: string | null
  labelTh: string | null
  user: string | null
  staffId: string | null
  phone: string | null
  phoneExtension: string | null
  assignedDate: string | null
}

/**
 * Customer responsible RM data containing list of responsible parties
 */
export interface CustomerResponsibleRmData {
  items: ResponsibleRmItem[]
}

/**
 * Customer Info Section for CCT Header
 */
export interface CustomerInfoSectionData {
  customerKey?: string | null
  customerSegment?: string | null
  customerSegmentLabel?: string | null
  fullNameTh?: string | null
  fullNameEn?: string | null
  thaiComlTitle?: string | null
  thaiComlName?: string | null
  genderCode?: string | null
  genderLabel?: string | null
  birthDate?: string | null
  nationalityCode?: string | null
  custTypeCode?: string | null
  custTypeLabel?: string | null
  customerAddedDate?: string | null
  vipCode?: string | null
  statusCode?: string | null
  referenceInfo?: {
    referenceTypeCode?: string | null
    referenceTypeLabel?: string | null
    referenceNumber?: string | null
    referenceExpiryDate?: string | null
  } | null
  employmentInfo?: {
    occupationCode?: string | null
    occupationGroup?: string | null
    departmentName?: string | null
    businessType?: string | null
  } | null
}
// Customer Sensitivity Types
export interface RiskAssessmentData {
  riskScore: number | null
  customerType: string | null
  moreThan60YearsOld: boolean | null
  levelOfUnderstanding: string | null
  experienceInInvestment: string | null
  communicationLimitations: boolean | null
  hearingImpairments: boolean | null
  visualImpairments: boolean | null
  healthImpairments: boolean | null
  canAcceptForexRisk: boolean | null
  lastUpdate: string | null
  expireUpdate: string | null
}

export interface CustomerSensitivityFlags {
  isComplaintCustomer: boolean | null
  isLegalDisputeCustomer: boolean | null
  isUnitLinkedSuitable: boolean | null
  isSeniorCustomer: boolean | null
  customerAge: number | null
}

export interface CustomerSensitivityData {
  riskAssessment: RiskAssessmentData | null
  customerSensitivity: CustomerSensitivityFlags | null
}

export interface CustomerBusinessDescriptionData {
  coreBusinessDescription: string | null
  marketPositionCompetitiveLandscape: string | null
  productsRevenueShare: string | null
  strategicBusinessDirection: string | null
  suppliers: string | null
  managementPlan: string | null
  customerBaseDescription: string | null
  createdBy: string | null
  createdDateTime: string | null
  updatedBy: string | null
  updatedDateTime: string | null
}

export interface CustomerPersonalFinancialBehaviorData {
  customerId: string
  incomeRange: string | null
  actualIncome: number | null
  monthlyIncome: number | null
  redeemDate: string | null
  lifestyle: string | null
  goalSetting: string | null
  goalSettingBig: string | null
  goalSettingDate: string | null
  backgroundInformation: string | null
  monthlySpending: number | null
  planInLife: string | null
  plansForFutureSpending: string | null
  customerDnaCode: string | null
  customerDnaEn: string | null
  customerDnaTh: string | null
  wealthBehaviorCode: string | null
  wealthBehaviorEn: string | null
  wealthBehaviorTh: string | null
  lendingBehavior: string | null
  channelBehaviorCode: string | null
  channelBehaviorEn: string | null
  channelBehaviorTh: string | null
  customerValueCode: string | null
  customerValueEn: string | null
  customerValueTh: string | null
  lastComplaint: string | null
  lastPurchase: string | null
  lastOpportunity: string | null
  totalAssets: number | null
  freeAssets: number | null
  assetsPortionInScb: number | null
}

export interface CustomerBusinessSpecificInformationData {
  yearInBusiness: number | null
  registeredCapital: number | null
  operatingIncome: number | null
  status: string | null
  customerSource: string | null
  numberOfEmployees: number | null
  website: string | null
  isicCode: string | null
  isicDescription: string | null
  industry: string | null
  subIndustry: string | null
}

export interface WealthInfoData {
  customerId: string
  freezeBaseStatusEndDt: string
  autoPrice: number | null
  aumAvg6m: number | null
  aumAvg1m: number | null
  aumMonthly: number | null
  aumCurrent: number | null
  segmentGroup: string | null
  segmentGroupAsOf: string | null
  potentialCriteria: string | null
}

/**
 * Customer AUA (Assets Under Advice) Information
 * AP2457-8468: AUA Information Query
 * All amounts are in THB (Thai Baht)
 */
export interface AuaInfoData {
  customerId: string
  totalAua: number | null
  maxAua12mths: number | null
  auaGap: number | null
  nnm: number | null
  engagementSla: string | null
  riskAssetAllocation: string | null
  ews: number | null
  etw: number | null
  depositAua: number | null
  insuranceAua: string | null
  investmentAua: number | null
  hvAua: number | null
  goalTips: string | null
}

// ============================================================================
// Insurance Types
// ============================================================================

/**
 * Insurance complaint information
 */
export interface InsuranceComplaint {
  id: string
  customerGroup: string
  complaintTopic: string
  year: number
}

/**
 * Insurance policy group by product category
 */
export interface InsurancePolicyGroup {
  productCategoryCode: string
  productCategoryNameTh: string
  productCategoryNameEn: string
  totalPolicies: number
  totalPremiumPerYear: number
}

/**
 * Customer insurance overview data
 */
export interface CustomerInsuranceOverviewData {
  totalPolicies: number
  totalPremiumPerYear: number
  vcGridColor: string | null
  complaints: InsuranceComplaint[]
  policiesGroup: InsurancePolicyGroup[]
}

/**
 * Customer behavior insurance data (camelCase, pass-through from backend).
 * GET /api/v1/customers/{id}/behavior/insurance
 */
export interface CustomerBehaviorInsuranceData {
  customerId: string | null
  maxInsureElsewhere: number | null
  insureSummary: string | null
  insureExpireDate: string | null
  ilCustGroup: string | null
}

export interface LifeInsurancePolicy {
  insuranceNumber: string
  productName: string | null
  productType: string | null
  premiumAmount: number | null
  productCategoryCode: string | null
  productCategoryNameTh: string | null
  productCategoryNameEn: string | null
  coverageTerm: string | null
  coverageAmount: number | null
  startDate: string | null
  endDate: string | null
  afypAmount: number | null
  paymentTerm: string | null
  paymentTypeCd: string | null
  premiumExpiryDate: string | null
  status: string | null
  paymentStatus: string | null
}

export interface InsuranceLifePoliciesPagedData {
  content: LifeInsurancePolicy[]
  page: number
  size: number
  totalElements: number
  totalPages: number
  first: boolean
  last: boolean
}

export interface NonLifeInsurancePolicy {
  insuranceNumber: string
  productName: string | null
  productType: string | null
  coverageTerm: string | null
  coverageAmount: number | null
  startDate: string | null
  endDate: string | null
  premiumAmount: number | null
  afypAmount: number | null
  paymentTerm: string | null
  paymentTypeCd: string | null
  premiumExpiryDate: string | null
  status: string | null
  paymentStatus: string | null
}

export interface InsuranceNonLifePoliciesPagedData {
  content: NonLifeInsurancePolicy[]
  page: number
  size: number
  totalElements: number
  totalPages: number
  first: boolean
  last: boolean
}

/**
 * Customer behavior investment data
 * Backend returns camelCase fields matching GraphQL schema (pass-through).
 */
export interface CustomerBehaviorInvestmentData {
  customerId: string | null
  investmentCustomerGroup: string | null
  investmentLastYearAssetClass: string | null
  investmentRiskLevel: string | null
  investmentCustomerYield: number | null
  investmentHabit: string | null
  casaToInv: number | null
  avgCasaOpportunity3mths: number | null
  noOfAssetClass: number | null
  assetClass: string | null
  investSummary: string | null
  maxInvestElsewhere: number | null
  investmentStyle: string | null
  hvCustGroup: string | null
  riskAssetAllocation: string | null
}

/**
 * Customer behavior "Other" data (camelCase, pass-through from backend).
 * Pass-through only - BFF applies no business logic to Temp fields.
 */
export interface CustomerBehaviorOtherData {
  customerId: string | null
  invCustGroup: string | null
  cpType: string | null
  aaKpisRmSelected: string | null
  customerActivation: string | null
  customerMigration: string | null
  portfolioReturn: string | null
  wealthAumInvxEndMonth: string | null
  temp2: string | null
  temp4: string | null
  temp10: string | null
  temp12: string | null
  temp14: string | null
}

/**
 * Customer behavior investment preference data (camelCase, pass-through from backend).
 */
export interface CustomerBehaviorInvestmentPreferenceData {
  customerId: string | null
  investmentObjectiveRank1: string | null
  investmentObjectiveRank2: string | null
  investmentPotentialProd1: string | null
  investmentPotentialProd2: string | null
  investmentPotentialProd3: string | null
}

// ============================================================================
// CustomerDataSource
// ============================================================================

export class CustomerDataSource extends BaseDataSource {
  override baseURL = config.services.customerService

  /**
   * Get customer info section for CCT Header
   * POST /api/v1/customer-overview/customer-info-section
   */
  async getCustomerInfoSection(customerKey: string): Promise<ServiceResponse<CustomerInfoSectionData | null>> {
    this.logger.debug({ msg: 'Fetching customer info section', customerKey })

    try {
      // Backend returns StandardResponseDto format (same as Home Loan)
      const response = await this.post<StandardResponseDto>('/api/v1/customer-overview/customer-info-section', {
        body: { customerKey },
      })

      // Apollo RESTDataSource unwraps response automatically
      // customer-service sends: { statusCode, success, message, body: { data } }
      // Apollo gives us: { statusCode, success, message, body: { data } } OR { statusCode, success, message, data }

      let customerData = null

      // Try multiple paths to find data
      if (response.body?.data) {
        // Path 1: response.body.data (wrapped - expected structure)
        customerData = response.body.data
        this.logger.info({ msg: 'Found data at response.body.data', customerKey })
      } else if ((response as any).data) {
        // Path 2: response.data (unwrapped by Apollo)
        customerData = (response as any).data
        this.logger.info({ msg: 'Found data at response.data (Apollo unwrapped)', customerKey })
      } else if ((response as any).body && typeof (response as any).body === 'object') {
        // Path 3: response.body itself might be the data
        customerData = (response as any).body
        this.logger.info({ msg: 'Found data at response.body (Apollo unwrapped differently)', customerKey })
      } else {
        this.logger.error({
          msg: 'Could not find customer data in response',
          customerKey,
          responseKeys: Object.keys(response),
          fullResponse: JSON.stringify(response).substring(0, 500), // First 500 chars
        })
      }

      // Transform to ServiceResponse format
      return {
        code: response.success ? 'SUCCESS' : 'ERROR',
        message: response.message || 'Customer info section retrieved successfully',
        messageTemplate: createResponseMessage(response.message || 'Customer info section retrieved successfully'),
        data: customerData,
        httpStatus: Number.parseInt(response.statusCode) || 200,
      }
    } catch (error: any) {
      this.logger.error({
        msg: 'Error fetching customer info section',
        customerKey,
        error: error instanceof Error ? error.message : String(error),
      })
      return handleError(error, null)
    }
  }

  /**
   * Get enum standard list by sub-code
   * GET /api/v1/customers/enum?subCode={subCode}
   *
   * @param subCode - Enum sub-code group (e.g., 'CUS-SBY')
   * @param search - Optional search term
   * @param page - Page number (1-indexed, default: 1)
   * @param size - Items per page (default: 10)
   * @returns ServiceResponse with list of enum standard items
   */
  async getEnum(
    subCode: string,
    search?: string,
    page: number = 1,
    size: number = 10
  ): Promise<ServiceResponse<EnumStandardListCodePagedData>> {
    try {
      this.logger.debug({
        msg: 'Fetching enum standard list',
        subCode,
        search,
        page,
        size,
      })

      const response = await this.get<ServiceResponse<EnumStandardListCodePagedData>>(`api/v1/customers/enum`, {
        params: {
          subCode,
          ...(search && { search }),
          page: String(page),
          size: String(size),
        },
      })

      this.logger.debug({
        msg: 'Enum standard list fetched successfully',
        subCode,
        search,
        page,
        size,
        count: response.data?.content?.length ?? 0,
      })

      return { ...response, httpStatus: 200 }
    } catch (error: unknown) {
      this.logger.warn({
        msg: 'Error fetching enum standard list',
        subCode,
        error: error instanceof Error ? error.message : String(error),
      })
      return handleError(error, { content: [], page: 0, size: 0, totalElements: 0, totalPages: 0 })
    }
  }

  /**
   * Search customers by identification type and value
   * GET /api/v1/customers?searchType={searchType}&searchValue={searchValue}
   *
   * @param searchType - Identification type code (e.g., 'CUS-SBY-1' for Citizen ID)
   * @param searchValue - Identification number to search for
   * @returns ServiceResponse with list of matched customers
   */
  async searchCustomers(searchType: string, searchValue: string): Promise<ServiceResponse<CustomerSearchItem[]>> {
    try {
      this.logger.debug({
        msg: 'Searching customers',
        searchType,
        searchValue,
      })

      const response = await this.get<ServiceResponse<CustomerSearchItem[]>>(`api/v1/customers`, {
        params: { searchType, searchValue },
      })

      this.logger.debug({
        msg: 'Customers searched successfully',
        searchType,
        count: response.data?.length ?? 0,
      })

      return { ...response, httpStatus: 200 }
    } catch (error: unknown) {
      this.logger.warn({
        msg: 'Error searching customers',
        searchType,
        error: error instanceof Error ? error.message : String(error),
      })
      return handleError(error, [])
    }
  }

  /**
   * Search customers with filters, pagination, and sorting
   * POST /api/v1/customers/search
   */
  async searchCustomersPost(input: CustomerSearchPostInput): Promise<ServiceResponse<CustomerSearchPagedData | null>> {
    try {
      this.logger.info({ msg: 'Performing customer search', page: input.page, size: input.size })

      const response = await this.post<ServiceResponse<CustomerSearchPagedData>>('api/v1/customers/search', {
        body: input,
      })

      return { ...response, data: response.data ?? null, httpStatus: 200 }
    } catch (error: unknown) {
      this.logger.error({
        msg: 'Error performing customer search',
        error: error instanceof Error ? error.message : String(error),
      })
      return handleError(error, null)
    }
  }

  /**
   * Get contact channels by customer ID
   * GET /api/v1/customers/{id}/contact-channels
   */
  async getContactChannels(id: string): Promise<ServiceResponse<ContactChannelItem[] | null>> {
    try {
      this.logger.info({ msg: 'Fetching customer contact channels', customerId: id })
      const response = await this.get<ServiceResponse<ContactChannelItem[]>>(`api/v1/customers/${id}/contact-channels`)
      return { ...response, data: response.data ?? null, httpStatus: 200 }
    } catch (error: unknown) {
      this.logger.error({
        msg: 'Error fetching customer contact channels',
        customerId: id,
        error: error instanceof Error ? error.message : String(error),
      })
      return handleError(error, null)
    }
  }

  /**
   * Get customer addresses by customer ID with pagination
   * GET /api/v1/customers/{id}/addresses
   */
  async getCustomerAddresses(
    id: string,
    page?: number,
    size?: number,
    forceRefresh?: boolean
  ): Promise<ServiceResponse<CustomerAddressPagedData | null>> {
    try {
      this.logger.info({ msg: 'Fetching customer addresses', customerId: id, page, size, forceRefresh })
      const response = await this.get<ServiceResponse<CustomerAddressPagedData>>(`api/v1/customers/${id}/addresses`, {
        params: {
          ...(page !== null && { page: String(page) }),
          ...(size !== null && { size: String(size) }),
          ...(forceRefresh !== undefined && { forceRefresh: String(forceRefresh) }),
        },
      })
      return { ...response, data: response.data ?? null, httpStatus: 200 }
    } catch (error: unknown) {
      this.logger.error({
        msg: 'Error fetching customer addresses',
        customerId: id,
        error: error instanceof Error ? error.message : String(error),
      })
      return handleError(error, null)
    }
  }

  /**
   * Get customer contact persons by customer ID with pagination
   * GET /api/v1/customers/{id}/contact-person
   */
  async getCustomerContactPersons(
    id: string,
    page?: number,
    size?: number
  ): Promise<ServiceResponse<CustomerContactPersonPagedData | null>> {
    try {
      this.logger.info({ msg: 'Fetching customer contact persons', customerId: id, page, size })

      const response = await this.get<ServiceResponse<CustomerContactPersonPagedData>>(
        `api/v1/customers/${id}/contact-person`,
        {
          params: {
            ...(page !== null && { page: String(page) }),
            ...(size !== null && { size: String(size) }),
          },
        }
      )

      return { ...response, data: response.data ?? null, httpStatus: 200 }
    } catch (error: unknown) {
      this.logger.error({
        msg: 'Error fetching customer contact persons',
        customerId: id,
        error: error instanceof Error ? error.message : String(error),
      })
      return handleError(error, null)
    }
  }

  /**
   * Get customer phones by customer ID with pagination
   * GET /api/v1/customers/{id}/phones
   */
  async getCustomerPhones(
    id: string,
    page?: number,
    size?: number,
    forceRefresh?: boolean
  ): Promise<ServiceResponse<CustomerPhonePagedData | null>> {
    try {
      this.logger.info({ msg: 'Fetching customer phones', customerId: id, page, size, forceRefresh })
      const response = await this.get<ServiceResponse<CustomerPhonePagedData>>(`api/v1/customers/${id}/phones`, {
        params: {
          ...(page !== null && { page: String(page) }),
          ...(size !== null && { size: String(size) }),
          ...(forceRefresh !== undefined && { forceRefresh: String(forceRefresh) }),
        },
      })
      return { ...response, data: response.data ?? null, httpStatus: 200 }
    } catch (error: unknown) {
      this.logger.error({
        msg: 'Error fetching customer phones',
        customerId: id,
        error: error instanceof Error ? error.message : String(error),
      })
      return handleError(error, null)
    }
  }

  /**
   * Get customers matching a phone number with pagination
   * POST /api/v1/integration/phone-matching-customer
   */
  async phoneMatchingCustomer(
    phoneNumber: string,
    offset: number = 0,
    limit: number = 10
  ): Promise<ServiceResponse<PhoneMatchingData | null>> {
    try {
      this.logger.info({ msg: 'Fetching customers matching phone number', phoneNumber, offset, limit })
      const response = await this.post<StandardResponseDto<PhoneMatchingData>>(
        'api/v1/integration/phone-matching-customer',
        {
          body: {
            phoneNumber,
            offset,
            limit,
          },
        }
      )

      // Transform StandardResponseDto to ServiceResponse
      return {
        code: response.statusCode === '200' ? 'SUCCESS' : 'INTERNAL_ERROR',
        message: response.message,
        messageTemplate: createResponseMessage(response.message),
        data: response.body?.data ?? null,
        httpStatus: 200,
      }
    } catch (error: unknown) {
      this.logger.error({
        msg: 'Error fetching customers matching phone number',
        phoneNumber,
        error: error instanceof Error ? error.message : String(error),
      })
      return handleError(error, null)
    }
  }

  /**
   * Get customer emails by customer ID with pagination
   * GET /api/v1/customers/{id}/emails
   */
  async getCustomerEmails(
    id: string,
    page?: number,
    size?: number,
    forceRefresh?: boolean
  ): Promise<ServiceResponse<CustomerEmailPagedData | null>> {
    try {
      this.logger.info({ msg: 'Fetching customer emails', customerId: id, page, size, forceRefresh })
      const response = await this.get<ServiceResponse<CustomerEmailPagedData>>(`api/v1/customers/${id}/emails`, {
        params: {
          ...(page !== null && { page: String(page) }),
          ...(size !== null && { size: String(size) }),
          ...(forceRefresh !== undefined && { forceRefresh: String(forceRefresh) }),
        },
      })
      return { ...response, data: response.data ?? null, httpStatus: 200 }
    } catch (error: unknown) {
      this.logger.error({
        msg: 'Error fetching customer emails',
        customerId: id,
        error: error instanceof Error ? error.message : String(error),
      })
      return handleError(error, null)
    }
  }

  /**
   * Get customer consents by customer ID
   * GET /api/v1/customers/{id}/consents
   */
  async getCustomerConsents(id: string): Promise<ServiceResponse<CustomerConsent | null>> {
    try {
      this.logger.info({ msg: 'Fetching customer consents', customerId: id })
      const response = await this.get<ServiceResponse<CustomerConsent>>(`api/v1/customers/${id}/consents`)
      return { ...response, data: response.data ?? null, httpStatus: 200 }
    } catch (error: unknown) {
      this.logger.error({
        msg: 'Error fetching customer consents',
        customerId: id,
        error: error instanceof Error ? error.message : String(error),
      })
      return handleError(error, null)
    }
  }

  /**
   * Get customer identifications by customer ID
   * GET /api/v1/customers/{id}/identifications
   */
  async getCustomerIdentifications(id: string): Promise<ServiceResponse<CustomerIdentification | null>> {
    try {
      this.logger.info({ msg: 'Fetching customer identifications', customerId: id })
      const response = await this.get<ServiceResponse<CustomerIdentification>>(`api/v1/customers/${id}/identifications`)
      return { ...response, data: response.data ?? null, httpStatus: 200 }
    } catch (error: unknown) {
      this.logger.error({
        msg: 'Error fetching customer identifications',
        customerId: id,
        error: error instanceof Error ? error.message : String(error),
      })
      return handleError(error, null)
    }
  }

  /**
   * Create feedback contact request
   * POST /api/v1/customers/{id}/contact/feedback
   */
  async createFeedbackContactRequest(
    customerId: string,
    input: CreateFeedbackContactRequestInput
  ): Promise<ServiceResponse<unknown>> {
    try {
      this.logger.info({ msg: 'Creating feedback contact request', customerId })

      const response = await this.post<ServiceResponse<unknown>>(`api/v1/customers/${customerId}/contact/feedback`, {
        body: input,
      })

      return { ...response, httpStatus: 200 }
    } catch (error: unknown) {
      this.logger.error({
        msg: 'Error creating feedback contact request',
        customerId,
        error: error instanceof Error ? error.message : String(error),
      })
      return handleError(error, null)
    }
  }

  /**
   * Create individual customer
   * POST /api/v1/customers/individual
   */
  async createCustomerIndividual(
    input: CreateCustomerIndividualInput
  ): Promise<ServiceResponse<CreateCustomerIndividualResponseData | null>> {
    try {
      this.logger.info({
        msg: 'Creating individual customer',
        ownerOcCode: input.ownerOcCode,
        identificationTypeCode: input.identificationTypeCode,
      })

      const endpoint = 'api/v1/customers/individual'

      const response = await this.post<{
        code: string
        message: string
        data: CreateCustomerIndividualResponseData | null
      }>(endpoint, {
        body: input,
      })

      this.logger.info({
        msg: 'Individual customer created successfully',
        customerId: response.data?.customerId,
      })

      return {
        code: response.code,
        message: response.message,
        messageTemplate: createResponseMessage(response.message || 'Success'),
        data: response.data ?? null,
        httpStatus: 200,
      }
    } catch (error: unknown) {
      this.logger.error({
        msg: 'Error creating individual customer',
        ownerOcCode: input.ownerOcCode,
        error: error instanceof Error ? error.message : String(error),
      })
      return handleValidationErrors(error, null)
    }
  }

  /**
   * Get list of customer occupations
   * GET /api/v1/customers/occupations
   */
  async getCustomerOccupations(): Promise<ServiceResponse<CustomerOccupationItem[]>> {
    const emptyData: CustomerOccupationItem[] = []
    try {
      this.logger.info({ msg: 'Fetching customer occupations' })

      const response = await this.get<ServiceResponse<CustomerOccupationItem[]>>('api/v1/customers/occupations')

      this.logger.info({
        msg: 'Customer occupations fetched successfully',
        count: response.data?.length ?? 0,
      })

      return { ...response, data: response.data ?? emptyData, httpStatus: 200 }
    } catch (error: unknown) {
      this.logger.error({
        msg: 'Error fetching customer occupations',
        error: error instanceof Error ? error.message : String(error),
      })
      return handleError(error, emptyData)
    }
  }

  /**
   * Get customer privilege info
   * GET /api/v1/customers/{customerId}/privilege-info
   */
  async getCustomerPrivilegeInfo(customerId: string): Promise<ServiceResponse<PrivilegeInfo | null>> {
    try {
      this.logger.info({ msg: 'Fetching customer privilege info', customerId })

      const response = await this.get<ServiceResponse<PrivilegeInfo>>(`api/v1/customers/${customerId}/privilege-info`)

      this.logger.info({
        msg: 'Customer privilege info fetched successfully',
        customerId,
      })

      return { ...response, data: response.data ?? null, httpStatus: 200 }
    } catch (error: unknown) {
      this.logger.error({
        msg: 'Error fetching customer privilege info',
        customerId,
        error: error instanceof Error ? error.message : String(error),
      })
      return handleError(error, null)
    }
  }
  /**
   * Get total number of accounts for a customer and product type.
   * POST /api/v1/produc-holding/customer/total-account
   * Returns StandardResponse<TotalAccountDataDto> format
   */
  async getCustomerTotalAccount(
    customerKey: string,
    productType: string
  ): Promise<ServiceResponse<CustomerTotalAccountData>> {
    try {
      this.logger.info({
        msg: 'Fetching customer total account',
        customerKey,
        productType,
        baseURL: this.baseURL,
      })

      // Use fetch directly to avoid BaseDataSource headers
      const url = `${this.baseURL}/api/v1/product-holding/total-account`
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customerKey,
          productType,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        this.logger.error({
          msg: 'HTTP error fetching customer total account',
          customerKey,
          productType,
          status: response.status,
          statusText: response.statusText,
          errorBody: errorText,
        })
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      // Backend now returns StandardResponse<TotalAccountDataDto> format:
      // { code: "GEN-S00001", message: "...", data: { totalAccounts: 1 }, httpStatus: 200 }
      const rawResponse = (await response.json()) as {
        code: string
        message: string
        data: CustomerTotalAccountData
        httpStatus: number
      }

      this.logger.info({
        msg: 'Customer total account fetched successfully',
        customerKey,
        productType,
        code: rawResponse.code,
        httpStatus: rawResponse.httpStatus,
        totalAccounts: rawResponse.data?.totalAccounts ?? 0,
        totalAccountsST: rawResponse.data?.totalAccountsST,
        totalAccountsIM: rawResponse.data?.totalAccountsIM,
        totalAccountsEC: rawResponse.data?.totalAccountsEC,
        totalAccountsOE: rawResponse.data?.totalAccountsOE,
      })

      // Convert to ServiceResponse format for transformServiceResponse
      return {
        code: rawResponse.code,
        message: rawResponse.message,
        messageTemplate: createResponseMessage(rawResponse.message),
        data: rawResponse.data,
        httpStatus: rawResponse.httpStatus,
      }
    } catch (error: unknown) {
      this.logger.error({
        msg: 'Error fetching customer total account',
        customerKey,
        productType,
        error: error instanceof Error ? error.message : String(error),
      })

      // Return error as ServiceResponse for consistent error handling
      return handleError(error, {
        totalAccounts: 0,
      })
    }
  }

  /**
   * Get digital adoption information for a customer.
   * POST /api/v1/product-holding/digital-adoption
   */
  async getDigitalAdoption(customerKey: string, productType: string): Promise<Record<string, any>> {
    try {
      this.logger.info({
        msg: 'Fetching digital adoption',
        customerKey,
        productType,
        baseURL: this.baseURL,
      })

      const url = `${this.baseURL}/api/v1/product-holding/digital-adoption`
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customerKey,
          productType,
        }),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = (await response.json()) as Record<string, any>

      this.logger.info({
        msg: 'Digital adoption fetched successfully',
        customerKey,
        productType,
        hasData: !!data,
      })

      return data
    } catch (error: unknown) {
      this.logger.error({
        msg: 'Error fetching digital adoption',
        customerKey,
        productType,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  /**
   * Get count of Digital Banking & Notification (DG) items for a customer,
   * along with flags indicating whether the DG tile/tab is enabled.
   * POST /api/v1/product-holding/digital-banking-notifications/count
   * Returns StandardResponse<DigitalBankingNotificationCountData> format
   */
  async getDigitalBankingNotificationCount(
    customerId: string
  ): Promise<ServiceResponse<DigitalBankingNotificationCountData>> {
    try {
      const response = await this.post<StandardResponseDto<DigitalBankingNotificationCountData>>(
        'api/v1/product-holding/digital-banking-notifications/count',
        { body: { customerId } }
      )

      this.logger.info({
        msg: 'Digital banking notification count fetched successfully',
        customerId,
        statusCode: response.statusCode,
        count: response.body?.data?.count ?? 0,
        isEnable: response.body?.data?.isEnable ?? false,
      })

      return {
        code: response.statusCode === '200' ? DEFAULT_SUB_CODE_SUCCESS : DEFAULT_SUB_CODE_ERROR,
        message: response.message,
        messageTemplate: createResponseMessage(response.message),
        data: response.body?.data ?? { count: 0, isEnable: false },
        httpStatus: Number.parseInt(response.statusCode) || 200,
      }
    } catch (error: unknown) {
      this.logger.error({
        msg: 'Error fetching digital banking notification count',
        customerId,
        error: error instanceof Error ? error.message : String(error),
      })

      return handleError(error, {
        count: 0,
        isEnable: false,
      })
    }
  }
  /*
   * Get banking accounts using bulk inquiry
   * POST /api/v1/product-holding/banking/bulkAccountInquiry
   *
   * @param accounts - Array of account inquiry inputs
   * @returns ServiceResponse with list of banking accounts
   */
  async getBankingAccounts(accounts: AccountInquiryInput[]): Promise<ServiceResponse<BankingAccountData[]>> {
    try {
      const endpoint = 'api/v1/product-holding/banking/bulk-account-inquiry'

      this.logger.info({
        msg: 'Fetching banking accounts from customer-service',
        accountCount: accounts.length,
        baseURL: this.baseURL,
        endpoint,
        fullURL: `${this.baseURL}/${endpoint}`,
      })

      // Transform input to backend format (array of objects)
      const requestBody = accounts.map((acc) => ({
        accountNumber: acc.accountNumber,
        currency: acc.currency,
        bankCode: acc.bankCode,
      }))

      const response = await this.post<BulkAccountInquiryBackendResponse>(endpoint, {
        body: requestBody,
      })

      this.logger.info({
        msg: 'Banking accounts fetched from customer-service',
        accountCount: response.body?.data?.deposit?.length ?? 0,
        statusCode: response.statusCode,
      })

      // Transform backend response to ServiceResponse format
      const depositAccounts = response.body?.data?.deposit ?? []
      const mappedData: BankingAccountData[] = depositAccounts.map((account: DepositAccountData, index: number) => ({
        // Core fields
        accountId: account.accountNo || account.accountNumber || `ACC-${index + 1}`,
        accountNumber: account.accountNo || account.accountNumber || '',
        accountName: account.accountName || undefined,
        accountType: account.accountSubStatus || undefined,
        productNameTh: account.productName || undefined,
        productNameEn: account.productName || undefined,
        balance: account.availableBalance ?? account.accountBalance ?? 0,
        currency: '764', // THB - from request
        bankCode: '14', // SCB - from request
        status: account.accountStatus || undefined,
        openDate: account.openDate || undefined,
        branchCode: account.homeBranch || undefined,
        interestRate: undefined, // Not available in current response

        // Additional fields from bulk account inquiry (raw data - pass through for future use)
        branchRegion: account.branchRegion || undefined,
        branchName: account.branchName || undefined,
        onlineOpenFlag: account.onlineOpenFlag || undefined,
        accountOpenDate: account.accountOpenDate || undefined,
        accountCloseDate: account.accountCloseDate || undefined,
        acctBalList: account.acctBalList || undefined,

        // Calculated fields from customer-service (NEW!)
        accountTypeName: account.accountTypeName || undefined,
        typeOfBook: account.typeOfBook || undefined,
        homeBranch: account.homeBranch || undefined,

        // Formatted date fields (DD/MM/YYYY format) (NEW!)
        accountOpenDateFormat: account.accountOpenDateFormat || undefined,
        accountCloseDateFormat: account.accountCloseDateFormat || undefined,

        // Formatted balance fields (NN,2 format - e.g., 90,000.00) (NEW!)
        availableBalanceFormat: account.availableBalanceFormat || undefined,
        accountBalanceFormat: account.accountBalanceFormat || undefined,
        odAmountFormat: account.odAmountFormat || undefined,
        totalHoldAmountFormat: account.totalHoldAmountFormat || undefined,
        accumulatedFormat: account.accumulatedFormat || undefined,
      }))

      // Follow auto-finance pattern: propagate backend statusCode and message as-is
      // No message mapping - let backend control the message content
      const serviceResponse: ServiceResponse<BankingAccountData[]> = {
        code: response.statusCode || 'SUCCESS',
        message: response.message || 'Banking accounts fetched successfully',
        messageTemplate: createResponseMessage(response.message || 'Banking accounts fetched successfully'),
        data: mappedData,
        httpStatus: 200,
      }

      this.logger.info({
        msg: 'Banking accounts processed successfully',
        accountCount: mappedData.length,
        statusCode: response.statusCode,
      })

      return serviceResponse
    } catch (error: unknown) {
      this.logger.warn({
        msg: 'Error fetching banking accounts',
        error: error instanceof Error ? error.message : String(error),
      })
      return handleError(error, [])
    }
  }

  /**
   * Get all banking account types (filtered to ST and IM only)
   * POST /api/v1/product-holding/banking/account-list
   *
   * customer-service returns autoMap Response<T>: { code, message, data }.
   * This method maps that payload to the GraphQL legacy shape
   * { statusCode, success, message, body: { data } } used by web-portal.
   *
   * @param customerKey - Customer identifier (30 digits)
   * @returns BankingAccountListResponse (GraphQL contract) with ST/IM accounts only
   */
  async getBankingAccountList(customerKey: string): Promise<BankingAccountListResponse> {
    try {
      this.logger.debug({
        msg: 'Fetching banking account types (will filter to ST and IM only)',
        customerKey,
      })

      const response = await this.post<BankingAccountListBackendResponse>(
        'api/v1/product-holding/banking/account-list',
        {
          body: { customerKey },
        }
      )

      const mapped = mapBankingAccountListToGraphQL(response)
      const originalAccountRelation = mapped.body.data.accountRelation ?? []
      const originalCount = originalAccountRelation.length
      const filteredAccountRelation = filterBankingAccountRelations(originalAccountRelation)

      this.logger.debug({
        msg: 'Banking account types fetched and filtered to ST and IM',
        customerKey,
        code: mapped.statusCode,
        originalCount,
        filteredCount: filteredAccountRelation.length,
        removedCount: originalCount - filteredAccountRelation.length,
      })

      return {
        ...mapped,
        body: {
          data: {
            totalRecord: filteredAccountRelation.length,
            accountRelation: filteredAccountRelation,
          },
        },
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch all banking account types'
      // Prefer backend error body when Apollo RESTDataSource throws on non-2xx
      const errorBody = (error as { extensions?: { response?: { body?: BankingAccountListBackendResponse; status?: number } } })
        ?.extensions?.response?.body
      const httpStatus = (error as { extensions?: { response?: { status?: number } } })?.extensions?.response?.status

      this.logger.error({
        msg: 'Error fetching all banking account types',
        customerKey,
        error: errorMessage,
        httpStatus,
        backendCode: errorBody?.code,
      })

      if (errorBody) {
        const mappedError = mapBankingAccountListToGraphQL(errorBody, errorMessage)
        return {
          ...mappedError,
          success: false,
          statusCode: mappedError.statusCode || String(httpStatus ?? 500),
          body: {
            data: {
              totalRecord: 0,
              accountRelation: [],
            },
          },
        }
      }

      return {
        statusCode: String(httpStatus ?? 500),
        success: false,
        message: errorMessage,
        body: {
          data: { ...EMPTY_BANKING_ACCOUNT_LIST_DATA },
        },
      }
    }
  }

  /**
   * Get Auto Finance contract list
   * POST /api/v1/product-holding/auto-finance/account-list
   *
   * @param customerKey - Customer identifier (30 digits)
   * @returns Raw StandardResponseDto from customer-service with Auto Finance contracts
   */
  async getAutoFinanceContractList(customerKey: string): Promise<AutoFinanceContractListResponse> {
    try {
      this.logger.debug({
        msg: 'Fetching Auto Finance contract list',
        customerKey,
      })

      const response = await this.post<AutoFinanceContractListResponse>(
        'api/v1/product-holding/auto-finance/account-list',
        {
          body: { customerKey },
        }
      )

      this.logger.debug({
        msg: 'Auto Finance contract list fetched successfully',
        customerKey,
        totalRecord: response.body?.data?.totalRecord ?? 0,
      })

      return response
    } catch (error: unknown) {
      this.logger.error({
        msg: 'Error fetching Auto Finance contract list',
        customerKey,
        error: error instanceof Error ? error.message : String(error),
      })

      // Return error response in StandardResponseDto format
      return {
        statusCode: '500',
        success: false,
        message: error instanceof Error ? error.message : 'Failed to fetch Auto Finance contract list',
        body: {
          data: {
            totalRecord: 0,
            contractList: [],
          },
        },
      }
    }
  }
  /**
   * Get Mutual Fund Account List
   * POST /api/v1/product-holding/banking/mutual-fund-account-list
   *
   * Fetches list of mutual fund holdings across joint accounts for a customer.
   *
   * @param customerKey - Customer Key (RM ID)
   * @param applicationId - Application ID (e.g., "OE" for mutual fund)
   * @returns ServiceResponse with list of mutual fund accounts
   */
  async getMutualFundAccountList(customerKey: string, applicationId: string): Promise<ServiceResponse<any[]>> {
    try {
      this.logger.info({
        msg: 'Fetching mutual fund account list',
        customerKey,
        applicationId,
        endpoint: 'api/v1/product-holding/banking/mutual-fund-account-list',
      })

      const response = await this.post<StandardResponseDto<any[]>>(
        'api/v1/product-holding/banking/mutual-fund-account-list',
        { body: { customerKey, applicationId } }
      )

      this.logger.info({
        msg: 'Mutual fund account list fetched successfully',
        customerKey,
        applicationId,
        totalRecords: response.body?.data?.length ?? 0,
        statusCode: response.statusCode,
      })

      return {
        code: response.success ? 'SUCCESS' : 'ERROR',
        subCode: response.statusCode, // Pass statusCode as subCode (e.g., "200" or "GEN-S00001")
        message: response.message || 'Mutual fund account list retrieved successfully',
        messageTemplate: createResponseMessage(response.message || 'Mutual fund account list retrieved successfully'),
        data: response.body?.data ?? [],
        httpStatus: Number.parseInt(response.statusCode) || 200,
      }
    } catch (error) {
      this.logger.error({
        msg: 'Failed to fetch mutual fund account list',
        customerKey,
        applicationId,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      return handleError(error, [])
    }
  }

  /**
   * Get Mutual Fund Debenture
   * POST /api/v1/product-holding/banking/mutual-fund-debenture
   *
   * Fetches mutual fund debenture information by RM ID.
   * Queries customer_mutual_funds_deposit table for scb_debenture_amt and other_debenture_amt.
   *
   * @param rmId - RM ID (Customer Key) to query debenture information
   * @returns ServiceResponse with list of debentures
   */
  async getMutualFundDebenture(
    rmId: string
  ): Promise<ServiceResponse<Array<{ id: string; debentureName: string; amount: number }>>> {
    try {
      this.logger.info({
        msg: 'Fetching mutual fund debenture',
        rmId,
        endpoint: 'api/v1/product-holding/banking/mutual-fund-debenture',
      })

      const response = await this.post<
        StandardResponseDto<{
          debentures: Array<{ id: string; debentureName: string; amount: number }>
        }>
      >('api/v1/product-holding/banking/mutual-fund-debenture', {
        body: { rmId },
      })

      this.logger.info({
        msg: 'Mutual fund debenture fetched successfully',
        rmId,
        totalRecords: response.body?.data?.debentures?.length ?? 0,
        statusCode: response.statusCode,
      })

      return {
        code: response.success ? 'SUCCESS' : 'ERROR',
        message: response.message || 'Mutual fund debenture retrieved successfully',
        messageTemplate: createResponseMessage(response.message || 'Mutual fund debenture retrieved successfully'),
        data: response.body?.data?.debentures ?? [],
        httpStatus: Number.parseInt(response.statusCode) || 200,
      }
    } catch (error) {
      this.logger.error({
        msg: 'Failed to fetch mutual fund debenture',
        rmId,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      return handleError(error, [])
    }
  }

  /**
   * Get Electronic Card List
   * POST /api/v1/product-holding/banking/electronic-card-list
   *
   * Fetches list of electronic cards (debit/credit) linked to customer.
   *
   * @param customerId - Customer ID
   * @param productType - Product type (BK for Banking, AF for Auto Finance)
   * @returns ServiceResponse with electronic card list
   */
  async getElectronicCardList(
    customerId: string,
    productType: string = 'BK'
  ): Promise<ServiceResponse<ElectronicCardListData>> {
    try {
      this.logger.info({
        msg: 'Fetching electronic card list',
        customerId,
        productType,
        endpoint: 'api/v1/product-holding/banking/electronic-card-list',
      })

      // Call Customer Service endpoint
      const response = await this.post<{
        statusCode: string
        success: boolean
        message: string
        body: {
          code: string
          message: string
          data: ElectronicCardListData
        }
      }>('api/v1/product-holding/banking/electronic-card-list', {
        body: { customerId, productType },
      })

      this.logger.debug({
        msg: 'Electronic card list fetched successfully',
        customerId,
        totalCards: response.body?.data?.totalCards ?? 0,
      })

      // Transform to ServiceResponse format
      return {
        code: response.body.code,
        message: response.body.message,
        messageTemplate: createResponseMessage(response.body.message || 'Electronic cards retrieved successfully'),
        data: response.body.data,
        httpStatus: 200,
      }
    } catch (error: unknown) {
      this.logger.error({
        msg: 'Error fetching electronic card list',
        customerId,
        productType,
        error: error instanceof Error ? error.message : String(error),
      })

      return handleError<ElectronicCardListData>(error, { totalCards: 0, cards: [] })
    }
  }

  /**
   * Get customer overview including metrics, engagement, consents, and restrictions
   * GET /api/v1/customers/{customerId}/overview
   *
   * @param customerId - Customer internal ID
   * @returns ServiceResponse with customer overview data (null if not found)
   */
  async getCustomerOverview(customerId: string): Promise<ServiceResponse<CustomerOverviewData | null>> {
    try {
      this.logger.debug({
        msg: 'Fetching customer overview',
        customerId,
      })

      const response = await this.get<ServiceResponse<CustomerOverviewData>>(`api/v1/customers/${customerId}/overview`)

      this.logger.debug({
        msg: 'Customer overview fetched successfully',
        customerId,
        customerType: response.data?.customerType,
      })

      return { ...response, data: response.data ?? null, httpStatus: 200 }
    } catch (error: unknown) {
      this.logger.warn({
        msg: 'Error fetching customer overview',
        customerId,
        error: error instanceof Error ? error.message : String(error),
      })
      return handleError(error, null)
    }
  }

  /**
   * Get Home Loan contract list
   * Uses mock data in development, will call real API in production
   *
   * @param customerKey - Customer identifier (30 digits)
   * @returns Raw StandardResponseDto from customer-service with Home Loan contracts
   */
  async getHomeLoanContractList(customerKey: string): Promise<HomeLoanContractListResponse> {
    try {
      this.logger.debug({
        msg: 'Fetching Home Loan contract list',
        customerKey,
      })

      // DEVELOPMENT MOCK: Return hardcoded data for testing
      // NOTE: Mock data for development - replace with real API call when customer-service endpoint is ready
      if (customerKey === '001400000000000000000023844547') {
        const mockResponse: HomeLoanContractListResponse = {
          statusCode: '200',
          success: true,
          message: 'Success (from development mock)',
          body: {
            data: {
              totalRecord: 2,
              contractList: [
                {
                  accountNumber: '47890240906',
                  status: 'ACTIVE',
                  accountName: 'TONGTONG BANNKORKA',
                },
                {
                  accountNumber: '47890240907',
                  status: 'CLOSED',
                  accountName: 'Home Loan Account 2',
                },
              ],
            },
          },
        }

        this.logger.debug({
          msg: 'Home Loan contract list fetched successfully (from development mock)',
          customerKey,
          totalRecord: 2,
        })

        return mockResponse
      }

      // For other customer keys, return empty result
      this.logger.debug({
        msg: 'No Home Loan contracts found for this customer',
        customerKey,
      })

      return {
        statusCode: '200',
        success: true,
        message: 'Success',
        body: {
          data: {
            totalRecord: 0,
            contractList: [],
          },
        },
      }
    } catch (error: unknown) {
      this.logger.error({
        msg: 'Error fetching Home Loan contract list',
        customerKey,
        error: error instanceof Error ? error.message : String(error),
      })

      // Return error response in StandardResponseDto format
      return {
        statusCode: '500',
        success: false,
        message: error instanceof Error ? error.message : 'Failed to fetch Home Loan contract list',
        body: {
          data: {
            totalRecord: 0,
            contractList: [],
          },
        },
      }
    }
  }

  /**
   * Get customer header information including basic details and contact info
   * GET /api/v1/customers/{id}/header
   * Supports both Individual and Juristic customer types
   *
   * @param id - Customer ID (supports both Individual and Juristic)
   * @returns ServiceResponse with customer header data (null if not found)
   */
  async getCustomerHeader(id: string): Promise<ServiceResponse<CustomerHeaderData | null>> {
    try {
      this.logger.debug({
        msg: 'Fetching customer header',
        customerId: id,
      })

      const response = await this.get<ServiceResponse<CustomerHeaderData>>(`api/v1/customers/${id}/header`)

      this.logger.debug({
        msg: 'Customer header fetched successfully',
        customerId: id,
        hasData: response.data !== null && response.data !== undefined,
      })

      return { ...response, data: response.data ?? null, httpStatus: 200 }
    } catch (error: unknown) {
      this.logger.error({
        msg: 'Error fetching customer header',
        customerId: id,
        error: error instanceof Error ? error.message : String(error),
      })
      return handleError(error, null)
    }
  }

  /**
   * Get customer RM ID by customer ID
   * GET /api/v1/customers/{id}/rmid
   *
   * @param id - Customer ID (UUID)
   * @returns ServiceResponse with RM ID data
   */
  async getCustomerRmId(id: string): Promise<ServiceResponse<{ rmId: string | null } | null>> {
    try {
      this.logger.debug({
        msg: 'Fetching customer RM ID',
        customerId: id,
      })

      const response = await this.get<ServiceResponse<{ rmId: string }>>(`api/v1/customers/${id}/rmid`)

      this.logger.debug({
        msg: 'Customer RM ID fetched successfully',
        customerId: id,
        hasRmId: !!response.data?.rmId,
      })

      return { ...response, data: response.data ?? null, httpStatus: 200 }
    } catch (error: unknown) {
      this.logger.error({
        msg: 'Error fetching customer RM ID',
        customerId: id,
        error: error instanceof Error ? error.message : String(error),
      })
      return handleError(error, null)
    }
  }
  /**
   * Get customer owner details
   * GET /api/v1/customers/{id}/customer-owner
   *
   * @param id - Customer ID (UUID)
   * @returns ServiceResponse with customer owner data (null if not found)
   */
  async getCustomerOwner(id: string): Promise<ServiceResponse<CustomerOwnerData | null>> {
    try {
      this.logger.debug({
        msg: 'Fetching customer owner',
        customerId: id,
      })

      const response = await this.get<ServiceResponse<CustomerOwnerData>>(`api/v1/customers/${id}/customer-owner`)

      this.logger.debug({
        msg: 'Customer owner fetched successfully',
        customerId: id,
        hasData: response.data !== null && response.data !== undefined,
      })

      return { ...response, data: response.data ?? null, httpStatus: 200 }
    } catch (error: unknown) {
      this.logger.error({
        msg: 'Error fetching customer owner',
        customerId: id,
        error: error instanceof Error ? error.message : String(error),
      })
      return handleError(error, null)
    }
  }

  /**
   * Get customer responsible RM details matrix
   * GET /api/v1/customers/{id}/responsible-rm
   *
   * Returns a fixed-order list of 8 responsible party roles:
   * - CUSTOMER_OWNER, BRANCH_OWNER, RM_OWNER, CO_RM_OWNER,
   *   BRANCH_MANAGER, SAM, SME_SSME, CORP_RM
   *
   * @param id - Customer ID (UUID)
   * @returns ServiceResponse with responsible RM data (null if not found)
   */
  async getCustomerResponsibleRm(id: string): Promise<ServiceResponse<CustomerResponsibleRmData | null>> {
    try {
      this.logger.debug({
        msg: 'Fetching customer responsible RM',
        customerId: id,
      })

      const response = await this.get<ServiceResponse<CustomerResponsibleRmData>>(
        `api/v1/customers/${id}/responsible-rm`
      )

      this.logger.debug({
        msg: 'Customer responsible RM fetched successfully',
        customerId: id,
        hasData: response.data !== null && response.data !== undefined,
        itemsCount: response.data?.items?.length ?? 0,
      })

      return { ...response, data: response.data ?? null, httpStatus: 200 }
    } catch (error: unknown) {
      this.logger.error({
        msg: 'Error fetching customer responsible RM',
        customerId: id,
        error: error instanceof Error ? error.message : String(error),
      })
      return handleError(error, null)
    }
  }

  /**
   * Get debit card information by card reference number
   * POST /api/v1/product-holding/banking/debitcards
   *
   * @param cardRefNumber - Card reference number (e.g., "557755810000224T")
   * @returns DebitCardInquiryResponse with card details and linked deposit accounts
   */
  async getDebitCardInfo(cardRefNumber: string): Promise<DebitCardInquiryResponse> {
    try {
      this.logger.info({
        msg: 'Requesting debit card information',
        cardRefNumber,
      })

      const response = await this.post<DebitCardInquiryResponse>('api/v1/product-holding/banking/debitcards', {
        body: { cardRefNumber },
      })

      this.logger.info({
        msg: 'Debit card information retrieved successfully',
        cardRefNumber,
        totalRecord: response.body?.data?.totalRecord ?? 0,
      })

      return response
    } catch (error: unknown) {
      this.logger.error({
        msg: 'Error fetching debit card information',
        cardRefNumber,
        error: error instanceof Error ? error.message : String(error),
      })

      // Return error response
      return {
        statusCode: 'GEN-E00006',
        success: false,
        message: error instanceof Error ? error.message : 'Failed to fetch debit card information',
        body: {
          data: {
            totalRecord: 0,
            debitcards: [],
          },
        },
      }
    }
  }

  /**
   * Bulk account inquiry - Get detailed banking account information
   * POST /api/v1/product-holding/banking/bulk-account-inquiry
   *
   * Backend expects: List<BulkAccountInquiryRequest> (JSON array directly as root element)
   * IMPORTANT: Must send raw array, not wrapped in {body: ...}
   *
   * @param accounts - Array of account inquiry inputs
   * @param includeMiscellaneousMessage - Flag to include miscellaneous message (default: false)
   * @returns BulkAccountInquiryResponse with detailed account information
   */
  async bulkAccountInquiry(
    accounts: BulkAccountInquiryInput[],
    includeMiscellaneousMessage = false
  ): Promise<BulkAccountInquiryResponse> {
    try {
      this.logger.info({
        msg: 'Requesting bulk account inquiry',
        accountCount: accounts.length,
        includeMiscellaneousMessage,
        requestBody: accounts,
      })

      // Spring Boot expects raw JSON array: [...] with query parameter
      const response = await this.post<BulkAccountInquiryResponse>(
        'api/v1/product-holding/banking/bulk-account-inquiry',
        {
          body: accounts, // Send array directly
          params: {
            includeMiscellaneousMessage: String(includeMiscellaneousMessage),
          },
        }
      )

      this.logger.info({
        msg: 'Bulk account inquiry completed successfully',
        accountCount: accounts.length,
        includeMiscellaneousMessage,
        totalRecord: response.body?.data?.totalRecord ?? 0,
      })

      return response
    } catch (error: unknown) {
      this.logger.error({
        msg: 'Error performing bulk account inquiry',
        accountCount: accounts.length,
        includeMiscellaneousMessage,
        error: error instanceof Error ? error.message : String(error),
      })

      // Return error response
      return {
        statusCode: 'GEN-E00006',
        success: false,
        message: error instanceof Error ? error.message : 'Failed to perform bulk account inquiry',
        body: {
          data: {
            totalRecord: 0,
            deposit: [],
          },
        },
      }
    }
  }
  /**
   *
   * Get customer privilege details
   * GET /api/v1/customers/{customerId}/privilege-detail
   */
  async getCustomerPrivilegeDetail(customerId: string): Promise<ServiceResponse<PrivilegeItem[]>> {
    const emptyData: PrivilegeItem[] = []
    try {
      this.logger.info({ msg: 'Fetching customer privilege detail', customerId })

      const response = await this.get<ServiceResponse<PrivilegeItem[]>>(
        `api/v1/customers/${customerId}/privilege-detail`
      )

      this.logger.info({
        msg: 'Customer privilege detail fetched successfully',
        customerId,
        count: response.data?.length ?? 0,
      })

      return { ...response, data: response.data ?? emptyData, httpStatus: 200 }
    } catch (error: unknown) {
      this.logger.error({
        msg: 'Error fetching customer privilege detail',
        customerId,
        error: error instanceof Error ? error.message : String(error),
      })
      return handleError(error, emptyData)
    }
  }

  /**
   *
   * Get customer business specific information
   * GET /api/v1/customers/{id}/business-specific
   *
   * @param id - Customer ID (UUID)
   * @returns ServiceResponse with customer business specific information data (null if not found)
   */
  async getCustomerBusinessSpecificInformation(
    id: string
  ): Promise<ServiceResponse<CustomerBusinessSpecificInformationData | null>> {
    try {
      this.logger.info({
        msg: 'Fetching customer business specific information',
        customerId: id,
      })

      const response = await this.get<ServiceResponse<CustomerBusinessSpecificInformationData>>(
        `api/v1/customers/${id}/business-specific`
      )

      this.logger.info({
        msg: 'Customer business specific information fetched successfully',
        customerId: id,
      })

      return {
        ...response,
        data: response.data ?? null,
        httpStatus: 200,
      }
    } catch (error: unknown) {
      this.logger.error({
        msg: 'Error fetching customer business specific information',
        customerId: id,
        error: error instanceof Error ? error.message : String(error),
      })
      return handleError(error, null)
    }
  }

  async getGeneralInfo(customerId: string): Promise<ServiceResponse<GeneralInfoResponse | null>> {
    try {
      this.logger.info({ msg: 'Fetching customer general info', customerId })

      const response = await this.get<ServiceResponse<GeneralInfoResponse>>(
        `api/v1/customers/${customerId}/general-info`
      )

      this.logger.info({
        msg: 'Customer general info fetched successfully',
        customerId,
      })

      return { ...response, data: response.data ?? null, httpStatus: 200 }
    } catch (error: unknown) {
      this.logger.error({
        msg: 'Error fetching customer general info',
        customerId,
        error: error instanceof Error ? error.message : String(error),
      })
      return handleError(error, null)
    }
  } /**
   * Get Auto Finance account list for a customer
   *
   * POST /api/v1/produc-holding/customer/auto-finance/account-list
   *
   * @param customerKey - Customer key
   * @param productType - Product type (e.g., "AF" for Auto Finance)
   * @returns ServiceResponse with auto finance account list data
   */

  private async fetchAutoFinanceAccountList(url: string, customerKey: string, productType: string): Promise<Response> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000)

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customerKey,
          productType,
        }),
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      return response
    } catch (fetchError: unknown) {
      clearTimeout(timeoutId)
      this.logger.error({
        msg: 'Fetch failed to customer-service',
        url,
        customerKey,
        productType,
        error: fetchError instanceof Error ? fetchError.message : String(fetchError),
        errorName: fetchError instanceof Error ? fetchError.name : 'Unknown',
      })
      throw new Error(
        `Failed to connect to customer-service at ${url}: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`
      )
    }
  }

  private validateAutoFinanceResponse(response: Response, url: string): void {
    if (!response.ok) {
      this.logger.error({
        msg: 'Customer service returned non-OK status',
        status: response.status,
        statusText: response.statusText,
        url,
      })
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
  }

  private validateCustomerServiceData(customerServiceData: {
    statusCode: string
    success: boolean
    message: string
  }): void {
    if (customerServiceData.statusCode !== '200' && !customerServiceData.success) {
      this.logger.error({
        msg: 'Customer service returned error response',
        statusCode: customerServiceData.statusCode,
        message: customerServiceData.message,
      })
      throw new Error(`Customer Service Error: ${customerServiceData.message}`)
    }
  }

  private transformToServiceResponse(customerServiceData: {
    statusCode: string
    success: boolean
    message: string
    body: { data: Record<string, unknown> }
  }): ServiceResponse<Record<string, unknown>> {
    return {
      code: customerServiceData.statusCode,
      message: customerServiceData.message,
      messageTemplate: {
        title: customerServiceData.success ? 'Success' : 'Error',
        header: customerServiceData.message,
        body: customerServiceData.message,
      },
      data: customerServiceData.body?.data ?? {},
      httpStatus: Number.parseInt(customerServiceData.statusCode, 10),
    }
  }

  async getAutoFinanceAccountList(
    customerKey: string,
    productType: string
  ): Promise<ServiceResponse<Record<string, unknown>>> {
    const url = `${this.baseURL}/api/v1/product-holding/auto-finance/account-list`

    this.logger.info({
      msg: 'Fetching Auto Finance Account List',
      customerKey,
      productType,
      baseURL: this.baseURL,
      url,
    })

    try {
      const response = await this.fetchAutoFinanceAccountList(url, customerKey, productType)
      this.validateAutoFinanceResponse(response, url)

      const customerServiceData = (await response.json()) as {
        statusCode: string
        success: boolean
        message: string
        body: { data: Record<string, unknown> }
      }

      this.validateCustomerServiceData(customerServiceData)

      this.logger.info({
        msg: 'Auto finance account list fetched successfully',
        customerKey,
        productType,
        statusCode: customerServiceData.statusCode,
        totalRecords: (customerServiceData.body?.data as { totalRecord?: number })?.totalRecord ?? 0,
      })

      return this.transformToServiceResponse(customerServiceData)
    } catch (error: unknown) {
      this.logger.error({
        msg: 'Error in getAutoFinanceAccountList',
        customerKey,
        productType,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
      throw error
    }
  }
  /**
   * Get account long-term sub-deposits
   * POST /v1/accounts/deposits/{accountNumber}/longtermSubDeposits
   *
   * @param accountNumber - Account number
   * @returns ServiceResponse with long-term sub-deposit details
   *
   * NOTE: This is currently mocked. Replace with actual API call when backend is ready.
   */
  async getAccountLongtermSubDeposits(accountNumber: string): Promise<ServiceResponse<AccountLongtermSubDepositsData>> {
    try {
      this.logger.debug({
        msg: 'Fetching account long-term sub-deposits',
        accountNumber,
        endpoint: `api/v1/product-holding/banking/accounts/${accountNumber}/longterm-sub-deposits`,
      })

      // Call Customer Service endpoint (returns StandardResponseDto format)
      const response = await this.get<{
        statusCode: string
        success: boolean
        message: string
        body: { data: AccountLongtermSubDepositsData }
      }>(`api/v1/product-holding/banking/accounts/${accountNumber}/longterm-sub-deposits`, {
        params: {
          accountCurrency: '764', // THB
        },
      })

      this.logger.info({
        msg: 'Account long-term sub-deposits fetched',
        accountNumber,
        statusCode: response.statusCode,
        hasData: !!response.body?.data,
      })

      // Transform StandardResponseDto to ServiceResponse format
      const serviceResponse: ServiceResponse<AccountLongtermSubDepositsData> = {
        code: response.success ? 'SUCCESS' : 'ERROR',
        message: response.message || 'Account long-term sub-deposits retrieved',
        messageTemplate: createResponseMessage(response.message || 'Account long-term sub-deposits retrieved'),
        data:
          response.body?.data ||
          ({
            accountNumber,
          } as AccountLongtermSubDepositsData),
        httpStatus: Number.parseInt(response.statusCode) || 200,
      }

      return serviceResponse
    } catch (error: unknown) {
      this.logger.error({
        msg: 'Error fetching account long-term sub-deposits',
        accountNumber,
        error: error instanceof Error ? error.message : String(error),
      })
      return handleError(error, {
        accountNumber,
      } as AccountLongtermSubDepositsData)
    }
  }

  /**
   * Get hold amount details for a specific account
   * POST /api/v1/product-holding/banking/hold-amount-details
   *
   * @param accountNumber - Account number (10 digits)
   * @returns ServiceResponse with hold amount details
   */
  /**
   * Get misc message details for a specific account
   * POST /api/v1/product-holding/banking/accounts/misc-message-detail
   *
   * @param accountNumber - Account number (10 digits)
   * @returns ServiceResponse with misc message details
   */
  async getMiscMessageDetails(accountNumber: string): Promise<ServiceResponse<Record<string, unknown>>> {
    const endpoint = 'api/v1/product-holding/banking/accounts/misc-message-detail'

    this.logger.info({
      msg: 'Fetching misc message details',
      accountNumber,
      baseURL: this.baseURL,
      endpoint,
    })

    try {
      // Use this.post() to automatically include auth headers (role-id, user-id, staff-id)
      const response = await this.post<any>(endpoint, {
        body: { accountNumber },
      })

      this.logger.debug({
        msg: 'Raw response from customer service',
        accountNumber,
        responseKeys: Object.keys(response || {}),
        hasBody: !!response?.body,
        hasData: !!response?.data,
        hasStatusCode: !!response?.statusCode,
      })

      // Handle different response structures from Apollo RESTDataSource
      let customerServiceData: any
      if (response?.body?.data) {
        // Standard wrapped response
        customerServiceData = response
      } else if (response?.data) {
        // Already unwrapped by Apollo
        customerServiceData = { body: { data: response.data }, statusCode: '200', message: 'Success' }
      } else {
        // Fallback: treat response as the data itself
        customerServiceData = { body: { data: response }, statusCode: '200', message: 'Success' }
      }

      this.logger.debug({
        msg: 'Received misc message details from customer service',
        accountNumber,
        statusCode: customerServiceData.statusCode,
        dataLength: customerServiceData.body?.data?.length || 0,
      })

      // Map customer-service response to standard ServiceResponse format
      return {
        code: customerServiceData.statusCode || '200',
        message: customerServiceData.message || 'Success',
        messageTemplate: { body: customerServiceData.message || 'Misc message details retrieved successfully' },
        data: {
          accountNumber,
          totalRecords: customerServiceData.body?.data?.length || 0,
          data: customerServiceData.body?.data || [],
        },
        httpStatus: Number.parseInt(customerServiceData.statusCode, 10) || 200,
      }
    } catch (error: unknown) {
      this.logger.error({
        msg: 'Error in getMiscMessageDetails',
        accountNumber,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
      throw error
    }
  }

  async getHoldAmountDetails(accountNumber: string): Promise<ServiceResponse<Record<string, unknown>>> {
    const url = `${this.baseURL}/api/v1/product-holding/banking/hold-amount-details`

    this.logger.info({
      msg: 'Fetching hold amount details',
      accountNumber,
      baseURL: this.baseURL,
      url,
    })

    try {
      // Create AbortController for timeout (30 seconds)
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000)

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ accountNumber }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        this.logger.error({
          msg: 'Customer service returned non-OK response for hold amount details',
          accountNumber,
          status: response.status,
          statusText: response.statusText,
        })
        throw new Error(`Customer service error: ${response.status} ${response.statusText}`)
      }

      const customerServiceData = (await response.json()) as any

      this.logger.debug({
        msg: 'Received hold amount details from customer service',
        accountNumber,
        statusCode: customerServiceData.statusCode,
        success: customerServiceData.success,
      })

      // Map customer-service response to standard ServiceResponse format
      return {
        code: customerServiceData.statusCode || '200',
        message: customerServiceData.message || 'Success',
        messageTemplate: { body: customerServiceData.message || 'Hold amount details retrieved successfully' },
        data: customerServiceData.body?.data ?? {},
        httpStatus: Number.parseInt(customerServiceData.statusCode, 10),
      }
    } catch (error: unknown) {
      this.logger.error({
        msg: 'Error in getHoldAmountDetails',
        accountNumber,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
      throw error
    }
  }

  /**
   * Get banking notification details
   * POST /api/v1/product-holding/banking/notification
   *
   * Retrieves notification settings including registration info, alert destinations, and alert profiles
   *
   * @param input - Banking notification input parameters
   * @returns ServiceResponse with notification data
   */
  async getBankingNotification(input: BankingNotificationInput): Promise<ServiceResponse<Record<string, unknown>>> {
    const endpoint = 'api/v1/product-holding/banking/notification'

    this.logger.info({
      msg: 'Fetching banking notification',
      customerRefNumber: input.customerRefNumber,
      productType: input.productType,
      productNumber: input.productNumber,
      baseURL: this.baseURL,
      endpoint,
    })

    try {
      // Use this.post() to automatically include auth headers (role-id, user-id, staff-id)
      const response = await this.post<any>(endpoint, {
        body: {
          customerRefNumber: input.customerRefNumber,
          productType: input.productType,
          productNumber: input.productNumber,
        },
      })

      this.logger.debug({
        msg: 'Raw response from customer service',
        customerRefNumber: input.customerRefNumber,
        responseKeys: Object.keys(response || {}),
        hasBody: !!response?.body,
        hasData: !!response?.data,
        hasStatusCode: !!response?.statusCode,
      })

      // Handle different response structures from Apollo RESTDataSource
      let customerServiceData: any
      if (response?.body?.data !== undefined) {
        // Standard wrapped response
        customerServiceData = response
      } else if (response?.data) {
        // Already unwrapped by Apollo
        customerServiceData = { body: { data: response.data }, statusCode: '200', message: 'Success' }
      } else {
        // Fallback: treat response as the data itself
        customerServiceData = { body: { data: response }, statusCode: '200', message: 'Success' }
      }

      this.logger.debug({
        msg: 'Received banking notification from customer service',
        customerRefNumber: input.customerRefNumber,
        productType: input.productType,
        productNumber: input.productNumber,
        statusCode: customerServiceData.statusCode,
        hasData: !!customerServiceData.body?.data,
      })

      // Map customer-service response to standard ServiceResponse format
      return {
        code: customerServiceData.statusCode || '200',
        message: customerServiceData.message || 'Success',
        messageTemplate: { body: customerServiceData.message || 'Account notification retrieved successfully' },
        data: customerServiceData.body?.data ?? {},
        httpStatus: Number.parseInt(customerServiceData.statusCode, 10) || 200,
      }
    } catch (error: unknown) {
      this.logger.error({
        msg: 'Error in getBankingNotification',
        customerRefNumber: input.customerRefNumber,
        productType: input.productType,
        productNumber: input.productNumber,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
      throw error
    }
  }

  /**
   * Get comprehensive account detail (orchestrated endpoint)
   * POST /api/v1/product-holding/banking/account-detail
   *
   * This endpoint internally calls bulkAccountInquiry and conditionally calls longtermSubDeposits,
   * returning aggregated data with 21 fields.
   *
   * @param accountNumber - Account number
   * @param customerKey - Customer key (RM ID) for dynamic currency lookup
   * @param applicationId - Application ID (ST, IM, EC) - defaults to "ST" if not provided
   * @returns ServiceResponse with comprehensive account detail (21 fields)
   */
  async getAccountDetail(
    accountNumber: string,
    customerKey: string,
    applicationId: string = 'ST'
  ): Promise<ServiceResponse<AccountDetailData>> {
    try {
      this.logger.info({
        msg: 'Fetching comprehensive account detail',
        accountNumber,
        applicationId,
        customerKey,
        endpoint: 'api/v1/product-holding/banking/account-detail',
      })

      // Call Customer Service orchestrated endpoint
      const response = await this.post<{
        statusCode: string
        success: boolean
        message: string
        body: {
          data: AccountDetailData
        }
      }>('api/v1/product-holding/banking/account-detail', {
        body: {
          accountNumber,
          applicationId,
          customerKey, // NEW: Send customerKey to backend
        },
      })

      this.logger.info({
        msg: 'Account detail fetched successfully',
        accountNumber,
        statusCode: response.statusCode,
        accountType: response.body?.data?.bulkAccountInquiry?.accountType,
      })

      // Follow auto-finance pattern: propagate backend business code as ServiceResponse.code
      // so transformServiceResponse / mapToResponseCode can expose it as GraphQL subCode.

      // Check if it's a success response (response.success OR GEN-S success codes)
      // GEN-S00002 (No data) should be treated as success (HTTP 200), not error
      const isSuccess = response.success || response.statusCode?.startsWith('GEN-S')

      if (isSuccess) {
        // Propagate backend statusCode and message as-is (no message mapping)
        // Backend controls the message content per standard pattern
        return {
          code: response.statusCode || DEFAULT_SUB_CODE_SUCCESS,
          message: response.message || 'Account detail retrieved successfully',
          messageTemplate: createResponseMessage(response.message || 'Account detail retrieved successfully'),
          data: (response.body?.data ?? null) as AccountDetailData,
          httpStatus: 200,
        }
      }

      const backendCode = response.statusCode || 'GEN-E00013'
      const message = response.message || 'Information not available'
      return {
        code: backendCode,
        message,
        messageTemplate: createResponseMessage(message),
        data: (response.body?.data ?? null) as AccountDetailData,
        // Non-numeric statusCode (e.g. GEN-E00013) → treat as business error (400)
        httpStatus: Number.parseInt(response.statusCode, 10) || 400,
      }
    } catch (error: unknown) {
      this.logger.error({
        msg: 'Error fetching account detail',
        accountNumber,
        error: error instanceof Error ? error.message : String(error),
      })
      return handleError(error, {} as AccountDetailData)
    }
  }

  /**
   * Get customer account list by customer key and product type
   * - BK: POST /api/v1/product-holding/banking/account-list (autoMap Response)
   * - AF: POST /api/v1/product-holding/auto-finance/account-list (legacy StandardResponseDto)
   *
   * Same pattern as getCustomerHeader: returns ServiceResponse for transformServiceResponse.
   *
   * @param customerKey - Customer key identifier
   * @param productType - Product type ('BK' for Banking, 'AF' for Auto Finance)
   * @returns ServiceResponse with account list data
   */
  async getCustomerAccountList(
    customerKey: string,
    productType: string
  ): Promise<ServiceResponse<AccountListDataData | null>> {
    const emptyData: AccountListDataData = { totalRecord: 0, accountRelation: [] }

    try {
      let endpoint: string
      if (productType === 'BK') {
        endpoint = 'api/v1/product-holding/banking/account-list'
      } else if (productType === 'AF') {
        endpoint = 'api/v1/product-holding/auto-finance/account-list'
      } else {
        throw new Error(`Invalid productType: ${productType}. Must be 'BK' or 'AF'`)
      }

      this.logger.info({
        msg: 'Fetching customer account list',
        customerKey,
        productType,
        baseURL: this.baseURL,
        endpoint,
        fullURL: `${this.baseURL}/${endpoint}`,
      })

      // BK: autoMap { code, message, data }; AF: legacy { statusCode, body.data }
      const response = await this.post<BankingAccountListBackendResponse>(endpoint, {
        body: { customerKey },
      })

      const rawData = response?.data ?? response?.body?.data
      let accountRelation = (rawData?.accountRelation ?? []) as AccountRelationData[]
      const originalCount = accountRelation.length

      if (productType === 'BK') {
        accountRelation = filterBankingAccountRelations(accountRelation as AccountRelation[]) as AccountRelationData[]
        this.logger.info({
          msg: 'Filtered BK accounts to include only ST and IM applicationCodes',
          customerKey,
          originalCount,
          filteredCount: accountRelation.length,
          removedCount: originalCount - accountRelation.length,
        })
      }

      const data: AccountListDataData = {
        totalRecord: accountRelation.length,
        accountRelation,
      }

      const code = response?.code ?? response?.statusCode ?? DEFAULT_SUB_CODE_SUCCESS
      const message =
        response?.messageTemplate?.body ?? response?.message ?? 'Customer account list retrieved successfully'
      // Prefer backend messageTemplate (nulls for unused fields) like getCustomerHeader;
      // only synthesize when backend did not provide one (e.g. AF legacy).
      // body is required on ResponseMessage; keep other fields as backend sent them (null/string).
      const messageTemplate = response?.messageTemplate
        ? {
            title: response.messageTemplate.title ?? null,
            header: response.messageTemplate.header ?? null,
            body: response.messageTemplate.body ?? message,
            actionButton: response.messageTemplate.actionButton ?? null,
            cancelButton: response.messageTemplate.cancelButton ?? null,
          }
        : createResponseMessage(message)

      this.logger.info({
        msg: 'Customer account list fetched successfully',
        customerKey,
        productType,
        code,
        totalAccounts: data.totalRecord,
      })

      // Same pattern as getCustomerHeader: ServiceResponse + httpStatus 200 on success path
      return {
        code,
        message,
        messageTemplate,
        data,
        httpStatus: 200,
      }
    } catch (error: unknown) {
      this.logger.error({
        msg: 'Error fetching customer account list',
        customerKey,
        productType,
        baseURL: this.baseURL,
        error: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        errorType: error?.constructor?.name,
      })
      return handleError(error, emptyData)
    }
  }

  /**
   * Get FRC (Foreign Remittance Certificate) inquiry
   * POST /api/v1/product-holding/banking/frc-inquiry
   *
   * @param input - FRC inquiry input with account number and optional date filters
   * @returns ServiceResponse with FRC transaction data
   */
  async getFrcInquiry(input: FrcInquiryInput): Promise<ServiceResponse<FrcInquiryData>> {
    try {
      const endpoint = 'api/v1/product-holding/banking/frc-inquiry'

      this.logger.info({
        msg: 'Fetching FRC inquiry data from customer-service',
        accountNumber: input.accountNumber,
        hasStartTranDate: !!input.startTranDate,
        hasEndTranDate: !!input.endTranDate,
        hasStartPaidDate: !!input.startPaidDate,
        hasEndPaidDate: !!input.endPaidDate,
        baseURL: this.baseURL,
        endpoint,
      })

      // Build request body - only include fields that have values
      const requestBody: {
        accountNumber: string
        startTranDate?: string
        endTranDate?: string
        startPaidDate?: string
        endPaidDate?: string
      } = {
        accountNumber: input.accountNumber,
      }

      if (input.startTranDate) {
        requestBody.startTranDate = input.startTranDate
      }
      if (input.endTranDate) {
        requestBody.endTranDate = input.endTranDate
      }
      if (input.startPaidDate) {
        requestBody.startPaidDate = input.startPaidDate
      }
      if (input.endPaidDate) {
        requestBody.endPaidDate = input.endPaidDate
      }

      const response = await this.post<{
        statusCode: string
        success: boolean
        message: string
        body: {
          data: FrcInquiryData
        }
      }>(endpoint, {
        body: requestBody,
      })

      this.logger.info({
        msg: 'FRC inquiry data fetched successfully',
        accountNumber: input.accountNumber,
        statusCode: response.statusCode,
        totalRecord: response.body?.data?.totalRecord ?? 0,
      })

      // Transform to ServiceResponse format
      const serviceResponse: ServiceResponse<FrcInquiryData> = {
        code: response.success ? 'SUCCESS' : 'ERROR',
        message: response.message || 'FRC inquiry data retrieved successfully',
        messageTemplate: createResponseMessage(response.message || 'FRC inquiry data retrieved successfully'),
        data: response.body?.data || { items: [], totalRecord: 0 },
        httpStatus: Number.parseInt(response.statusCode) || 200,
      }

      return serviceResponse
    } catch (error: unknown) {
      this.logger.error({
        msg: 'Error fetching FRC inquiry data',
        accountNumber: input.accountNumber,
        error: error instanceof Error ? error.message : String(error),
      })
      return handleError(error, { items: [], totalRecord: 0 })
    }
  }

  /**
   * Get Account Transaction Detail
   * POST /api/v1/product-holding/banking/account-transaction-detail
   *
   * Retrieves account transaction history with statement records.
   * Calls Account Statement API to retrieve transaction history.
   *
   * @param accountNumber - Account number (required)
   * @param accountCurrency - Account currency code (optional, defaults to "764")
   * @param accountType - Account type code: "0"=Longterm, "1"=Fix, "2"=Saving, "3"=Current (optional, backend defaults to "C")
   * @param pagingLimit - Paging limit (optional, defaults to 40)
   * @param transactionDateFrom - Transaction start date (optional, defaults to 3 months ago)
   * @param transactionDateTo - Transaction end date (optional, defaults to today)
   * @returns Service response with account transaction detail
   */
  private buildAccountTransactionRequestBody(
    accountNumber: string,
    accountCurrency?: string | null,
    accountType?: string | null,
    pagingLimit?: number | null,
    transactionDateFrom?: string | null,
    transactionDateTo?: string | null
  ): Record<string, unknown> {
    const requestBody: Record<string, unknown> = {
      accountNumber,
    }

    // Add optional fields only if they have values
    const optionalFields = {
      accountCurrency,
      accountType,
      pagingLimit,
      transactionDateFrom,
      transactionDateTo,
    }

    Object.entries(optionalFields).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        requestBody[key] = value
      }
    })

    return requestBody
  }

  async getAccountTransactionDetail(
    accountNumber: string,
    accountCurrency?: string | null,
    accountType?: string | null,
    pagingLimit?: number | null,
    transactionDateFrom?: string | null,
    transactionDateTo?: string | null
  ): Promise<ServiceResponse<any>> {
    try {
      const endpoint = 'api/v1/product-holding/banking/account-transaction-detail'

      this.logger.info({
        msg: 'Fetching account transaction detail',
        accountNumber,
        accountCurrency,
        accountType,
        pagingLimit,
        transactionDateFrom,
        transactionDateTo,
        baseURL: this.baseURL,
        endpoint,
        fullURL: `${this.baseURL}/${endpoint}`,
      })

      const requestBody = this.buildAccountTransactionRequestBody(
        accountNumber,
        accountCurrency,
        accountType,
        pagingLimit,
        transactionDateFrom,
        transactionDateTo
      )

      const response = await this.post<any>(endpoint, {
        body: requestBody,
      })

      this.logger.info({
        msg: 'Account transaction detail fetched successfully',
        accountNumber,
        totalRecords: response.body?.data?.totalRecords ?? 0,
      })

      // Transform StandardResponseDto to ServiceResponse format
      const serviceResponse: ServiceResponse<any> = {
        code: response.success ? 'SUCCESS' : 'ERROR',
        message: response.message || 'Account transaction detail retrieved successfully',
        messageTemplate: createResponseMessage(response.message || 'Account transaction detail retrieved successfully'),
        data: response.body?.data || {},
        httpStatus: Number.parseInt(response.statusCode) || 200,
      }

      return serviceResponse
    } catch (error: unknown) {
      this.logger.error({
        msg: 'Error fetching account transaction detail',
        accountNumber,
        baseURL: this.baseURL,
        error: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        errorType: error?.constructor?.name,
      })

      // Rethrow the error to let GraphQL handle it
      throw error
    }
  }

  /**
   * Get Fixed Sub Deposits Inquiry
   * POST /api/v1/product-holding/banking/fixed-sub-deposits-inquiry
   *
   * Query fixed deposit account with sub-deposits information.
   * Returns selected fields only: depositNumber, depositDate, maturityDate, balanceAmount, subDepositHoldAmount, remainingBalanceAmount
   *
   * @param input - Fixed sub deposits inquiry input
   * @returns ServiceResponse with fixed sub deposits data
   */
  async getFixedSubDepositsInquiry(
    input: FixedSubDepositsInquiryInput
  ): Promise<ServiceResponse<FixedSubDepositsInquiryData>> {
    try {
      const endpoint = 'api/v1/product-holding/banking/fixed-sub-deposits-inquiry'

      this.logger.info({
        msg: 'Fetching fixed sub deposits inquiry from customer-service',
        accountNumber: input.accountNumber,
        hasRequestCode: !!input.requestCode,
        hasOverrideFlag: !!input.overrideFlag,
        baseURL: this.baseURL,
        endpoint,
      })

      // Build request body
      const requestBody: {
        accountNumber: string
        requestCode?: string
        overrideFlag?: string
      } = {
        accountNumber: input.accountNumber,
      }

      if (input.requestCode) {
        requestBody.requestCode = input.requestCode
      }
      if (input.overrideFlag) {
        requestBody.overrideFlag = input.overrideFlag
      }

      // customer-service StandardResponse: { code, message, data: { subDeposits }, httpStatus }
      // Also support legacy raw shape: { subDeposits } (pre-StandardResponse deploy)
      type SubDepositRaw = {
        depositNumber?: string
        depositDate?: string
        maturityDate?: string
        balanceAmount?: number
        subDepositHoldAmount?: number
        remainingBalanceAmount?: number
      }
      const response = await this.post<{
        code?: string
        message?: string
        httpStatus?: number
        data?: { subDeposits?: SubDepositRaw[] } | SubDepositRaw[]
        subDeposits?: SubDepositRaw[]
      }>(endpoint, {
        body: requestBody,
      })

      // Propagate business code from customer-service as ServiceResponse.code → GraphQL subCode
      const backendCode = response.code || DEFAULT_SUB_CODE_SUCCESS
      const message = response.message || 'Fixed sub deposits inquiry retrieved successfully'

      // Resolve subDeposits from multiple response shapes
      let rawSubDeposits: SubDepositRaw[] = []
      if (Array.isArray(response.data)) {
        rawSubDeposits = response.data
      } else if (response.data && Array.isArray(response.data.subDeposits)) {
        rawSubDeposits = response.data.subDeposits
      } else if (Array.isArray(response.subDeposits)) {
        rawSubDeposits = response.subDeposits
      }

      this.logger.info({
        msg: 'Fixed sub deposits inquiry fetched successfully',
        accountNumber: input.accountNumber,
        totalSubDeposits: rawSubDeposits.length,
        code: backendCode,
        responseKeys: Object.keys(response || {}),
      })

      const subDeposits: SubDepositItem[] = rawSubDeposits.map((item) => ({
        depositNumber: item.depositNumber || '',
        depositDate: item.depositDate || '',
        maturityDate: item.maturityDate || '',
        balanceAmount: item.balanceAmount ?? 0,
        subDepositHoldAmount: item.subDepositHoldAmount ?? 0,
        remainingBalanceAmount: item.remainingBalanceAmount ?? 0,
      }))

      return {
        code: backendCode,
        message,
        messageTemplate: createResponseMessage(message),
        data: {
          subDeposits,
        },
        httpStatus: response.httpStatus ?? 200,
      }
    } catch (error: unknown) {
      this.logger.error({
        msg: 'Error fetching fixed sub deposits inquiry',
        accountNumber: input.accountNumber,
        error: error instanceof Error ? error.message : String(error),
      })
      // handleError extracts body.code from SonicException response (GEN-E00006, etc.)
      return handleError(error, { subDeposits: [] })
    }
  }

  /**
   * Get customer sensitivity data including risk assessment and customer sensitivity flags
   * GET /api/v1/customers/{id}/sensitivity
   *
   * Aggregates data from multiple external APIs:
   * - OEF (Open-ended Fund) System: Risk assessment data
   * - CTMD (Customer Master Data): Customer sensitivity flags
   *
   * @param id - Customer ID (UUID)
   * @returns ServiceResponse with customer sensitivity data (null if not found)
   */
  async getCustomerSensitivity(id: string): Promise<ServiceResponse<CustomerSensitivityData | null>> {
    try {
      this.logger.info({
        msg: 'Fetching customer sensitivity data',
        customerId: id,
      })

      const response = await this.get<ServiceResponse<CustomerSensitivityData>>(`api/v1/customers/${id}/sensitivity`)

      this.logger.info({
        msg: 'Customer sensitivity data fetched successfully',
        customerId: id,
        hasRiskAssessment: response.data?.riskAssessment !== null && response.data?.riskAssessment !== undefined,
        hasCustomerSensitivity:
          response.data?.customerSensitivity !== null && response.data?.customerSensitivity !== undefined,
      })

      return { ...response, data: response.data ?? null, httpStatus: 200 }
    } catch (error: unknown) {
      this.logger.error({
        msg: 'Error fetching customer sensitivity data',
        customerId: id,
        error: error instanceof Error ? error.message : String(error),
      })
      return handleError(error, null)
    }
  }

  /**
   * Get customer business description by customer ID
   * GET /api/v1/customers/{id}/business-description
   *
   * @param id - Customer ID (UUID)
   * @returns ServiceResponse with business description data (null if not found)
   */
  async getCustomerBusinessDescription(id: string): Promise<ServiceResponse<CustomerBusinessDescriptionData | null>> {
    try {
      this.logger.info({
        msg: 'Fetching customer business description',
        customerId: id,
      })

      const response = await this.get<ServiceResponse<CustomerBusinessDescriptionData>>(
        `api/v1/customers/${id}/business-description`
      )

      this.logger.info({
        msg: 'Customer business description fetched successfully',
        customerId: id,
        hasData: response.data !== null && response.data !== undefined,
      })

      return { ...response, data: response.data ?? null, httpStatus: 200 }
    } catch (error: unknown) {
      this.logger.error({
        msg: 'Error fetching customer business description',
        customerId: id,
        error: error instanceof Error ? error.message : String(error),
      })
      return handleError(error, null)
    }
  }

  /**
   * Get customer personal financial behavior by customer ID
   * GET /api/v1/customers/{id}/personal-financial-behavior
   *
   * @param id - Customer ID (UUID)
   * @returns ServiceResponse with customer personal financial behavior data (null if not found)
   */
  async getCustomerPersonalFinancialBehavior(
    id: string
  ): Promise<ServiceResponse<CustomerPersonalFinancialBehaviorData | null>> {
    try {
      this.logger.info({
        msg: 'Fetching customer personal financial behavior',
        customerId: id,
      })

      const response = await this.get<ServiceResponse<CustomerPersonalFinancialBehaviorData>>(
        `api/v1/customers/${id}/personal-financial-behavior`
      )

      this.logger.info({
        msg: 'Customer personal financial behavior fetched successfully',
        customerId: id,
        hasData: response.data !== null && response.data !== undefined,
      })

      return { ...response, data: response.data ?? null, httpStatus: 200 }
    } catch (error: unknown) {
      this.logger.error({
        msg: 'Error fetching customer personal financial behavior',
        customerId: id,
        error: error instanceof Error ? error.message : String(error),
      })
      return handleError(error, null)
    }
  }
  /**
   * Get Mutual Fund Detail
   * POST /api/v1/product-holding/banking/mutual-fund-detail
   *
   * @param accountNumber - Account number (accountUID)
   * @param customerKey - Customer Key (RM ID) to lookup documentType
   * @param fundCode - Fund code (optional - from clicked record)
   * @param fundName - Fund name (optional - from clicked record)
   * @returns ServiceResponse with mutual fund detail data
   */
  async getMutualFundDetail(
    accountNumber: string,
    customerKey: string,
    fundCode?: string,
    fundName?: string
  ): Promise<ServiceResponse<Record<string, unknown>>> {
    const endpoint = 'api/v1/product-holding/banking/mutual-fund-detail'

    this.logger.info({
      msg: 'Fetching mutual fund detail',
      accountNumber,
      customerKey,
      fundCode,
      fundName,
      baseURL: this.baseURL,
      endpoint,
    })

    try {
      // Use this.post() to automatically include auth headers (role-id, user-id, staff-id)
      const response = await this.post<any>(endpoint, {
        body: {
          accountNumber: accountNumber,
          customerKey: customerKey,
          ...(fundCode && { fundCode }),
          ...(fundName && { fundName }),
        },
      })

      this.logger.debug({
        msg: 'Raw response from customer service',
        accountNumber,
        responseKeys: Object.keys(response || {}),
        hasBody: !!response?.body,
        hasData: !!response?.data,
        hasStatusCode: !!response?.statusCode,
      })

      // Handle different response structures from Apollo RESTDataSource
      let customerServiceData: any
      if (response?.body?.data !== undefined) {
        // Standard wrapped response
        customerServiceData = response
      } else if (response?.data) {
        // Already unwrapped by Apollo
        customerServiceData = { body: { data: response.data }, statusCode: '200', message: 'Success' }
      } else {
        // Fallback: treat response as the data itself
        customerServiceData = { body: { data: response }, statusCode: '200', message: 'Success' }
      }

      this.logger.debug({
        msg: 'Received mutual fund detail from customer service',
        accountNumber,
        statusCode: customerServiceData.statusCode,
        hasData: !!customerServiceData.body?.data,
      })

      // Map customer-service response to standard ServiceResponse format
      return {
        code: customerServiceData.statusCode || '200',
        message: customerServiceData.message || 'Success',
        messageTemplate: { body: customerServiceData.message || 'Mutual fund detail retrieved successfully' },
        data: customerServiceData.body?.data || {},
        httpStatus: Number.parseInt(customerServiceData.statusCode, 10) || 200,
      }
    } catch (error: unknown) {
      this.logger.error({
        msg: 'Error in getMutualFundDetail',
        accountNumber,
        customerKey,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
      throw error
    }
  }

  /**
   * Get Auto Finance Details
   * Fetches data from 2 APIs in parallel:
   * 1. POST /api/v1/product-holding/auto-finance/account-detail/hirePurchase
   * 2. POST /api/v1/product-holding/auto-finance/collateral-asset
   *
   * @param accountNumber - Auto finance account number
   * @returns AutoFinanceDetails with combined data from both APIs
   */
  async getAutoFinanceDetails(accountNumber: string): Promise<AutoFinanceDetails> {
    try {
      this.logger.info({
        msg: 'Requesting Auto Finance details from multiple APIs in parallel',
        accountNumber,
      })

      // Call 2 APIs in parallel using Promise.all for performance optimization
      const [hirePurchaseData, collateralAssetData] = await Promise.all([
        // API 1: Hire Purchase Details
        this.post<HirePurchaseResponse>('api/v1/product-holding/auto-finance/account-detail/hirePurchase', {
          body: { accountNumber },
        }),
        // API 2: Collateral Asset
        this.post<CollateralAssetResponse>('api/v1/product-holding/auto-finance/collateral-asset', {
          body: { accountNo: accountNumber },
        }),
      ])

      this.logger.info({
        msg: 'Successfully fetched Auto Finance details from both APIs',
        hirePurchaseSuccess: hirePurchaseData.success,
        collateralAssetSuccess: collateralAssetData.success,
      })

      // Extract data from nested structure
      const hirePurchase = hirePurchaseData?.body?.data || {}
      const collateralAsset = collateralAssetData?.body?.data || {}

      // Combine data from both APIs
      const combinedDetails: AutoFinanceDetails = {
        accountNumber,
        // From Hire Purchase API
        accountStatus: hirePurchase.accountStatus || null,
        accountTypeDescription: hirePurchase.accountType || null,
        productName: hirePurchase.productName || null,
        productId: hirePurchase.productId || null,
        termPayment: hirePurchase.paymentsMadeTotalTerm?.toString() || null,
        termIncreasement: hirePurchase.termIncreasement?.toString() || null,
        // From Collateral Asset API
        registerNumber: collateralAsset.registerNumber || null,
        province: collateralAsset.province || null,
        maker: collateralAsset.maker || null,
        model: collateralAsset.model || null,
        color: collateralAsset.color || null,
      }

      this.logger.debug({
        msg: 'Combined Auto Finance details',
        data: combinedDetails,
      })

      return combinedDetails
    } catch (error: unknown) {
      this.logger.error({
        msg: 'Error fetching Auto Finance details',
        accountNumber,
        error: error instanceof Error ? error.message : String(error),
      })

      // Re-throw error for resolver to handle
      throw error
      // return handleError(error, null)
    }
  }

  /**
   * Upsert customer contact person
   * POST /api/v1/customers/{customerId}/contact-person
   */
  async upsertContactPerson(customerId: string, payload: UpsertContactPersonInput): Promise<ServiceResponse<null>> {
    try {
      this.logger.info({ msg: 'Upserting customer contact person', customerId })

      const response = await this.post<ServiceResponse<null>>(`api/v1/customers/${customerId}/contact-person`, {
        body: payload,
      })

      return { ...response, data: null, httpStatus: response.httpStatus ?? 200 }
    } catch (error: unknown) {
      this.logger.error({
        msg: 'Error upserting customer contact person',
        customerId,
        error: error instanceof Error ? error.message : String(error),
      })
      return handleValidationErrors(error, null)
    }
  }

  /**
   * Delete customer contact person
   * DELETE /api/v1/customers/{customerId}/contact-person/{contactPersonId}
   */
  async deleteContactPerson(customerId: string, contactPersonId: string): Promise<ServiceResponse<null>> {
    try {
      this.logger.info({ msg: 'Deleting customer contact person', customerId, contactPersonId })

      const response = await this.delete<ServiceResponse<null>>(
        `api/v1/customers/${customerId}/contact-person/${contactPersonId}`
      )

      return { ...response, data: null, httpStatus: 200 }
    } catch (error: unknown) {
      this.logger.error({
        msg: 'Error deleting customer contact person',
        customerId,
        contactPersonId,
        error: error instanceof Error ? error.message : String(error),
      })
      return handleError(error, null)
    }
  }

  /**
   * Delete customer team member by record ID
   * DELETE /api/v1/customers/{customerId}/team-member/{teamMemberId}
   */
  async deleteCustomerTeamMember(customerId: string, teamMemberId: string): Promise<ServiceResponse<null>> {
    try {
      this.logger.info({ msg: 'Deleting customer team member', customerId, teamMemberId })

      const response = await this.delete<ServiceResponse<null>>(
        `api/v1/customers/${customerId}/team-member/${teamMemberId}`
      )

      return { ...response, data: null, httpStatus: 200 }
    } catch (error: unknown) {
      this.logger.error({
        msg: 'Error deleting customer team member',
        customerId,
        teamMemberId,
        error: error instanceof Error ? error.message : String(error),
      })
      return handleError(error, null)
    }
  }

  /**
   * Update customer team member role and permission
   * PUT /api/v1/customers/{customerId}/team-member
   */
  async updateCustomerTeamMember(
    customerId: string,
    payload: UpdateCustomerTeamMemberInput
  ): Promise<ServiceResponse<null>> {
    try {
      this.logger.info({
        msg: 'Updating customer team member',
        customerId,
        staffId: payload.staffId,
        roleCode: payload.roleCode,
        permission: payload.permission,
      })

      const response = await this.put<ServiceResponse<null>>(`api/v1/customers/${customerId}/team-member`, {
        body: payload,
      })

      return { ...response, data: null, httpStatus: response.httpStatus ?? 200 }
    } catch (error: unknown) {
      this.logger.error({
        msg: 'Error updating customer team member',
        customerId,
        staffId: payload.staffId,
        error: error instanceof Error ? error.message : String(error),
      })
      return handleValidationErrors(error, null)
    }
  }

  /**
   * Get customer team members by customer ID with pagination
   * GET /api/v1/customers/{id}/team-member
   *
   * @param id - Customer ID (UUID format)
   * @param page - Page number (1-indexed, default: 1)
   * @param size - Page size (default: 10, max: 100)
   * @returns ServiceResponse with paginated team members data (null if not found)
   */
  async getCustomerTeamMembers(
    id: string,
    page?: number,
    size?: number
  ): Promise<ServiceResponse<TeamMemberPagedData | null>> {
    try {
      this.logger.info({ msg: 'Fetching customer team members', customerId: id, page, size })

      const response = await this.get<ServiceResponse<TeamMemberPagedData>>(`api/v1/customers/${id}/team-member`, {
        params: {
          ...(page !== undefined && { page: String(page) }),
          ...(size !== undefined && { size: String(size) }),
        },
      })

      this.logger.info({
        msg: 'Customer team members fetched successfully',
        customerId: id,
        count: response.data?.content?.length ?? 0,
      })

      return { ...response, data: response.data ?? null, httpStatus: 200 }
    } catch (error: unknown) {
      this.logger.error({
        msg: 'Error fetching customer team members',
        customerId: id,
        error: error instanceof Error ? error.message : String(error),
      })
      return handleError(error, null)
    }
  }

  /**
   * Add a new team member to a customer
   * POST /api/v1/customers/{id}/team-member
   *
   * Validates:
   * - Customer exists
   * - User exists in user-management-service
   * - Business rules (user eligibility)
   *
   * Creates team member record and returns combined data from database + user-management-service
   *
   * @param id - Customer ID (UUID)
   * @param input - Team member details (staffId, roleCode, permission)
   * @returns ServiceResponse with created team member data (null if error)
   */
  async addCustomerTeamMember(
    id: string,
    input: AddCustomerTeamMemberInput
  ): Promise<ServiceResponse<TeamMember | null>> {
    try {
      this.logger.info({
        msg: 'Adding customer team member',
        customerId: id,
        staffId: input.staffId,
        roleCode: input.roleCode,
        permission: input.permission,
      })

      const response = await this.post<ServiceResponse<TeamMember>>(`api/v1/customers/${id}/team-member`, {
        body: input,
      })

      this.logger.info({
        msg: 'Customer team member added successfully',
        customerId: id,
        teamMemberId: response.data?.id,
      })

      return { ...response, data: response.data ?? null, httpStatus: 200 }
    } catch (error: unknown) {
      this.logger.error({
        msg: 'Error adding customer team member',
        customerId: id,
        error: error instanceof Error ? error.message : String(error),
      })
      return handleError(error, null)
    }
  }

  /**
   * Search available users to add as team members
   * GET /api/v1/customers/{id}/team-member/search-user
   *
   * Backend automatically excludes:
   * - Customer owner (from customers.owner_id)
   * - Existing team members (from customer_team_members table)
   *
   * @param id - Customer ID (UUID format)
   * @param search - Search text for user name (required)
   * @param page - Page number (default: 1, min: 1)
   * @param size - Page size (default: 10, min: 1, max: 100)
   * @returns ServiceResponse with paginated user search results (null if error)
   */
  async searchUsersForTeamMember(
    id: string,
    search: string,
    page?: number,
    size?: number
  ): Promise<ServiceResponse<UserAccountNamePagedData | null>> {
    try {
      this.logger.info({
        msg: 'Searching users for team member',
        customerId: id,
        search,
        page,
        size,
      })

      const response = await this.get<ServiceResponse<UserAccountNamePagedData>>(
        `api/v1/customers/${id}/team-member/search-user`,
        {
          params: {
            search,
            ...(page !== undefined && { page: String(page) }),
            ...(size !== undefined && { size: String(size) }),
          },
        }
      )

      this.logger.info({
        msg: 'User search for team member completed successfully',
        customerId: id,
        count: response.data?.content?.length ?? 0,
        totalElements: response.data?.totalElements ?? 0,
      })

      return { ...response, data: response.data ?? null, httpStatus: 200 }
    } catch (error: unknown) {
      this.logger.error({
        msg: 'Error searching users for team member',
        customerId: id,
        error: error instanceof Error ? error.message : String(error),
      })
      return handleError(error, null)
    }
  }

  /**
   * Get customer wealth information by customer ID
   * GET /api/v1/customers/{id}/wealth-info
   *
   * Returns wealth tier, segment, risk profile, investment objective, and wealth score.
   * Returns null if customer has no wealth data.
   *
   * @param customerId - Customer ID (UUID format)
   * @returns ServiceResponse with wealth information (null if no wealth data)
   */
  async getWealthInfo(customerId: string): Promise<ServiceResponse<WealthInfoData | null>> {
    try {
      this.logger.info({
        msg: 'Fetching customer wealth information',
        customerId,
      })

      const response = await this.get<ServiceResponse<WealthInfoData>>(`api/v1/customers/${customerId}/wealth-info`)

      this.logger.info({
        msg: 'Customer wealth information fetched successfully',
        customerId,
        hasData: response.data !== null && response.data !== undefined,
        segmentGroup: response.data?.segmentGroup,
        aumCurrent: response.data?.aumCurrent,
      })

      return { ...response, data: response.data ?? null, httpStatus: 200 }
    } catch (error: unknown) {
      this.logger.error({
        msg: 'Error fetching customer wealth information',
        customerId,
        error: error instanceof Error ? error.message : String(error),
      })
      return handleError(error, null)
    }
  }

  /**
   * Get customer AUA (Assets Under Advice) information by customer ID
   * GET /api/v1/customers/{id}/aua-info
   * AP2457-8468: AUA Information Query
   *
   * Returns total AUA amount and breakdown by asset types.
   * All amounts are in THB (Thai Baht).
   * Returns null if customer has no AUA data.
   *
   * Authorization: Requires Cerbos permission `customer.aua_info` with `view` action
   *
   * Error Scenarios:
   * - 404: Customer not found → BUSINESS_ERROR
   * - 403: Insufficient permissions → BUSINESS_ERROR
   * - 500: Backend service error → INTERNAL_ERROR
   *
   * @param customerId - Customer ID (UUID format)
   * @returns ServiceResponse with AUA information (null if no AUA data)
   */
  async getAuaInfo(customerId: string): Promise<ServiceResponse<AuaInfoData | null>> {
    try {
      this.logger.info({
        msg: 'Fetching customer AUA information',
        customerId,
      })

      const response = await this.get<ServiceResponse<AuaInfoData>>(`api/v1/customers/${customerId}/aua-info`)

      this.logger.info({
        msg: 'Customer AUA information fetched successfully',
        customerId,
        hasData: response.data !== null && response.data !== undefined,
        totalAua: response.data?.totalAua,
      })

      return { ...response, data: response.data ?? null, httpStatus: 200 }
    } catch (error: unknown) {
      this.logger.error({
        msg: 'Error fetching customer AUA information',
        customerId,
        error: error instanceof Error ? error.message : String(error),
      })
      return handleError(error, null)
    }
  }

  /**
   * Get customer insurance life policies by customer ID with pagination
   * GET /api/v1/customers/{id}/product-holding/insurance/life
   *
   * @param id - Customer ID
   * @param page - Page number (1-indexed, default: 1)
   * @param size - Items per page (default: 10)
   * @returns ServiceResponse with paginated life insurance policies
   */
  async getCustomerInsuranceLifePolicies(
    id: string,
    page?: number,
    size?: number
  ): Promise<ServiceResponse<InsuranceLifePoliciesPagedData | null>> {
    try {
      this.logger.info({
        msg: 'Fetching customer insurance life policies',
        customerId: id,
        page,
        size,
      })

      const response = await this.get<ServiceResponse<InsuranceLifePoliciesPagedData>>(
        `api/v1/customers/${id}/product-holding/insurance/life`,
        {
          params: {
            ...(page !== undefined && { page: String(page) }),
            ...(size !== undefined && { size: String(size) }),
          },
        }
      )

      this.logger.info({
        msg: 'Customer insurance life policies fetched successfully',
        customerId: id,
        count: response.data?.content?.length ?? 0,
        totalElements: response.data?.totalElements ?? 0,
      })

      return { ...response, data: response.data ?? null, httpStatus: 200 }
    } catch (error: unknown) {
      this.logger.error({
        msg: 'Error fetching customer insurance life policies',
        customerId: id,
        error: error instanceof Error ? error.message : String(error),
      })
      return handleError(error, null)
    }
  }

  /**
   * Get customer insurance non-life policies by customer ID with pagination
   * GET /api/v1/customers/{id}/product-holding/insurance/non-life
   *
   * @param id - Customer ID
   * @param page - Page number (1-indexed, default: 1)
   * @param size - Items per page (default: 10)
   * @returns ServiceResponse with paginated non-life insurance policies
   */
  async getCustomerInsuranceNonLifePolicies(
    id: string,
    page?: number,
    size?: number
  ): Promise<ServiceResponse<InsuranceNonLifePoliciesPagedData | null>> {
    try {
      this.logger.info({
        msg: 'Fetching customer insurance non-life policies',
        customerId: id,
        page,
        size,
      })

      const response = await this.get<ServiceResponse<InsuranceNonLifePoliciesPagedData>>(
        `api/v1/customers/${id}/product-holding/insurance/non-life`,
        {
          params: {
            ...(page !== undefined && { page: String(page) }),
            ...(size !== undefined && { size: String(size) }),
          },
        }
      )

      this.logger.info({
        msg: 'Customer insurance non-life policies fetched successfully',
        customerId: id,
        count: response.data?.content?.length ?? 0,
        totalElements: response.data?.totalElements ?? 0,
      })

      return { ...response, data: response.data ?? null, httpStatus: 200 }
    } catch (error: unknown) {
      this.logger.error({
        msg: 'Error fetching customer insurance non-life policies',
        customerId: id,
        error: error instanceof Error ? error.message : String(error),
      })
      return handleError(error, null)
    }
  }

  /**
   * Get customer insurance overview by customer ID
   * GET /api/v1/customers/{id}/product-holding/insurance/overview
   *
   * Returns summary of customer's insurance policies including total policies,
   * total premium per year, complaints, and policy groups by product category.
   *
   * @param id - Customer ID
   * @returns ServiceResponse with insurance overview data (null if not found)
   */
  async getCustomerInsuranceOverview(id: string): Promise<ServiceResponse<CustomerInsuranceOverviewData | null>> {
    try {
      this.logger.info({
        msg: 'Fetching customer insurance overview',
        customerId: id,
      })

      const response = await this.get<ServiceResponse<CustomerInsuranceOverviewData>>(
        `api/v1/customers/${id}/product-holding/insurance/overview`
      )

      this.logger.info({
        msg: 'Customer insurance overview fetched successfully',
        customerId: id,
        totalPolicies: response.data?.totalPolicies ?? 0,
        totalPremiumPerYear: response.data?.totalPremiumPerYear ?? 0,
        complaintsCount: response.data?.complaints?.length ?? 0,
        policiesGroupCount: response.data?.policiesGroup?.length ?? 0,
      })

      return { ...response, data: response.data ?? null, httpStatus: 200 }
    } catch (error: unknown) {
      this.logger.error({
        msg: 'Error fetching customer insurance overview',
        customerId: id,
        error: error instanceof Error ? error.message : String(error),
      })
      return handleError(error, null)
    }
  }

  /**
   * Get customer behavior investment by customer ID
   * GET /api/v1/customers/{id}/behavior/investment
   *
   * Returns the investment section of the customer behavior overview.
   * Backend returns the standard Sonic `Response<T>` envelope
   * (`code`, `message`, `data`) with snake_case fields in `data`.
   * The datasource maps `data` to camelCase and returns it.
   *
   * Null semantics:
   * - 200 with `data: null` → returns `data: null` (section is optional for
   *   that customer). The resolver surfaces this as `code = SUCCESS`.
   *
   * Error handling:
   * - 404 with a Sonic business error code (e.g. `ERROR_GENE00010`) is
   *   extracted by `handleError` and mapped to `ResponseCode.BUSINESS_ERROR`
   *   by the resolver via `transformServiceResponse`.
   * - Any unexpected/technical failure maps to `ResponseCode.INTERNAL_ERROR`.
   *
   * @param id - Customer ID (UUID)
   * @returns ServiceResponse with investment behavior data (null if not found)
   */
  async getCustomerBehaviorInvestment(id: string): Promise<ServiceResponse<CustomerBehaviorInvestmentData | null>> {
    try {
      this.logger.info({
        msg: 'Fetching customer behavior investment',
        customerId: id,
      })

      // Backend returns camelCase fields in Sonic Response envelope (pass-through)
      const response = await this.get<ServiceResponse<CustomerBehaviorInvestmentData>>(
        `api/v1/customers/${id}/behavior/investment`
      )

      this.logger.info({
        msg: 'Customer behavior investment fetched successfully',
        customerId: id,
        hasData: response.data !== null && response.data !== undefined,
      })

      return { ...response, data: response.data ?? null, httpStatus: 200 }
    } catch (error: unknown) {
      this.logger.error({
        msg: 'Error fetching customer behavior investment',
        customerId: id,
        error: error instanceof Error ? error.message : String(error),
      })
      return handleError(error, null)
    }
  }

  /**
   * Get customer behavior "Other" section by customer ID.
   * GET /api/v1/customers/{id}/behavior/other
   *
   * Returns the "Other" behavior section for a customer. All Temp fields are
   * pass-through only - the BFF applies no business logic to them.
   *
   * @param id - Customer ID (UUID format)
   * @returns ServiceResponse with customer behavior "Other" data (null if not found)
   */
  async getCustomerBehaviorOther(id: string): Promise<ServiceResponse<CustomerBehaviorOtherData | null>> {
    try {
      this.logger.info({
        msg: 'Fetching customer behavior other',
        customerId: id,
      })

      // Backend returns camelCase fields in Sonic Response envelope (pass-through)
      const response = await this.get<ServiceResponse<CustomerBehaviorOtherData>>(
        `api/v1/customers/${id}/behavior/other`
      )

      this.logger.info({
        msg: 'Customer behavior other fetched successfully',
        customerId: id,
        hasData: response.data !== null && response.data !== undefined,
      })

      return { ...response, data: response.data ?? null, httpStatus: 200 }
    } catch (error: unknown) {
      this.logger.error({
        msg: 'Error fetching customer behavior other',
        customerId: id,
        error: error instanceof Error ? error.message : String(error),
      })
      return handleError(error, null)
    }
  }

  /**
   * Get customer behavior investment-preference section by customer ID.
   * GET /api/v1/customers/{id}/behavior/investment-preference
   *
   * @param id - Customer ID (UUID)
   * @returns ServiceResponse with investment-preference data (null if not found)
   */
  async getCustomerBehaviorInvestmentPreference(
    id: string
  ): Promise<ServiceResponse<CustomerBehaviorInvestmentPreferenceData | null>> {
    try {
      this.logger.info({
        msg: 'Fetching customer behavior investment preference',
        customerId: id,
      })

      // Backend returns camelCase fields in Sonic Response envelope (pass-through)
      const response = await this.get<ServiceResponse<CustomerBehaviorInvestmentPreferenceData>>(
        `api/v1/customers/${id}/behavior/investment-preference`
      )

      this.logger.info({
        msg: 'Customer behavior investment preference fetched successfully',
        customerId: id,
        hasData: response.data !== null && response.data !== undefined,
      })

      return { ...response, data: response.data ?? null, httpStatus: 200 }
    } catch (error: unknown) {
      this.logger.error({
        msg: 'Error fetching customer behavior investment preference',
        customerId: id,
        error: error instanceof Error ? error.message : String(error),
      })
      return handleError(error, null)
    }
  }

  /**
   * Get customer behavior insurance by customer ID
   * GET /api/v1/customers/{id}/behavior/insurance
   *
   * @param id - Customer ID (UUID)
   * @returns ServiceResponse with customer behavior insurance data (null if not found)
   */
  async getCustomerBehaviorInsurance(id: string): Promise<ServiceResponse<CustomerBehaviorInsuranceData | null>> {
    try {
      this.logger.info({
        msg: 'Fetching customer behavior insurance',
        customerId: id,
      })

      // Backend returns camelCase fields in Sonic Response envelope (pass-through)
      const response = await this.get<ServiceResponse<CustomerBehaviorInsuranceData>>(
        `api/v1/customers/${id}/behavior/insurance`
      )

      this.logger.info({
        msg: 'Customer behavior insurance fetched successfully',
        customerId: id,
        hasData: response.data !== null && response.data !== undefined,
      })

      return { ...response, data: response.data ?? null, httpStatus: 200 }
    } catch (error: unknown) {
      this.logger.error({
        msg: 'Error fetching customer behavior insurance',
        customerId: id,
        error: error instanceof Error ? error.message : String(error),
      })
      return handleError(error, null)
    }
  }
}
