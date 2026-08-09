package th.co.scb.sonic.customer.controller.productholding.banking;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import th.co.scb.sonic.customer.model.dto.BulkAccountInquiryRequest;
import th.co.scb.sonic.customer.model.dto.BulkAccountInquiryResponse;
import th.co.scb.sonic.customer.model.dto.request.AccountNotificationRequest;
import th.co.scb.sonic.customer.model.dto.request.AccountTransactionDetailRequest;
import th.co.scb.sonic.customer.model.dto.request.BankingAccountDetailRequest;
import th.co.scb.sonic.customer.model.dto.request.CustomerProfileSimpleRequest;
import th.co.scb.sonic.customer.model.dto.request.ElectronicCardDetailRequest;
import th.co.scb.sonic.customer.model.dto.request.ElectronicCardsRequest;
import th.co.scb.sonic.customer.model.dto.request.FixedSubDepositsInquiryRequest;
import th.co.scb.sonic.customer.model.dto.request.FrcTransactionRequest;
import th.co.scb.sonic.customer.model.dto.request.HoldAmountRequest;
import th.co.scb.sonic.customer.model.dto.request.IntradayStatementRequest;
import th.co.scb.sonic.customer.model.dto.request.MiscMessageDetailRequest;
import th.co.scb.sonic.customer.model.dto.request.MutualFundAccountListRequest;
import th.co.scb.sonic.customer.model.dto.request.MutualFundDebentureRequest;
import th.co.scb.sonic.customer.model.dto.request.MutualFundDetailRequest;
import th.co.scb.sonic.customer.model.dto.response.AccountDetailResponseDto;
import th.co.scb.sonic.customer.model.dto.response.AccountLongtermSubDepositsDataDto;
import th.co.scb.sonic.customer.model.dto.response.AccountNotificationResponseDto;
import th.co.scb.sonic.customer.model.dto.response.AccountTransactionDetailResponseDto;
import th.co.scb.sonic.customer.model.dto.response.BankingAccountListDataDto;
import th.co.scb.sonic.customer.model.dto.response.ElectronicCardDetailResponseDto;
import th.co.scb.sonic.customer.model.dto.response.ElectronicCardsResponseDto;
import th.co.scb.sonic.customer.model.dto.response.FrcTransactionResponseDto;
import th.co.scb.sonic.customer.model.dto.response.HoldAmountDetailsDto;
import th.co.scb.sonic.customer.model.dto.response.IntradayStatementResponseDto;
import th.co.scb.sonic.customer.model.dto.response.MutualFundDebentureResponseDto;
import th.co.scb.sonic.customer.model.dto.response.MutualFundDetailResponseDto;
import th.co.scb.sonic.customer.model.dto.response.StandardResponseDto;
import th.co.scb.sonic.customer.service.productholding.CustomerProductHoldingService;
import th.co.scb.sonic.customer.service.productholding.banking.AccountDetailService;
import th.co.scb.sonic.customer.service.productholding.banking.AccountFrcService;
import th.co.scb.sonic.customer.service.productholding.banking.AccountHoldAmountService;
import th.co.scb.sonic.customer.service.productholding.banking.AccountNotificationService;
import th.co.scb.sonic.customer.service.productholding.banking.AccountMiscMessageService;
import th.co.scb.sonic.customer.service.productholding.banking.AccountTransactionDetailService;
import th.co.scb.sonic.customer.service.productholding.banking.BankingService;
import th.co.scb.sonic.customer.service.productholding.banking.ElectronicCardsService;
import th.co.scb.sonic.customer.service.productholding.banking.FixedSubDepositsService;
import th.co.scb.sonic.customer.service.productholding.banking.IntradayStatementService;
import th.co.scb.sonic.customer.service.productholding.banking.LongtermSubDepositsService;
import th.co.scb.sonic.customer.service.productholding.banking.MutualFundClientProfileService;
import th.co.scb.sonic.common.model.Response;
import th.co.scb.sonic.web.controller.BaseController;

import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/v1/product-holding/banking")
@RequiredArgsConstructor
@Tag(name = "Account", description = "Account management APIs")
public class BankingController extends BaseController {

    private final BankingService bankingService;
    private final CustomerProductHoldingService customerProductHoldingService;
    private final LongtermSubDepositsService longtermSubDepositsService;
    private final FixedSubDepositsService fixedSubDepositsService;
    private final AccountDetailService accountDetailService;
    private final AccountTransactionDetailService accountTransactionDetailService;
    private final IntradayStatementService intradayStatementService;
    private final AccountFrcService accountFrcService;
    private final AccountHoldAmountService accountHoldAmountService;
    private final AccountNotificationService accountNotificationService;
    private final AccountMiscMessageService accountMiscMessageService;
    private final MutualFundClientProfileService mutualFundClientProfileService;
    private final ElectronicCardsService electronicCardsService;

    @PostMapping(
            value = "/bulk-account-inquiry",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE
    )
    @Operation(
            summary = "Bulk Account Inquiry",
            description = "Query multiple accounts information including balances. "
                    + "Forwards request to Integration Service -> EAPI. "
                    + "Returns standardized response format. "
                    + "Set includeMiscellaneousMessage=true to include miscellaneous messages."
    )
    public BulkAccountInquiryResponse bulkAccountInquiry(
            @Valid @RequestBody List<BulkAccountInquiryRequest> accounts,
            @RequestHeader(value = "correlation-id", required = false) String correlationId,
            @RequestParam(value = "includeMiscellaneousMessage", required = false, defaultValue = "false")
            boolean includeMiscellaneousMessage) {

        log.info("Received bulk account inquiry request for {} accounts, includeMiscellaneousMessage: {}",
                accounts.size(), includeMiscellaneousMessage);

        return bankingService.getBulkAccountInfo(accounts, correlationId, includeMiscellaneousMessage);
    }

    @PostMapping("/account-list")
    public ResponseEntity<Response<BankingAccountListDataDto>> getBankingAccountList(
            @Valid @RequestBody CustomerProfileSimpleRequest request) {

        log.info("Received Banking account list request: {}", request);
        Response<BankingAccountListDataDto> response =
                customerProductHoldingService.getBankingAccountList(request);
        return autoMap(response);
    }

    @GetMapping(
            value = "/accounts/{accountNumber}/longterm-sub-deposits",
            produces = MediaType.APPLICATION_JSON_VALUE
    )
    @Operation(
            summary = "Get Account Long-term Sub-Deposits",
            description = "Query account long-term sub-deposit information. "
                    + "Forwards request to Integration Service -> EAPI. "
                    + "Returns standardized response format with field visibility flags."
    )
    public StandardResponseDto<AccountLongtermSubDepositsDataDto> getAccountLongtermSubDeposits(
            @PathVariable String accountNumber,
            @RequestParam(value = "accountCurrency", required = false, defaultValue = "764") String accountCurrency,
            @RequestParam(value = "accountType", required = false) String accountType,
            @RequestHeader(value = "correlation-id", required = false) String correlationId) {

        log.info("Received account long-term sub-deposits request for accountNumber: {}, currency: {}, accountType: {}",
                accountNumber, accountCurrency, accountType);

        String effectiveAccountCurrency =
                (accountCurrency == null || accountCurrency.isBlank()) ? "764" : accountCurrency;

        return longtermSubDepositsService.getAccountLongtermSubDeposits(
                accountNumber,
                effectiveAccountCurrency,
                accountType,
                correlationId
        );
    }

    @PostMapping(
            value = "/account-detail",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE
    )
    @Operation(
            summary = "Get Comprehensive Account Detail",
            description = "Query comprehensive account detail by orchestrating multiple API calls. "
                    + "Calls bulkAccountInquiry for basic account info and accountType. "
                    + "If accountType is Fix (1) or Longterm (0, 8), also calls longtermSubDeposits. "
                    + "Returns aggregated data with 21 fields including balances, dates, and longterm deposit info. "
                    + "Uses default currency='764' (THB) and bankCode='14' (SCB). "
                    + "Account number must be exactly 10 characters. "
                    + "ApplicationId is required for product address lookup."
    )
    public StandardResponseDto<AccountDetailResponseDto> getAccountDetail(
            @Valid @RequestBody BankingAccountDetailRequest request) {

        log.info("Received account detail request for accountNumber: {}, applicationId: {}, customerKey: {}",
                request.getAccountNumber(), request.getApplicationId(), request.getCustomerKey());

        return accountDetailService.getAccountDetail(
                request.getAccountNumber(),
                request.getApplicationId(),
                request.getCustomerKey());
    }

    @PostMapping(
            value = "/account-transaction-detail",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE
    )
    @Operation(
            summary = "Get Account Transaction Detail",
            description = "Query account transaction history by calling Account Statement API. "
                    + "Returns account information and list of transactions with details. "
                    + "Supports date range filtering (defaults to last 3 months). "
                    + "Default currency='764' (THB), default accountType='C' (Current), default limit=40."
    )
    public StandardResponseDto<AccountTransactionDetailResponseDto> getAccountTransactionDetail(
            @Valid @RequestBody AccountTransactionDetailRequest request) {

        log.info("Received account transaction detail request for accountNumber: {}", request.getAccountNumber());

        return accountTransactionDetailService.getAccountTransactionDetail(
                request.getAccountNumber(),
                request.getAccountCurrency(),
                request.getAccountType(),
                request.getPagingLimit(),
                request.getTransactionDateFrom(),
                request.getTransactionDateTo()
        );
    }

    @PostMapping(
            value = "/accounts/intraday-statement",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE
    )
    @Operation(
            summary = "Get Intraday Statement",
            description = "Query real-time account transactions for the current day by calling Intraday Statement API. "
                    + "Returns account information, branch details, and list of intraday transactions. "
                    + "Default currency='764' (THB), default sortSequence='A' (Ascending), default limit=50."
    )
    public StandardResponseDto<IntradayStatementResponseDto> getIntradayStatement(
            @Valid @RequestBody IntradayStatementRequest request) {

        log.info("Received intraday statement request for accountNumber: {}", request.getAccountNumber());

        return intradayStatementService.getIntradayStatement(
                request.getAccountNumber(),
                request.getAccountCurrency(),
                request.getSortSequence(),
                request.getTranType(),
                request.getPagingLimit()
        );
    }

    @PostMapping(
            value = "/frc-inquiry",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE
    )
    @Operation(
            summary = "Get FRC Transactions",
            description = "Query FRC transactions by account number."
    )
    public StandardResponseDto<FrcTransactionResponseDto> getFrcTransactions(
            @Valid @RequestBody FrcTransactionRequest request) {

        log.info("Received FRC transaction request for accountNumber: {}, stTranDt: {}, enTranDt: {}, "
                        + "stPaidDt: {}, enPaidDt: {}",
                request.getAccountNumber(), request.getStartTranDate(), request.getEndTranDate(),
                request.getStartPaidDate(), request.getEndPaidDate());

        return accountFrcService.getFrcTransaction(
                request.getAccountNumber(),
                request.getStartTranDate(),
                request.getEndTranDate(),
                request.getStartPaidDate(),
                request.getEndPaidDate()
        );
    }

    @PostMapping(
            value = "/hold-amount-details",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE
    )
    @Operation(
            summary = "Get Hold Amount Details",
            description = "Query hold amount details by account number. "
                    + "Retrieves hold records from Integration Service and transforms them with business logic: "
                    + "1. holdDescription = 'R14 - Hold Amount' (constant) "
                    + "2. holdReason = mapped from holdCode prefix using mapPrefixToHoldReason() "
                    + "3. channel = analyzed from submissionUser "
                    + "(MS* -> Call Center, 5-char or ST* -> Branch, else Other). "
                    + "Returns account number, total records count, and detailed hold records list."
    )
    public StandardResponseDto<HoldAmountDetailsDto> getHoldAmountDetails(
            @Valid @RequestBody HoldAmountRequest request) {

        log.info("Received hold amount details request for accountNumber: {}", request.getAccountNumber());

        return accountHoldAmountService.getHoldAmountDetails(request.getAccountNumber());
    }

    @PostMapping(
            value = "/notification",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE
    )
    @Operation(
            summary = "Get Account Notification (Alerts)",
            description = "Query account notification/alert configuration by customer and product information. "
                    + "Returns registration status, alert channels (SMS/Email), alert types, and fee profile. "
                    + "All request fields are required."
    )
    public StandardResponseDto<AccountNotificationResponseDto> getAccountNotification(
            @Valid @RequestBody AccountNotificationRequest request) {

        log.info("Received account notification request for customerRefNumber: {}, productType: {}, productNumber: {}",
                request.getCustomerRefNumber(), request.getProductType(), request.getProductNumber());

        return accountNotificationService.getAccountNotification(
                request.getCustomerRefNumber(),
                request.getProductType(),
                request.getProductNumber()
        );
    }

    @PostMapping(
            value = "/fixed-sub-deposits-inquiry",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE
    )
    @Operation(
            summary = "Get Fixed Sub Deposits Inquiry",
            description = "Query fixed deposit account with sub-deposits information by account number. "
                    + "Returns response in Integration Service format (not wrapped in StandardResponseDto)."
    )
    public ResponseEntity<Object> getFixedSubDeposits(
            @Valid @RequestBody FixedSubDepositsInquiryRequest request) {

        log.info("Received fixed sub deposits inquiry request for accountNumber: {}",
                request.getAccountNumber());

        Map<String, Object> response = fixedSubDepositsService.getFixedSubDeposits(
                request.getAccountNumber(),
                request.getRequestCode(),
                request.getOverrideFlag()
        );

        return ResponseEntity.ok(response);
    }

    @PostMapping(
            value = "/accounts/misc-message-detail",
            produces = MediaType.APPLICATION_JSON_VALUE
    )
    @Operation(
            summary = "Get Miscellaneous Message Detail",
            description = "Query miscellaneous message code details by account number. "
                    + "Retrieves message code records from Integration Service and transforms them: "
                    + "1. miscCode = concatenated miscMsgType + miscMsgNum (dashes removed) "
                    + "2. miscReason = mapped from miscMsgText "
                    + "using mapMiscellaneousMessageSuspendAccounts() "
                    + "3. miscChanel = determined from miscMsgEmpId "
                    + "(BCMS, Easy, AML team, Call Center, IVR, Branch, Others) "
                    + "4. Records with seq containing '00000' are listed first. "
                    + "Returns 4 fields per record: seq (as seqNo), miscCode, miscReason, miscChanel."
    )
    public StandardResponseDto<List<Map<String, Object>>> getMiscMessageDetail(
            @Valid @RequestBody MiscMessageDetailRequest request) {

        log.info("Received misc message detail request for accountNumber: {}", request.getAccountNumber());

        return accountMiscMessageService.getMiscMessageList(request.getAccountNumber());
    }

    @PostMapping(
            value = "/mutual-fund-detail",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE
    )
    @Operation(
            summary = "Get Mutual Fund Detail",
            description = "Retrieve mutual fund detail for a specific account. "
                    + "Frontend sends customerKey (RM ID) and accountNumber. Backend queries all other data including "
                    + "accountName, fundCode, fundName, product info, branch, balance, and account details. "
                    + "Maps data from getClientProfiles API and customer database."
    )
    public StandardResponseDto<MutualFundDetailResponseDto> getMutualFundDetail(
            @Valid @RequestBody MutualFundDetailRequest request) {

        log.info("Received mutual fund detail request for customerKey: {}, accountNumber: {}",
                request.getCustomerKey(), request.getAccountNumber());

        return mutualFundClientProfileService.getMutualFundDetail(
                request.getAccountNumber(), request.getCustomerKey());
    }

    @PostMapping(
            value = "/mutual-fund-account-list",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE
    )
    @Operation(
            summary = "Get Mutual Fund Account List",
            description = "Query mutual fund account list by customer key (RM ID) and application ID. "
                    + "Returns list of mutual fund accounts with account number and name."
    )
    public StandardResponseDto<List<Map<String, Object>>> getMutualFundAccountList(
            @Valid @RequestBody MutualFundAccountListRequest request) {

        log.info("Received mutual fund account list request for customerKey: {}, applicationId: {}",
                request.getCustomerKey(), request.getApplicationId());

        return mutualFundClientProfileService.getMutualFundAccountList(
                request.getCustomerKey(),
                request.getApplicationId()
        );
    }

    @PostMapping(
            value = "/electronic-cards",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE
    )
    @Operation(
            summary = "Get Electronic Cards",
            description = "Query electronic cards by account number. "
                    + "Calls debit cards API (findByAccountNumbers) to get cardRefNo, "
                    + "then async calls card detail API (debitcards/{cardRefNo}) "
                    + "for detailed card information. "
                    + "Returns card details including cardNumber, cardRefNo, "
                    + "cardName (mapped from database using cardRefNumber), "
                    + "cardStatus, feeAmount, and nextFeeAmount."
    )
    public StandardResponseDto<ElectronicCardsResponseDto> getElectronicCardListByAccountNumber(
            @Valid @RequestBody ElectronicCardsRequest request) {

        log.info("Received electronic cards request for account number: {}", request.getAccountNumber());

        return electronicCardsService.getElectronicCardListByAccountNumber(request.getAccountNumber());
    }

    @PostMapping(
            value = "/electronic-card-detail",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE
    )
    @Operation(
            summary = "Get Electronic Card Detail",
            description = "Query electronic card detail by card reference number. "
                    + "Calls debit card detail API (debitcards/{cardRefNumber}) "
                    + "to get card information. "
                    + "Returns only the cardRefNumber from the response."
    )
    public StandardResponseDto<ElectronicCardDetailResponseDto> getElectronicCardDetail(
            @Valid @RequestBody ElectronicCardDetailRequest request) {

        log.info("Received electronic card detail request for cardRefNumber: {}", request.getCardRefNumber());

        return electronicCardsService.getElectronicCardDetail(request.getCardRefNumber());
    }

    @PostMapping(
            value = "/mutual-fund-debenture",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE
    )
    @Operation(
            summary = "Get Mutual Fund Debenture",
            description = "Query mutual fund debenture information by RM ID. "
                    + "Returns list of debentures with name and amount. "
                    + "Currently returns mock data. "
                    + "Future implementation will query customer_mutual_funds_deposit table "
                    + "for scb_debenture_amt and other_debenture_amt."
    )
    public StandardResponseDto<MutualFundDebentureResponseDto> getMutualFundDebenture(
            @Valid @RequestBody MutualFundDebentureRequest request) {

        log.info("Received mutual fund debenture request for rmId: {}", request.getRmId());

        return mutualFundClientProfileService.getMutualFundDebenture(request.getRmId());
    }
}
