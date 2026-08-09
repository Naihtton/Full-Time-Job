package th.co.scb.sonic.customer.service.productholding;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import th.co.scb.sonic.common.exception.SonicException;
import th.co.scb.sonic.common.model.Response;
import th.co.scb.sonic.common.model.enums.ResponseStatus;
import th.co.scb.sonic.customer.constant.ProductHoldingConstants;
import static th.co.scb.sonic.customer.constant.ProductHoldingConstants.FIELD_ACCOUNT_CURRENCY;
import static th.co.scb.sonic.customer.constant.ProductHoldingConstants.FIELD_ACCOUNT_PROD_CODE;
import th.co.scb.sonic.customer.model.dto.request.BulkAccountInquiryRequest;
import th.co.scb.sonic.customer.model.dto.request.CustomerProfileSimpleRequest;
import th.co.scb.sonic.customer.model.dto.response.AccountListDataDto;
import th.co.scb.sonic.customer.model.dto.response.AccountRelationDto;
import th.co.scb.sonic.customer.model.dto.response.AutoFinanceAccountListDataDto;
import th.co.scb.sonic.customer.model.dto.response.AutoFinanceAccountRelationDto;
import th.co.scb.sonic.customer.model.dto.response.BankingAccountListDataDto;
import th.co.scb.sonic.customer.model.dto.response.BankingAccountRelationDto;
import th.co.scb.sonic.customer.model.dto.response.CommercialLoanAccountDto;
import th.co.scb.sonic.customer.model.dto.response.CommercialLoanAccountListDataDto;
import th.co.scb.sonic.customer.model.dto.response.HomeLoanAccountDto;
import th.co.scb.sonic.customer.model.dto.response.HomeLoanAccountListDataDto;
import th.co.scb.sonic.customer.model.dto.response.PersonalLoanAccountDto;
import th.co.scb.sonic.customer.model.dto.response.PersonalLoanAccountListDataDto;
import th.co.scb.sonic.customer.model.dto.response.SsmeLoanAccountDto;
import th.co.scb.sonic.customer.model.dto.response.SsmeLoanAccountListDataDto;
import th.co.scb.sonic.customer.model.dto.response.StandardResponse;
import th.co.scb.sonic.customer.model.dto.response.StandardResponseDto;
import th.co.scb.sonic.customer.model.dto.response.TotalAccountDataDto;
import th.co.scb.sonic.customer.model.enums.ProductType;
import th.co.scb.sonic.customer.service.productholding.integration.IntegrationCustomerProfileService;
import th.co.scb.sonic.customer.model.entity.EnumProductHolding;
import th.co.scb.sonic.customer.repository.EnumProductHoldingRepository;
import th.co.scb.sonic.customer.service.productholding.homeloan.HomeLoanPermissionService;
import th.co.scb.sonic.customer.service.productholding.ssmeloan.SsmeLoanPermissionService;
import th.co.scb.sonic.customer.service.productholding.commercialloan.CommercialLoanPermissionService;
import java.util.stream.Collectors;
import th.co.scb.sonic.customer.service.productholding.productname.ProductNameMapper;
import th.co.scb.sonic.customer.service.productholding.productname.ProductNameEnricher;
import th.co.scb.sonic.customer.service.productholding.productname.ProductNameEnricherFactory;
import th.co.scb.sonic.customer.client.dto.ProductNameLookupResponse;
import th.co.scb.sonic.customer.client.ProductServiceClient;

@Slf4j
@Service
@RequiredArgsConstructor
public class CustomerProductHoldingService {

    // Account Status Priority Constants
    private static final int PRIORITY_NORMAL = 1;
    private static final int PRIORITY_DORMNT = 2;
    private static final int PRIORITY_C_ONLY = 3;
    private static final int PRIORITY_UNR_CD = 4;
    private static final int PRIORITY_FROZEN = 5;
    private static final int PRIORITY_CLOSED = 6;
    private static final int PRIORITY_TRMNTD = 7;
    private static final int PRIORITY_PURGED = 8;
    private static final int PRIORITY_UNKNOWN = 9;

    // Field name constants
    private static final String CORRELATION_ID = "correlationId";
    private static final String ACC_APPLICATION_IDENTIFICATION_CODE = "accApplicationIdentificationCode";
    private static final String PRODUCT_LINKAGE = "productLinkage";
    private static final String ACCOUNT_NUMBER = "accountNumber";
    private static final String ACCOUNT_NAME = "accountName";
    private static final String ACCOUNT_STATUS = "accountStatus";
    private static final String ACCOUNT_TYPE = "accountType";
    private static final String TOTAL_COUNT = "totalCount";
    private static final String RESOURCE = "resource";
    private static final String ACCOUNT_RELATION = "accountRelation";
    private static final String ACCOUNT_PRODUCT_CODE = "accountProductCode";
    private static final String PROD_NAME = "prodName";
    private static final String ACCT_TYPE = "acctType";
    private static final String ACCOUNT_KEY = "accountKey";
    private static final String PRODUCT_CODE = "productCode";

    // Log message constants
    private static final String LOG_DEBUG_ITEM_FILTERED = "🔍 DEBUG - Item filtered out: accAppId={}, accountNumber={}";
    private static final String LOG_DEBUG_AFTER_FILTERING = "🔍 DEBUG - After filtering: {} items (from {} total)";

    private final IntegrationCustomerProfileService integrationCustomerProfileService;
    private final CustomerProfileQueryValidator profileQueryValidator;
    private final EnumProductHoldingRepository enumProductHoldingRepository;
    private final HomeLoanPermissionService homeLoanPermissionService;
    private final SsmeLoanPermissionService ssmeLoanPermissionService;
    private final CommercialLoanPermissionService commercialLoanPermissionService;

    // Caching for enum_product_holding mappings
    private Map<String, String> bankSubStatusMapping;
    private Map<String, String> loanStatusMapping;    // Loan_Status
    private Map<String, String> loanSubStatusMapping; // Loan_Sub_Status

    // Category constants for enum_product_holding
    private static final String BANKING_ACCOUNT_SUB_STATUS_CATEGORY = "Banking_Account_Sub_Status";
    private static final String LOAN_STATUS_CATEGORY = "Loan_Status";
    private static final String LOAN_SUB_STATUS_CATEGORY = "Loan_Sub_Status";

    private final ProductNameMapper productNameMapper;
    private final ProductNameEnricherFactory enricherFactory;
    private final ProductServiceClient productServiceClient;

    /**
     * Get digital adoption information.
     * Calls /v2/customer/profile/query endpoint to retrieve customer profile data.
     * Filters accounts based on product type using isAccountMatchProduct.
     *
     * @param request Request containing customerKey and productType
     * @return ResponseEntity with Map containing digital adoption data
     */
    public ResponseEntity<Map<String, Object>> getDigitalAdoption(
            CustomerProfileSimpleRequest request) {

        log.info("getDigitalAdoption - Request: customerKey={}, productType={}",
                request.getCustomerKey(), request.getProductType());

        List<String> applicationTypes = mapProductTypeToApplicationTypes(request.getProductType());
        log.info("getDigitalAdoption - Mapped applicationTypes: {}", applicationTypes);

        try {
            ResponseEntity<Map<String, Object>> integrationResponse =
                    integrationCustomerProfileService.queryAccountRelations(
                            request.getCustomerKey(),
                            applicationTypes
                    );

            log.info("getDigitalAdoption - Integration Response Status: {}",
                    integrationResponse.getStatusCode());

            Map<String, Object> body = integrationResponse.getBody();

            log.info("getDigitalAdoption - Response Body: {}", body);

            // Extract account relation items from response
            List<Map<String, Object>> items = profileQueryValidator.extractAccountRelationItems(body);
            log.info("getDigitalAdoption - Extracted {} items from response", items.size());

            // Log raw items for debugging
            items.forEach(item -> log.info("getDigitalAdoption - Raw item: {}", item));

            // Filter accounts based on product type rules
            ProductType productType = request.getProductType();
            List<Map<String, Object>> filteredItems = items.stream()
                    .filter(item -> {
                        boolean matches = profileQueryValidator.isAccountMatchProduct(item, productType);
                        log.info("getDigitalAdoption - Item {} matches productType {}: {}",
                                item.get(PRODUCT_LINKAGE), productType, matches);
                        return matches;
                    })
                    .toList();

            log.info("getDigitalAdoption - Filtered {} items (from {} total) for productType: {}",
                    filteredItems.size(), items.size(), productType);

            // Reconstruct response body with filtered items
            Map<String, Object> filteredBody = reconstructResponseWithFilteredItems(body, filteredItems);

            // Get correlationId for response header
            String correlationId = integrationResponse.getHeaders().getFirst(CORRELATION_ID);

            // Extract totalCount from filteredBody to determine accountStatus
            int totalCount = extractTotalCount(filteredBody);
            String accountStatus = totalCount != 0 ? "ACTIVE" : "INACTIVE";
            log.info("getDigitalAdoption - Set accountStatus to {} (totalCount = {})", accountStatus, totalCount);

            // Add accountStatus to filteredBody
            filteredBody.put(ACCOUNT_STATUS, accountStatus);

            // Return the filtered response
            return ResponseEntity.ok()
                    .header(CORRELATION_ID, correlationId)
                    .body(filteredBody);
        } catch (Exception ex) {
            log.error("Failed to get digital adoption: {}", ex.getMessage(), ex);
            return ResponseEntity.ok(Map.of(
                    "success", false,
                    "error", ex.getMessage()
            ));
        }
    }

    /**
     * Get total account count by product type.
     * Returns StandardResponse with total count of accounts.
     *
     * @param request Request containing customerKey and productType
     * @return ResponseEntity with StandardResponse containing TotalAccountDataDto
     */
    public ResponseEntity<StandardResponse<TotalAccountDataDto>> getCustomerTotalAccount(
            CustomerProfileSimpleRequest request) {

        List<String> applicationTypes = mapProductTypeToApplicationTypes(request.getProductType());

        try {
            ResponseEntity<Map<String, Object>> integrationResponse =
                    integrationCustomerProfileService.queryAccountRelations(
                            request.getCustomerKey(),
                            applicationTypes
                    );

            String correlationId = integrationResponse.getHeaders().getFirst(CORRELATION_ID);
            Map<String, Object> body = integrationResponse.getBody();

            List<Map<String, Object>> items = profileQueryValidator.extractAccountRelationItems(body);

            ProductType productType = request.getProductType();

            TotalAccountDataDto data = switch (productType) {
                case BK -> {
                    // For BK product type, count each application type separately
                    long matchingCountST = items.stream()
                            .filter(item -> profileQueryValidator.isAccountOfApplicationType(item, "ST"))
                            .count();

                    long matchingCountIM = items.stream()
                            .filter(item -> profileQueryValidator.isAccountOfApplicationType(item, "IM"))
                            .count();

                    long matchingCountEC = items.stream()
                            .filter(item -> profileQueryValidator.isAccountOfApplicationType(item, "EC"))
                            .count();

                    long matchingCountOE = items.stream()
                            .filter(item -> profileQueryValidator.isAccountOfApplicationType(item, "OE"))
                            .count();

                    long matchingCount = matchingCountST + matchingCountIM + matchingCountEC + matchingCountOE;

                    yield TotalAccountDataDto.builder()
                            .totalAccounts(matchingCount)
                            .totalAccountsST(matchingCountST)
                            .totalAccountsIM(matchingCountIM)
                            .totalAccountsEC(matchingCountEC)
                            .totalAccountsOE(matchingCountOE)
                            .build();
                }
                case CL -> {
                    // For CL product type, count SSME and CL separately
                    long matchingCountSSME = items.stream()
                            .filter(item -> profileQueryValidator.isAccountOfProduct(item, "Product_Code_SSME"))
                            .count();

                    long matchingCountCL = items.stream()
                            .filter(item -> profileQueryValidator.isAccountOfProduct(item, "Product_Code_CL"))
                            .count();

                    long matchingCount = matchingCountSSME + matchingCountCL;

                    yield TotalAccountDataDto.builder()
                            .totalAccounts(matchingCount)
                            .totalSSME(matchingCountSSME)
                            .totalCL(matchingCountCL)
                            .build();
                }
                default -> {
                    // For other product types, use the standard matching logic
                    long matchingCount = items.stream()
                            .filter(item -> profileQueryValidator.isAccountMatchProduct(item, productType))
                            .count();

                    yield TotalAccountDataDto.builder()
                            .totalAccounts(matchingCount)
                            .build();
                }
            };

            StandardResponse<TotalAccountDataDto> response = StandardResponse.success(
                    ProductHoldingConstants.SUCCESS_CODE_GEN_S00001,
                    "Total account retrieved successfully",
                    data
            );

            return ResponseEntity.ok()
                    .header(CORRELATION_ID, correlationId)
                    .body(response);

        } catch (Exception ex) {
            log.error("Failed to get customer total account: {}", ex.getMessage(), ex);

            TotalAccountDataDto emptyData = TotalAccountDataDto.builder()
                    .totalAccounts(0L)
                    .build();

            StandardResponse<TotalAccountDataDto> errorResponse = StandardResponse.errorWithData(
                    ProductHoldingConstants.ERROR_CODE_GEN_E00006,
                    ProductHoldingConstants.ERROR_MSG_UNABLE_TO_LOAD,
                    emptyData,
                    HttpStatus.INTERNAL_SERVER_ERROR.value()
            );

            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(errorResponse);
        }
    }

    public ResponseEntity<StandardResponseDto<AccountListDataDto>> getCustomerAccountList(
            CustomerProfileSimpleRequest request) {

        List<String> applicationTypes = mapProductTypeToApplicationTypes(request.getProductType());

        try {
            ResponseEntity<Map<String, Object>> integrationResponse =
                    integrationCustomerProfileService.queryAccountRelations(
                            request.getCustomerKey(),
                            applicationTypes
                    );

            String correlationId = integrationResponse.getHeaders().getFirst(CORRELATION_ID);
            Map<String, Object> body = integrationResponse.getBody();

            List<Map<String, Object>> items = profileQueryValidator.extractAccountRelationItems(body);

            // Filter accounts based on product type rules
            ProductType productType = request.getProductType();
            List<Map<String, Object>> filteredItems = items.stream()
                    .filter(item -> profileQueryValidator.isAccountMatchProduct(item, productType))
                    .toList();

            // Transform to DTO
            List<AccountRelationDto> accountRelationList = filteredItems.stream()
                    .map(this::transformToAccountRelationDto)
                    .toList();

            // For BK product type, enrich with accountType and accountTypeOfBook from bulk inquiry
            if (productType == ProductType.BK && !filteredItems.isEmpty()) {
                enrichWithBulkAccountInquiry(filteredItems, accountRelationList);
            }

            // Build response data
            AccountListDataDto data = AccountListDataDto.builder()
                    .totalRecord(accountRelationList.size())
                    .accountRelation(accountRelationList)
                    .build();

            // Use standard response wrapper
            StandardResponseDto<AccountListDataDto> response =
                    StandardResponseDto.success(data, "Account list retrieved successfully");

            return ResponseEntity.ok()
                    .header(CORRELATION_ID, correlationId)
                    .body(response);

        } catch (Exception ex) {
            log.error("Failed to get customer account list: {}", ex.getMessage(), ex);

            // Return error with empty data using standard error code GEN-E00006
            AccountListDataDto emptyData = AccountListDataDto.builder()
                    .totalRecord(0)
                    .accountRelation(List.of())
                    .build();

            StandardResponseDto<AccountListDataDto> errorResponse =
                    StandardResponseDto.error(
                            ProductHoldingConstants.ERROR_CODE_GEN_E00006,
                            ProductHoldingConstants.ERROR_MSG_UNABLE_TO_LOAD,
                            emptyData);

            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }

    /**
     * Get banking account list (BK product type).
     * Returns banking account details with accountType and accountTypeOfBook set to "-".
     * Note: No longer calls bulkAccountInquiry.
     *
     * @param request Request containing customerKey
     * @return ResponseEntity with StandardResponseDto containing banking account list
     */
    public Response<BankingAccountListDataDto> getBankingAccountList(
            CustomerProfileSimpleRequest request) {

        List<String> applicationTypes = mapProductTypeToApplicationTypes(ProductType.BK);

        try {
            log.info("🔍 Step 1: Calling Integration Service - customerKey={}, applicationTypes={}",
                    request.getCustomerKey(), applicationTypes);

            ResponseEntity<Map<String, Object>> integrationResponse =
                    integrationCustomerProfileService.queryAccountRelations(
                            request.getCustomerKey(),
                            applicationTypes
                    );

            log.info("🔍 Step 2: Integration Response Status = {}", integrationResponse.getStatusCode());

            Map<String, Object> body = integrationResponse.getBody();
            log.info("🔍 Step 3: Integration Response Body = {}", body);

            if (body == null) {
                log.error("🔍 ERROR: Integration response body is NULL!");
                throw new IllegalArgumentException("Integration service returned null body");
            }

            log.info("🔍 Step 4: Calling extractAccountRelationItems...");
            List<Map<String, Object>> items = profileQueryValidator.extractAccountRelationItems(body);
            log.info("🔍 Step 5: Extracted Items Count = {}, Items = {}", items.size(), items);

            // Filter accounts based on BK product type rules
            List<Map<String, Object>> filteredItems = items.stream()
                    .filter(item -> {
                        boolean matches = profileQueryValidator.isAccountMatchProduct(item, ProductType.BK);
                        log.info("🔍 DEBUG - Item: {} -> Matches BK: {}", item, matches);
                        return matches;
                    })
                    .toList();
            log.info("🔍 DEBUG - Filtered Items Count: {}", filteredItems.size());

            // Transform to Banking DTO (use ArrayList for mutable list)
            List<BankingAccountRelationDto> accountRelationList = filteredItems.stream()
                    .map(this::transformToBankingAccountRelationDto)
                    .collect(java.util.stream.Collectors.toCollection(java.util.ArrayList::new));

            // Enrich with bulk account inquiry to get accountType and accountTypeOfBook
            if (!filteredItems.isEmpty()) {
                enrichBankingAccountsWithBulkInquiry(filteredItems, accountRelationList);
            }

            // Enrich with product names from product-service
            if (!filteredItems.isEmpty()) {
                enrichBankingAccountsWithProductNames(accountRelationList, filteredItems);
            }

            // Sort accounts by accountNumber DESC, then by accountStatus priority
            accountRelationList.sort(this::compareBankingAccounts);

            // Build response data
            BankingAccountListDataDto data = BankingAccountListDataDto.builder()
                    .totalRecord(accountRelationList.size())
                    .accountRelation(accountRelationList)
                    .build();

            // Return Response using shared library format
            return Response.success(
                    ResponseStatus.SUCCESS.getCode(),
                    "Banking account list retrieved successfully",
                    data
            );

        } catch (Exception ex) {
            log.error("Error in getBankingAccountList for customerKey: {}",
                    request.getCustomerKey(), ex);

            // Let GlobalExceptionHandler handle it automatically
            // Will auto-map to appropriate HTTP status based on error type
            throw new SonicException(
                    ResponseStatus.ERROR,
                    "Failed to retrieve banking account list",
                    ex
            );
        }
    }

    /**
     * Get auto finance account list (AF product type).
     * Returns auto finance account details.
     *
     * @param request Request containing customerKey
     * @return ResponseEntity with StandardResponseDto containing auto finance account list
     */
    public ResponseEntity<StandardResponseDto<AutoFinanceAccountListDataDto>> getAutoFinanceAccountList(
            CustomerProfileSimpleRequest request) {

        List<String> applicationTypes = mapProductTypeToApplicationTypes(ProductType.AF);

        try {
            ResponseEntity<Map<String, Object>> integrationResponse =
                    integrationCustomerProfileService.queryAccountRelations(
                            request.getCustomerKey(),
                            applicationTypes
                    );

            String correlationId = integrationResponse.getHeaders().getFirst(CORRELATION_ID);
            Map<String, Object> body = integrationResponse.getBody();

            List<Map<String, Object>> items = profileQueryValidator.extractAccountRelationItems(body);

            log.info("🔍 DEBUG - Extracted {} items from integration response", items.size());

            // Filter accounts based on AF product type rules
            List<Map<String, Object>> filteredItems = items.stream()
                    .filter(item -> {
                        boolean matches = profileQueryValidator.isAccountMatchProduct(item, ProductType.AF);
                        if (!matches) {
                            log.warn(LOG_DEBUG_ITEM_FILTERED,
                                    item.get(ACC_APPLICATION_IDENTIFICATION_CODE),
                                    ((Map<?, ?>) item.get(PRODUCT_LINKAGE)).get(ACCOUNT_NUMBER));
                        }
                        return matches;
                    })
                    .toList();

            log.info(LOG_DEBUG_AFTER_FILTERING,
                    filteredItems.size(), items.size());

            // Transform to Auto Finance DTO and sort by accountNumber (ascending)
            List<AutoFinanceAccountRelationDto> accountRelationList = filteredItems.stream()
                    .map(this::transformToAutoFinanceAccountRelationDto)
                    .sorted((a, b) -> a.getAccountNumber().compareTo(b.getAccountNumber()))
                    .toList();

            // Note: No longer enriching with hire purchase details per new requirement
            // Fields (accountTypeDescription, termPaymentAndIncreasement, totalDaysPastDue)
            // will remain as default "-" values set in transformToAutoFinanceAccountRelationDto

            // Build response data
            AutoFinanceAccountListDataDto data = AutoFinanceAccountListDataDto.builder()
                    .totalRecord(accountRelationList.size())
                    .accountRelation(accountRelationList)
                    .build();

            // Use standard response wrapper
            StandardResponseDto<AutoFinanceAccountListDataDto> response =
                    StandardResponseDto.success(data, "Auto finance account list retrieved successfully");

            return ResponseEntity.ok()
                    .header(CORRELATION_ID, correlationId)
                    .body(response);

        } catch (Exception ex) {
            log.error("Failed to get auto finance account list: {}", ex.getMessage(), ex);

            // Return error with empty data using standard error code GEN-E00006
            AutoFinanceAccountListDataDto emptyData = AutoFinanceAccountListDataDto.builder()
                    .totalRecord(0)
                    .accountRelation(List.of())
                    .build();

            StandardResponseDto<AutoFinanceAccountListDataDto> errorResponse =
                    StandardResponseDto.error(
                            ProductHoldingConstants.ERROR_CODE_GEN_E00006,
                            ProductHoldingConstants.ERROR_MSG_UNABLE_TO_LOAD,
                            emptyData);

            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }

    @SuppressWarnings("unchecked")
    private void enrichWithBulkAccountInquiry(
            List<Map<String, Object>> filteredItems,
            List<AccountRelationDto> accountRelationList) {

        try {
            List<Map<String, Object>> bulkInquiryPayload = buildBulkInquiryPayload(filteredItems);
            if (bulkInquiryPayload.isEmpty()) {
                log.warn("No valid accounts to query in bulk inquiry");
                return;
            }

            Map<String, Map<String, Object>> bulkDataMap = fetchBulkInquiryData(bulkInquiryPayload);
            if (bulkDataMap.isEmpty()) {
                log.warn("Bulk inquiry returned no results");
                return;
            }

            enrichAccountRelationDtos(accountRelationList, bulkDataMap);
            log.info("Successfully enriched {} accounts with bulk inquiry data", accountRelationList.size());

        } catch (Exception ex) {
            log.error("Failed to enrich with bulk account inquiry, continuing without enrichment: {}",
                    ex.getMessage(), ex);
            // Don't fail the entire request, just continue without enrichment
        }
    }

    /**
     * Build bulk inquiry payload from filtered items.
     */
    private List<Map<String, Object>> buildBulkInquiryPayload(List<Map<String, Object>> filteredItems) {
        List<Map<String, Object>> payload = new ArrayList<>();
        for (Map<String, Object> item : filteredItems) {
            Map<String, Object> accountMap = extractBulkInquiryFields(item);
            if (accountMap != null) {
                payload.add(accountMap);
            }
        }
        return payload;
    }

    /**
     * Fetch bulk inquiry data and return as map.
     */
    @SuppressWarnings("unchecked")
    private Map<String, Map<String, Object>> fetchBulkInquiryData(List<Map<String, Object>> payload) {
        ResponseEntity<List<Map<String, Object>>> bulkResponse =
                integrationCustomerProfileService.bulkAccountInquiry(payload);

        List<Map<String, Object>> bulkItems = bulkResponse.getBody();
        if (bulkItems == null || bulkItems.isEmpty()) {
            return new HashMap<>();
        }

        // Create map for quick lookup: accountNumber -> bulk inquiry result
        Map<String, Map<String, Object>> bulkDataMap = new HashMap<>();
        for (Map<String, Object> bulkItem : bulkItems) {
            String accountNumber = (String) bulkItem.get(ACCOUNT_NUMBER);
            if (accountNumber != null) {
                bulkDataMap.put(accountNumber, bulkItem);
            }
        }
        return bulkDataMap;
    }

    /**
     * Enrich account relation DTOs with bulk inquiry data.
     */
    private void enrichAccountRelationDtos(
            List<AccountRelationDto> accountRelationList,
            Map<String, Map<String, Object>> bulkDataMap) {

        for (AccountRelationDto dto : accountRelationList) {
            Map<String, Object> bulkData = bulkDataMap.get(dto.getAccountNumber());
            if (bulkData != null) {
                enrichSingleDto(dto, bulkData);
            } else {
                setDefaultDtoValues(dto);
            }
        }
    }

    /**
     * Enrich single DTO with bulk data.
     */
    private void enrichSingleDto(AccountRelationDto dto, Map<String, Object> bulkData) {
        Object accountType = bulkData.get(ACCOUNT_TYPE);
        dto.setAccountType(accountType != null ? accountType.toString() : "-");

        Object accountProdCode = bulkData.get(FIELD_ACCOUNT_PROD_CODE);
        dto.setAccountTypeOfBook(accountProdCode != null ? accountProdCode.toString() : "-");
    }

    /**
     * Set default values for DTO when no bulk data is available.
     */
    private void setDefaultDtoValues(AccountRelationDto dto) {
        dto.setAccountType("-");
        dto.setAccountTypeOfBook("-");
    }

    /**
     * Enrich banking account DTOs with data from bulk account inquiry.
     * This method is specifically for BankingAccountRelationDto.
     */
    @SuppressWarnings("unchecked")
    private void enrichBankingAccountsWithBulkInquiry(
            List<Map<String, Object>> filteredItems,
            List<BankingAccountRelationDto> accountRelationList) {

        try {
            List<Map<String, Object>> bulkInquiryPayload = buildBulkInquiryPayload(filteredItems);
            if (bulkInquiryPayload.isEmpty()) {
                log.warn("No valid accounts to query in bulk inquiry");
                return;
            }

            Map<String, Map<String, Object>> bulkDataMap = fetchBulkInquiryData(bulkInquiryPayload);
            if (bulkDataMap.isEmpty()) {
                log.warn("Bulk inquiry returned no results");
                return;
            }

            enrichBankingAccountRelationDtos(accountRelationList, bulkDataMap);
            log.info("Successfully enriched {} banking accounts with bulk inquiry data", accountRelationList.size());

        } catch (Exception ex) {
            log.error("Failed to enrich banking accounts with bulk account inquiry, continuing without enrichment: {}",
                    ex.getMessage(), ex);
            // Don't fail the entire request, just continue without enrichment
        }
    }

    /**
     * Enrich banking account relation DTOs with bulk inquiry data.
     */
    private void enrichBankingAccountRelationDtos(
            List<BankingAccountRelationDto> accountRelationList,
            Map<String, Map<String, Object>> bulkDataMap) {

        for (BankingAccountRelationDto dto : accountRelationList) {
            Map<String, Object> bulkData = bulkDataMap.get(dto.getAccountNumber());
            if (bulkData != null) {
                enrichSingleBankingDto(dto, bulkData);
            } else {
                setDefaultBankingDtoValues(dto);
            }
        }
    }

    /**
     * Enrich single banking DTO with bulk data.
     */
    private void enrichSingleBankingDto(BankingAccountRelationDto dto, Map<String, Object> bulkData) {
        Object accountType = bulkData.get(ACCOUNT_TYPE);
        dto.setAccountType(accountType != null ? accountType.toString() : "-");

        Object accountProdCode = bulkData.get(FIELD_ACCOUNT_PROD_CODE);
        dto.setAccountTypeOfBook(accountProdCode != null ? accountProdCode.toString() : "-");
    }

    /**
     * Set default values for banking DTO when no bulk data is available.
     */
    private void setDefaultBankingDtoValues(BankingAccountRelationDto dto) {
        dto.setAccountType("-");
        dto.setAccountTypeOfBook("-");
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> extractBulkInquiryFields(Map<String, Object> item) {
        Object productLinkageObj = item.get(PRODUCT_LINKAGE);
        if (!(productLinkageObj instanceof Map)) {
            return null;
        }

        Map<String, Object> productLinkage = (Map<String, Object>) productLinkageObj;
        Object accountNumber = productLinkage.get(ACCOUNT_NUMBER);
        Object accountCurrency = productLinkage.get(FIELD_ACCOUNT_CURRENCY);

        if (accountNumber == null) {
            return null;
        }

        Map<String, Object> bulkInquiryItem = new HashMap<>();
        bulkInquiryItem.put(ACCOUNT_NUMBER, accountNumber.toString());
        bulkInquiryItem.put("currency", accountCurrency != null ? accountCurrency.toString() : "764");
        bulkInquiryItem.put("bankCode", "14");

        return bulkInquiryItem;
    }

    @SuppressWarnings("unchecked")
    private AccountRelationDto transformToAccountRelationDto(Map<String, Object> item) {
        String applicationCode = extractApplicationCode(item);
        AccountFields fields = extractAccountFieldsFromProductLinkage(item);

        return AccountRelationDto.builder()
                .applicationCode(applicationCode)
                .accountNumber(fields.accountNumber)
                .accountName(fields.accountName)
                .accountStatus(fields.accountStatus)
                .accountBranchCode(fields.accountBranchCode)
                .accountCardRef(fields.accountCardRef)
                .accountType("-")
                .accountTypeOfBook("-")
                .build();
    }

    /**
     * Extract application code from item.
     */
    private String extractApplicationCode(Map<String, Object> item) {
        Object appIdObj = item.get(ACC_APPLICATION_IDENTIFICATION_CODE);
        return (appIdObj != null && !appIdObj.toString().trim().isEmpty())
                ? appIdObj.toString()
                : "-";
    }

    /**
     * Extract account fields from productLinkage.
     */
    @SuppressWarnings("unchecked")
    private AccountFields extractAccountFieldsFromProductLinkage(Map<String, Object> item) {
        Object productLinkageObj = item.get(PRODUCT_LINKAGE);
        if (!(productLinkageObj instanceof Map)) {
            return new AccountFields("-", "-", "-", "-", "-");
        }

        Map<String, Object> productLinkage = (Map<String, Object>) productLinkageObj;

        String accountNumber = extractFieldValue(productLinkage, ACCOUNT_NUMBER);
        String accountName = extractFieldValue(productLinkage, ACCOUNT_NAME);
        String accountStatus = extractFieldValue(productLinkage, ACCOUNT_STATUS);
        String accountBranchCode = extractFieldValue(productLinkage, "accountBranchCode");
        String accountCardRef = extractFieldValue(productLinkage, "accountCardRef");

        return new AccountFields(accountNumber, accountName, accountStatus, accountBranchCode, accountCardRef);
    }

    /**
     * Extract field value from map, return "-" if null or empty.
     */
    private String extractFieldValue(Map<String, Object> map, String key) {
        Object value = map.get(key);
        return (value != null && !value.toString().trim().isEmpty())
                ? value.toString()
                : "-";
    }

    /**
     * Helper record to hold account fields.
     */
    private record AccountFields(
            String accountNumber,
            String accountName,
            String accountStatus,
            String accountBranchCode,
            String accountCardRef
    ) {}

    /**
     * Bulk account inquiry for deposit accounts.
     * Queries multiple accounts in a single request.
     *
     * @param request Request containing list of accounts
     * @return ResponseEntity with StandardResponseDto containing account inquiry results
     */
    public ResponseEntity<StandardResponseDto<Map<String, Object>>> bulkAccountInquiry(
            BulkAccountInquiryRequest request) {

        try {
            // Transform DTO to integration-service format
            List<Map<String, Object>> accountsPayload = new ArrayList<>();
            for (BulkAccountInquiryRequest.AccountInquiryItem item : request.getAccounts()) {
                Map<String, Object> accountMap = new HashMap<>();
                accountMap.put(ACCOUNT_NUMBER, item.getAccountNumber());
                accountMap.put("currency", item.getCurrency());
                accountMap.put("bankCode", item.getBankCode());
                accountsPayload.add(accountMap);
            }

            ResponseEntity<List<Map<String, Object>>> integrationResponse =
                    integrationCustomerProfileService.bulkAccountInquiry(accountsPayload);

            String correlationId = integrationResponse.getHeaders().getFirst(CORRELATION_ID);
            List<Map<String, Object>> accounts = integrationResponse.getBody();

            // Build response data
            Map<String, Object> data = new HashMap<>();
            data.put("accounts", accounts);
            data.put(TOTAL_COUNT, accounts != null ? accounts.size() : 0);

            // Use standard response wrapper
            StandardResponseDto<Map<String, Object>> response =
                    StandardResponseDto.success(data, "Bulk account inquiry retrieved successfully");

            return ResponseEntity.ok()
                    .header(CORRELATION_ID, correlationId)
                    .body(response);

        } catch (Exception ex) {
            log.error("Failed to get bulk account inquiry: {}", ex.getMessage(), ex);

            // Return error with empty data
            Map<String, Object> emptyData = new HashMap<>();
            emptyData.put("accounts", List.of());
            emptyData.put(TOTAL_COUNT, 0);

            StandardResponseDto<Map<String, Object>> errorResponse =
                    StandardResponseDto.error("500",
                            "Failed to retrieve bulk account inquiry: " + ex.getMessage(),
                            emptyData);

            return ResponseEntity.ok(errorResponse);
        }
    }

    /**
     * Transform integration-service account item to BankingAccountRelationDto.
     * Uses raw accountStatus from integration-service.
     * Maps accountSubStatus using enum_product_holding table.
     */
    @SuppressWarnings("unchecked")
    private BankingAccountRelationDto transformToBankingAccountRelationDto(Map<String, Object> item) {
        String applicationCode = "-";
        String accountNumber = "-";
        String accountName = "-";
        String accountStatus = "-";
        String accountSubStatus = "-";
        String accountBranchCode = "-";

        // Load mapping from database for accountSubStatus only
        Map<String, String> subStatusMapping = loadBankSubStatusMapping();

        // Extract applicationCode
        Object appIdObj = item.get(ACC_APPLICATION_IDENTIFICATION_CODE);
        if (appIdObj != null && !appIdObj.toString().trim().isEmpty()) {
            applicationCode = appIdObj.toString();
        }


        // Extract from productLinkage
        Object productLinkageObj = item.get(PRODUCT_LINKAGE);
        if (productLinkageObj instanceof Map) {
            Map<String, Object> productLinkage = (Map<String, Object>) productLinkageObj;

            Object accNum = productLinkage.get(ACCOUNT_NUMBER);
            if (accNum != null && !accNum.toString().trim().isEmpty()) {
                accountNumber = accNum.toString();
            }

            Object accName = productLinkage.get(ACCOUNT_NAME);
            if (accName != null && !accName.toString().trim().isEmpty()) {
                accountName = accName.toString();
            }

            // Extract raw status from integration-service and use as-is
            // (Status mapping is currently disabled)
            Object accStatus = productLinkage.get(ACCOUNT_STATUS);
            if (accStatus != null && !accStatus.toString().trim().isEmpty()) {
                String rawStatus = accStatus.toString();

                // Use raw status directly for accountStatus (no mapping)
                accountStatus = rawStatus;

                // Map accountSubStatus: NORMAL -> "Normal (ปกติ)" from Banking_Account_Sub_Status
                accountSubStatus = subStatusMapping.getOrDefault(rawStatus, "-");
            }

            Object branchCode = productLinkage.get("accountBranchCode");
            if (branchCode != null && !branchCode.toString().trim().isEmpty()) {
                accountBranchCode = branchCode.toString();
            }
        }

        return BankingAccountRelationDto.builder()
                .applicationCode(applicationCode)
                .accountNumber(accountNumber)
                .accountName(accountName)
                .accountStatus(accountStatus)
                .accountSubStatus(accountSubStatus)
                .accountBranchCode(accountBranchCode)
                .accountType("-")
                .accountTypeOfBook("-")
                .build();
    }

    /**
     * Transform integration-service account item to AutoFinanceAccountRelationDto.
     * Enriches accountTypeDescription using ProductNameMapper.
     * Maps accountStatus, mainStatus, and displayLabel using Loan_Status / Loan_Sub_Status from database.
     */
    @SuppressWarnings("unchecked")
    private AutoFinanceAccountRelationDto transformToAutoFinanceAccountRelationDto(Map<String, Object> item) {
        String applicationCode = "-";
        String accountNumber = "-";
        String accountStatus = "-";
        String mainStatus = "-";
        String displayLabel = "-";
        String accountProductCode = null;

        // Extract applicationCode
        Object appIdObj = item.get(ACC_APPLICATION_IDENTIFICATION_CODE);
        if (appIdObj != null && !appIdObj.toString().trim().isEmpty()) {
            applicationCode = appIdObj.toString();
        }

        // Extract from productLinkage
        Object productLinkageObj = item.get(PRODUCT_LINKAGE);
        if (productLinkageObj instanceof Map) {
            Map<String, Object> productLinkage = (Map<String, Object>) productLinkageObj;

            Object accNum = productLinkage.get(ACCOUNT_NUMBER);
            if (accNum != null && !accNum.toString().trim().isEmpty()) {
                accountNumber = accNum.toString();
            }

            // Extract raw status from integration-service
            Object accStatus = productLinkage.get(ACCOUNT_STATUS);
            if (accStatus != null && !accStatus.toString().trim().isEmpty()) {
                String rawStatus = accStatus.toString();

                // Keep original raw status in accountStatus
                accountStatus = rawStatus;

                // Map mainStatus from Loan_Status (e.g., "ACTIVE" -> "Active")
                Map<String, String> statusMapping = loadLoanStatusMapping();
                mainStatus = statusMapping.getOrDefault(rawStatus.replace(" ", ""), "-");

                // Map displayLabel from Loan_Sub_Status (e.g., "ACTIVE" -> "Active (ปกติ)")
                Map<String, String> subStatusMapping = loadLoanSubStatusMapping();
                displayLabel = subStatusMapping.getOrDefault(rawStatus.replace(" ", ""), "-");
            }

            // Extract accountProductCode for enrichment
            Object productCodeObj = productLinkage.get(ACCOUNT_PRODUCT_CODE);
            if (productCodeObj != null && !productCodeObj.toString().trim().isEmpty()) {
                accountProductCode = productCodeObj.toString();
            }
        }

        // Enrich accountTypeDescription using ProductNameMapper
        String accountTypeDescription = getAccountTypeDescription(item, accountProductCode);

        return AutoFinanceAccountRelationDto.builder()
                .applicationCode(applicationCode)
                .accountNumber(accountNumber)
                .accountStatus(accountStatus)
                .mainStatus(mainStatus)
                .displayLabel(displayLabel)
                .accountTypeDescription(accountTypeDescription)
                .termPaymentAndIncreasement("-")
                .totalDaysPastDue("-")
                .build();
    }

    /**
     * Get account type description for AF using ProductNameMapper.
     * Converts accountProductCode to accountType and calls mapper.
     *
     * @param item Account relation item with productLinkage
     * @param accountProductCode Product code from accountProductCode field (e.g., "HP", "FL")
     * @return Localized account type description or "-" if mapper fails
     */
    @SuppressWarnings("unchecked")
    private String getAccountTypeDescription(Map<String, Object> item, String accountProductCode) {
        if (accountProductCode == null || accountProductCode.trim().isEmpty()) {
            log.debug("accountProductCode is null or empty, cannot get accountTypeDescription");
            return "-";
        }

        try {
            // Prepare rawData with productLinkage containing accountType
            Map<String, Object> rawData = new HashMap<>();
            Object productLinkageObj = item.get(PRODUCT_LINKAGE);

            if (productLinkageObj instanceof Map) {
                Map<String, Object> productLinkage = new HashMap<>((Map<String, Object>) productLinkageObj);

                // Add accountType field that LoanProductNameEnricher expects
                // Use accountProductCode as accountType (e.g., "HP", "FL")
                productLinkage.put(ACCOUNT_TYPE, accountProductCode);

                rawData.put(PRODUCT_LINKAGE, productLinkage);

                // Call ProductNameMapper to get product names
                ProductNameLookupResponse productNames = productNameMapper.getProductName(rawData, "LN");

                if (productNames != null && productNames.getProductName() != null) {
                    log.debug("Retrieved AF account type description: {} -> {}",
                            accountProductCode, productNames.getProductName());
                    return productNames.getProductName();
                } else {
                    log.debug("No product name found for accountType: {}", accountProductCode);
                    return "-";
                }
            } else {
                log.warn("productLinkage is not a Map, cannot get accountTypeDescription");
                return "-";
            }

        } catch (Exception e) {
            log.error("Failed to get accountTypeDescription for accountProductCode: {}",
                    accountProductCode, e);
            return "-";
        }
    }

    /**
     * Reconstruct the response body with filtered items.
     * Supports both old and new structure from integration service.
     * Updates totalCount to match the filtered items count.
     *
     * @param originalBody Original response body from integration service
     * @param filteredItems Filtered list of account relation items
     * @return New response body with filtered items and updated totalCount
     */
    @SuppressWarnings("unchecked")
    private Map<String, Object> reconstructResponseWithFilteredItems(
            Map<String, Object> originalBody,
            List<Map<String, Object>> filteredItems) {

        if (originalBody == null) {
            return Map.of();
        }

        int filteredCount = filteredItems.size();

        // Create a mutable copy of the original body
        Map<String, Object> newBody = new HashMap<>(originalBody);

        Object dataObj = newBody.get("data");
        if (!(dataObj instanceof Map)) {
            return newBody;
        }

        Map<String, Object> data = new HashMap<>((Map<String, Object>) dataObj);

        // Try new structure first: data → resource → data array
        Object resourceObj = data.get(RESOURCE);
        if (resourceObj instanceof Map) {
            Map<String, Object> resource = new HashMap<>((Map<String, Object>) resourceObj);
            resource.put("data", filteredItems);
            resource.put(TOTAL_COUNT, filteredCount);  // Update totalCount
            data.put(RESOURCE, resource);
            newBody.put("data", data);
            return newBody;
        }

        // Try old structure: data → getCustomerProfile → data → resource → data array
        Object profileNode = data.get(ACCOUNT_RELATION);
        if (!(profileNode instanceof Map)) {
            profileNode = data.get("getCustomerProfile");
        }

        if (profileNode instanceof Map) {
            Map<String, Object> profile = new HashMap<>((Map<String, Object>) profileNode);
            Object profileDataObj = profile.get("data");

            if (profileDataObj instanceof Map) {
                Map<String, Object> profileData = new HashMap<>((Map<String, Object>) profileDataObj);
                Object profileResourceObj = profileData.get(RESOURCE);

                if (profileResourceObj instanceof Map) {
                    Map<String, Object> profileResource = new HashMap<>((Map<String, Object>) profileResourceObj);
                    profileResource.put("data", filteredItems);
                    profileResource.put(TOTAL_COUNT, filteredCount);  // Update totalCount
                    profileData.put(RESOURCE, profileResource);
                    profile.put("data", profileData);

                    // Put back with the correct key
                    if (data.containsKey(ACCOUNT_RELATION)) {
                        data.put(ACCOUNT_RELATION, profile);
                    } else {
                        data.put("getCustomerProfile", profile);
                    }
                    newBody.put("data", data);
                }
            }
        }

        return newBody;
    }

    /**
     * Extract totalCount from response body.
     * Supports the structure: data → resource → totalCount
     *
     * @param body Response body map
     * @return totalCount value, or 0 if not found
     */
    @SuppressWarnings("unchecked")
    private int extractTotalCount(Map<String, Object> body) {
        if (body == null) {
            return 0;
        }

        try {
            Object dataObj = body.get("data");
            if (!(dataObj instanceof Map)) {
                return 0;
            }

            Map<String, Object> data = (Map<String, Object>) dataObj;
            Object resourceObj = data.get(RESOURCE);
            if (!(resourceObj instanceof Map)) {
                return 0;
            }

            Map<String, Object> resource = (Map<String, Object>) resourceObj;
            Object totalCountObj = resource.get(TOTAL_COUNT);

            if (totalCountObj instanceof Number number) {
                return number.intValue();
            }

            return 0;
        } catch (Exception e) {
            log.warn("Failed to extract totalCount from response body: {}", e.getMessage());
            return 0;
        }
    }

    private List<String> mapProductTypeToApplicationTypes(ProductType productType) {
        if (productType == null) {
            // No productType specified -> count all types
            return List.of();
        }

        // Map ProductType -> CTMD ACC_APP_ID codes
        // AF  -> AL (Auto Loan)
        // BK  -> IM, ST, EC, OE (Investment Management + Saving/Time Deposit + Easy Cheque + Other)
        // HL  -> AL (Auto Loan - same as AF, but filtered by account prefix 478)
        // SSME -> AL (SME Loan - filtered by Product_Code_SSME: 470,479,481,483,485,495)
        // CL  -> AL (Commercial Loan - filtered by Product_Code_CL: 475,496)
        // PL  -> AL (Personal Loan)
        return switch (productType) {
            case AF -> List.of("AL");
            case BK -> List.of("IM", "ST", "EC", "OE");
            case CL -> List.of("AL");  // Commercial Loan
            case HL -> List.of("AL");  // Same as AF, filtered by different prefix (478 vs 498)
            case PL -> List.of("AL");  // Personal Loan
            case SSME -> List.of("AL");  // SME Loan, filtered by prefix 470
            case SCB_EASY -> List.of("EN");
            case SCB_CONNECT -> List.of("SG");
            case PROMPTPAY -> List.of("SG");
            case POINTX -> List.of("SG");
            case PLANET_PLUS_EWALLET -> List.of("SG");
            case SCB_BUSINESS_ANYWHERE -> List.of("SG");
        };
    }

    /**
     * Compare two banking accounts for sorting.
     * Sort order:
     * 1. Account Number DESC (high to low)
     * 2. Account Status by priority
     */
    private int compareBankingAccounts(BankingAccountRelationDto a, BankingAccountRelationDto b) {
        // First: sort by accountNumber DESC (nulls last)
        String accountNumberA = a.getAccountNumber();
        String accountNumberB = b.getAccountNumber();

        if (accountNumberA == null && accountNumberB == null) {
            return compareByStatusPriority(a.getAccountStatus(), b.getAccountStatus());
        }
        if (accountNumberA == null) {
            return 1; // nulls last
        }
        if (accountNumberB == null) {
            return -1; // nulls last
        }

        int accountNumberComparison = accountNumberB.compareTo(accountNumberA); // DESC: B compared to A
        if (accountNumberComparison != 0) {
            return accountNumberComparison;
        }

        // Second: sort by accountStatus priority
        return compareByStatusPriority(a.getAccountStatus(), b.getAccountStatus());
    }

    /**
     * Compare account statuses by priority order.
     * Priority Order:
     * 1. NORMAL
     * 2. DORMNT
     * 3. C ONLY
     * 4. UNR CD
     * 5. FROZEN
     * 6. CLOSED
     * 7. TRMNTD
     * 8. PURGED
     * 9. - (null or empty)
     */
    private int compareByStatusPriority(String statusA, String statusB) {
        int priorityA = getStatusPriority(statusA);
        int priorityB = getStatusPriority(statusB);
        return Integer.compare(priorityA, priorityB);
    }

    /**
     * Get priority order for account status.
     * Lower number = higher priority (appears first)
     */
    private int getStatusPriority(String status) {
        if (status == null || status.trim().isEmpty() || "-".equals(status)) {
            return PRIORITY_UNKNOWN; // lowest priority
        }

        return switch (status.trim().toUpperCase()) {
            case "NORMAL" -> PRIORITY_NORMAL;
            case "DORMNT" -> PRIORITY_DORMNT;
            case "C ONLY" -> PRIORITY_C_ONLY;
            case "UNR CD" -> PRIORITY_UNR_CD;
            case "FROZEN" -> PRIORITY_FROZEN;
            case "CLOSED" -> PRIORITY_CLOSED;
            case "TRMNTD" -> PRIORITY_TRMNTD;
            case "PURGED" -> PRIORITY_PURGED;
            default -> PRIORITY_UNKNOWN; // unknown status -> lowest priority
        };
    }

    /**
     * Load Banking Account Sub Status mapping from database (category = Banking_Account_Sub_Status).
     * Maps status code to value_th (e.g., "NORMAL" -> "Normal (ปกติ)").
     * The name format in DB is "Banking_Account_Sub_Status_NORMAL", we extract the code part.
     */
    private Map<String, String> loadBankSubStatusMapping() {
        if (bankSubStatusMapping == null) {
            List<EnumProductHolding> subStatuses =
                    enumProductHoldingRepository.findByCategoryAndIsActiveTrue(BANKING_ACCOUNT_SUB_STATUS_CATEGORY);

            bankSubStatusMapping = subStatuses.stream()
                    .collect(Collectors.toMap(
                            // Extract status code from name (e.g., "Banking_Account_Sub_Status_NORMAL" -> "NORMAL")
                            e -> e.getName().replace("Banking_Account_Sub_Status_", ""),
                            EnumProductHolding::getValueTh
                    ));

            log.info("Loaded {} banking account sub status mappings from database", bankSubStatusMapping.size());
        }
        return bankSubStatusMapping;
    }

    /**
     * Load Loan Status mapping from database (category = Loan_Status).
     * Maps raw loan status code from CBSLD (e.g., "ACTIVE", "PURGED") to display value (e.g., "Active").
     */
    private Map<String, String> loadLoanStatusMapping() {
        if (loanStatusMapping == null) {
            List<EnumProductHolding> statuses =
                    enumProductHoldingRepository.findByCategoryAndIsActiveTrue(LOAN_STATUS_CATEGORY);

            loanStatusMapping = statuses.stream()
                    .collect(Collectors.toMap(
                            // Extract status code from name (e.g., "Loan_Status_ACTIVE" -> "ACTIVE")
                            e -> e.getName().replace("Loan_Status_", ""),
                            EnumProductHolding::getValueTh
                    ));

            log.info("Loaded {} loan status mappings from database", loanStatusMapping.size());
        }
        return loanStatusMapping;
    }

    /**
     * Load Loan Sub Status mapping from database (category = Loan_Sub_Status).
     * Maps raw loan status code from CBSLD to combined English/Thai description
     * (e.g., "ACTIVE" -> "Active (ปกติ)").
     */
    private Map<String, String> loadLoanSubStatusMapping() {
        if (loanSubStatusMapping == null) {
            List<EnumProductHolding> subStatuses =
                    enumProductHoldingRepository.findByCategoryAndIsActiveTrue(LOAN_SUB_STATUS_CATEGORY);

            loanSubStatusMapping = subStatuses.stream()
                    .collect(Collectors.toMap(
                            // Extract status code from name (e.g., "Loan_Sub_Status_ACTIVE" -> "ACTIVE")
                            e -> e.getName().replace("Loan_Sub_Status_", ""),
                            e -> e.getValueEn() + " (" + e.getValueTh() + ")"
                    ));

            log.info("Loaded {} loan sub status mappings from database", loanSubStatusMapping.size());
        }
        return loanSubStatusMapping;
    }

    /**
     * Get home loan account list (HL product type).
     * Returns home loan account details with filtering.
     *
     * @param request Request containing customerKey
     * @return ResponseEntity with StandardResponseDto containing home loan account list
     */
    public ResponseEntity<StandardResponseDto<HomeLoanAccountListDataDto>> getHomeLoanAccountList(
            CustomerProfileSimpleRequest request) {

        // Step 1: Check permission
        homeLoanPermissionService.checkAccountListPermission();

        List<String> applicationTypes = mapProductTypeToApplicationTypes(ProductType.HL);

        try {
            // Step 1: Get all account relations
            ResponseEntity<Map<String, Object>> integrationResponse =
                    integrationCustomerProfileService.queryAccountRelations(
                            request.getCustomerKey(),
                            applicationTypes
                    );

            Map<String, Object> body = integrationResponse.getBody();

            List<Map<String, Object>> items = profileQueryValidator.extractAccountRelationItems(body);

            log.info("🔍 DEBUG - Extracted {} items from integration response", items.size());

            // Step 2: Filter accounts based on HL product type rules (account starts with "478")
            List<Map<String, Object>> filteredItems = items.stream()
                    .filter(item -> {
                        boolean matches = profileQueryValidator.isAccountMatchProduct(item, ProductType.HL);
                        if (!matches) {
                            log.warn(LOG_DEBUG_ITEM_FILTERED,
                                    item.get(ACC_APPLICATION_IDENTIFICATION_CODE),
                                    ((Map<?, ?>) item.get(PRODUCT_LINKAGE)).get(ACCOUNT_NUMBER));
                        }
                        return matches;
                    })
                    .toList();

            log.info(LOG_DEBUG_AFTER_FILTERING,
                    filteredItems.size(), items.size());

            // Step 3: Extract account numbers
            List<String> accountNumbers = filteredItems.stream()
                    .map(item -> {
                        Map<?, ?> productLinkage = (Map<?, ?>) item.get(PRODUCT_LINKAGE);
                        return (String) productLinkage.get(ACCOUNT_NUMBER);
                    })
                    .filter(java.util.Objects::nonNull)
                    .toList();

            log.info("🔍 DEBUG - Account numbers to query: {}", accountNumbers);

            // Step 4: If no accounts found, return empty list
            if (accountNumbers.isEmpty()) {
                String correlationId = integrationResponse.getHeaders().getFirst(CORRELATION_ID);

                HomeLoanAccountListDataDto emptyData = HomeLoanAccountListDataDto.builder()
                        .totalRecord(0)
                        .loan(List.of())
                        .build();

                StandardResponseDto<HomeLoanAccountListDataDto> response =
                        StandardResponseDto.success(emptyData, "No home loan accounts found");

                return ResponseEntity.ok()
                        .header(CORRELATION_ID, correlationId)
                        .body(response);
            }

            // Step 5: Call integration-service home loan extended info API
            ResponseEntity<Map<String, Object>> homeLoanResponse =
                    integrationCustomerProfileService.queryHomeLoanExtendedInfo(accountNumbers);

            Map<String, Object> homeLoanBody = homeLoanResponse.getBody();

            log.info("🔍 DEBUG - Extended info response body: {}", homeLoanBody);

            // Step 6: Extract and map loan data (merge data from both sources using index-based mapping)
            List<HomeLoanAccountDto> loanList = extractHomeLoanAccounts(
                    homeLoanBody, filteredItems, accountNumbers);

            log.info("🔍 DEBUG - Extracted {} loan accounts after filtering PF11/PV11",
                    loanList.size());

            // Step 7: Build response data
            HomeLoanAccountListDataDto data = HomeLoanAccountListDataDto.builder()
                    .totalRecord(loanList.size())
                    .loan(loanList)
                    .build();

            // Use standard response wrapper
            StandardResponseDto<HomeLoanAccountListDataDto> response =
                    StandardResponseDto.success(data, "Home loan account list retrieved successfully");

            String correlationId = integrationResponse.getHeaders().getFirst(CORRELATION_ID);

            return ResponseEntity.ok()
                    .header(CORRELATION_ID, correlationId)
                    .body(response);

        } catch (Exception ex) {
            log.error("Failed to get home loan account list: {}", ex.getMessage(), ex);

            // Return error with empty data using standard error code GEN-E00006
            HomeLoanAccountListDataDto emptyData = HomeLoanAccountListDataDto.builder()
                    .totalRecord(0)
                    .loan(List.of())
                    .build();

            StandardResponseDto<HomeLoanAccountListDataDto> errorResponse =
                    StandardResponseDto.error(
                            ProductHoldingConstants.ERROR_CODE_GEN_E00006,
                            ProductHoldingConstants.ERROR_MSG_UNABLE_TO_LOAD,
                            emptyData);

            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }

    /**
     * Get SSME loan account list (SSME product type).
     * Returns SSME loan account details.
     *
     * @param request Request containing customerKey
     * @return ResponseEntity with StandardResponseDto containing SSME loan account list
     */
    public ResponseEntity<StandardResponseDto<SsmeLoanAccountListDataDto>> getSsmeLoanAccountList(
            CustomerProfileSimpleRequest request) {

        // Step 1: Check permission
        ssmeLoanPermissionService.checkAccountListPermission();

        List<String> applicationTypes = mapProductTypeToApplicationTypes(ProductType.SSME);

        try {
            // Step 2: Get all account relations
            ResponseEntity<Map<String, Object>> integrationResponse =
                    integrationCustomerProfileService.queryAccountRelations(
                            request.getCustomerKey(),
                            applicationTypes
                    );

            Map<String, Object> body = integrationResponse.getBody();

            List<Map<String, Object>> items = profileQueryValidator.extractAccountRelationItems(body);

            items.forEach(item -> {
                Map<?, ?> productLinkage = (Map<?, ?>) item.get(PRODUCT_LINKAGE);
                log.info("🔍 DEBUG SSME - Item: accountNumber={}, accountName={}",
                        productLinkage.get(ACCOUNT_NUMBER),
                        productLinkage.get(ACCOUNT_NAME));
            });

            // Step 3: Filter accounts based on SSME product type rules (account starts with "470")
            List<Map<String, Object>> filteredItems = items.stream()
                    .filter(item -> {
                        boolean matches = profileQueryValidator.isAccountMatchProduct(item, ProductType.SSME);
                        if (!matches) {
                            log.warn(LOG_DEBUG_ITEM_FILTERED,
                                    item.get(ACC_APPLICATION_IDENTIFICATION_CODE),
                                    ((Map<?, ?>) item.get(PRODUCT_LINKAGE)).get(ACCOUNT_NUMBER));
                        }
                        return matches;
                    })
                    .toList();

            log.info(LOG_DEBUG_AFTER_FILTERING,
                    filteredItems.size(), items.size());

            // Step 4: Extract account numbers
            List<String> accountNumbers = filteredItems.stream()
                    .map(item -> {
                        Map<?, ?> productLinkage = (Map<?, ?>) item.get(PRODUCT_LINKAGE);
                        return (String) productLinkage.get(ACCOUNT_NUMBER);
                    })
                    .filter(java.util.Objects::nonNull)
                    .toList();

            log.info("🔍 DEBUG - Account numbers to query: {}", accountNumbers);

            // Step 5: If no accounts found, return empty list
            if (accountNumbers.isEmpty()) {
                String correlationId = integrationResponse.getHeaders().getFirst(CORRELATION_ID);

                SsmeLoanAccountListDataDto emptyData = SsmeLoanAccountListDataDto.builder()
                        .totalRecord(0)
                        .loan(List.of())
                        .build();

                StandardResponseDto<SsmeLoanAccountListDataDto> response =
                        StandardResponseDto.success(emptyData, "No SSME loan accounts found");

                return ResponseEntity.ok()
                        .header(CORRELATION_ID, correlationId)
                        .body(response);
            }

            // Step 6: Commercial extended info enriches only — CTMD rows still returned if CBSLD fails
            Map<String, Object> ssmeLoanBody = fetchSsmeExtendedInfo(accountNumbers);

            // Step 7: CTMD-first map — always one row per CTMD SSME account; extended info only enriches
            List<SsmeLoanAccountDto> loanList = extractSsmeLoanAccounts(
                    ssmeLoanBody, filteredItems, accountNumbers);

            log.info("🔍 DEBUG - Extracted {} SSME loan accounts (CTMD count={})",
                    loanList.size(), filteredItems.size());

            // Step 8: Build response data
            SsmeLoanAccountListDataDto data = SsmeLoanAccountListDataDto.builder()
                    .totalRecord(loanList.size())
                    .loan(loanList)
                    .build();

            // Use standard response wrapper
            StandardResponseDto<SsmeLoanAccountListDataDto> response =
                    StandardResponseDto.success(data, "SSME loan account list retrieved successfully");

            String correlationId = integrationResponse.getHeaders().getFirst(CORRELATION_ID);

            return ResponseEntity.ok()
                    .header(CORRELATION_ID, correlationId)
                    .body(response);

        } catch (Exception ex) {
            log.error("Failed to get SSME loan account list: {}", ex.getMessage(), ex);

            // Return error with empty data using standard error code GEN-E00006
            SsmeLoanAccountListDataDto emptyData = SsmeLoanAccountListDataDto.builder()
                    .totalRecord(0)
                    .loan(List.of())
                    .build();

            StandardResponseDto<SsmeLoanAccountListDataDto> errorResponse =
                    StandardResponseDto.error(
                            ProductHoldingConstants.ERROR_CODE_GEN_E00006,
                            ProductHoldingConstants.ERROR_MSG_UNABLE_TO_LOAD,
                            emptyData);

            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }

    /**
     * Extract and map SSME loan accounts — CTMD-first.
     *
     * <p>Source of truth is filtered CTMD account relations (same set as totalSSME).
     * Commercial extended info only enriches productName/status when present.
     * If CBSLD fails or omits an account, the row is still returned with defaults ("-").
     *
     * @param responseBody Integration service response body from commercial extended info
     * @param accountRelationItems Filtered CTMD SSME items (drives list size)
     * @param accountNumbers CTMD account numbers in stable order
     * @return One SsmeLoanAccountDto per CTMD account
     */
    @SuppressWarnings("unchecked")
    private List<SsmeLoanAccountDto> extractSsmeLoanAccounts(
            Map<String, Object> responseBody,
            List<Map<String, Object>> accountRelationItems,
            List<String> accountNumbers) {

        // Extended info keyed by accountNumber (preferred) or legacy index fallback
        Map<String, Map<String, Object>> extendedByAccount =
                buildSsmeExtendedInfoByAccount(responseBody, accountNumbers);

        java.util.List<SsmeLoanAccountDto> result = new java.util.ArrayList<>();

        for (Map<String, Object> relationItem : accountRelationItems) {
            SsmeLoanAccountFields accountFields = extractSsmeLoanAccountRelationFields(relationItem);
            String accountNumber = accountFields.accountNumber();

            Map<String, Object> loan = extendedByAccount.get(accountNumber);
            result.add(buildSsmeLoanAccountDto(loan, relationItem));
        }

        return result;
    }

    /**
     * Build accountNumber -> extended-info map from commercial loan response.
     * Prefers response.accountNumber; falls back to request order index for older payloads.
     */
    @SuppressWarnings("unchecked")
    private Map<String, Map<String, Object>> buildSsmeExtendedInfoByAccount(
            Map<String, Object> responseBody,
            List<String> accountNumbers) {

        Map<String, Map<String, Object>> extendedByAccount = new HashMap<>();
        if (responseBody == null) {
            return extendedByAccount;
        }

        Object dataObj = responseBody.get("data");
        if (!(dataObj instanceof List<?> loanListRaw) || loanListRaw.isEmpty()) {
            return extendedByAccount;
        }

        for (int i = 0; i < loanListRaw.size(); i++) {
            Object raw = loanListRaw.get(i);
            if (!(raw instanceof Map<?, ?> rawMap)) {
                continue;
            }
            Map<String, Object> loan = (Map<String, Object>) rawMap;

            String accountNumber = extractFieldValue(loan, ACCOUNT_NUMBER);
            if ("-".equals(accountNumber) || accountNumber == null || accountNumber.isBlank()) {
                // Legacy: align by index when commercial service did not tag accountNumber
                accountNumber = (i < accountNumbers.size()) ? accountNumbers.get(i) : null;
            }

            if (accountNumber != null && !accountNumber.isBlank() && !"-".equals(accountNumber)) {
                extendedByAccount.putIfAbsent(accountNumber, loan);
            }
        }

        return extendedByAccount;
    }

    /**
     * Build SSME Loan Account DTO from CTMD relation + optional extended info.
     * - accountNumber / accountName from Account Relations (required)
     * - productName via ProductNameMapper (product-service, LN) like Home Loan; fallback CBSLD prodName
     * - status / subStatus from Loan_Status / Loan_Sub_Status maps
     * - missing or unmapped accountStatus → Loan_Status_NULL / Loan_Sub_Status_NULL
     */
    private SsmeLoanAccountDto buildSsmeLoanAccountDto(
            Map<String, Object> loan,
            Map<String, Object> relationItem) {

        SsmeLoanAccountFields accountFields = extractSsmeLoanAccountRelationFields(relationItem);

        // Map status & subStatus from CBSLD accountStatus using Loan_Status / Loan_Sub_Status
        Map<String, String> statusMap = loadLoanStatusMapping();
        Map<String, String> subStatusMap = loadLoanSubStatusMapping();

        // Defaults from Loan_Status_NULL / Loan_Sub_Status_NULL in enum_product_holding
        String productName = "-";
        String status = statusMap.getOrDefault("NULL", "Inactive");
        String subStatus = subStatusMap.getOrDefault("NULL", "Blank (ไม่มีข้อมูล)");
        // CBSLD acctType — same value used in product-name externalId (productCode + acctType)
        String accountType = "-";
        String productCode = "-";

        if (loan != null) {
            productName = resolveSsmeProductName(loan);
            String accountStatusCode = extractFieldValue(loan, ACCOUNT_STATUS);

            if (!"-".equals(accountStatusCode)) {
                String statusKey = accountStatusCode.replace(" ", "");
                String mappedStatus = statusMap.getOrDefault(statusKey, status);
                // Treat explicit "-" mapping same as null/unmapped
                status = "-".equals(mappedStatus) ? status : mappedStatus;
                subStatus = subStatusMap.getOrDefault(statusKey, subStatus);
            }

            String acctType = extractOptionalField(loan, ACCT_TYPE);
            if (acctType != null) {
                accountType = acctType;
            }
            Object accountKeyObj = loan.get(ACCOUNT_KEY);
            if (accountKeyObj instanceof Map) {
                @SuppressWarnings("unchecked")
                Map<String, Object> accountKey = (Map<String, Object>) accountKeyObj;
                String code = extractOptionalField(accountKey, PRODUCT_CODE);
                if (code != null) {
                    productCode = code;
                }
            }
        }

        return SsmeLoanAccountDto.builder()
                .accountNumber(accountFields.accountNumber())
                .accountName(accountFields.accountName())
                .productName(productName)
                .status(status)
                .subStatus(subStatus)
                .productCode(productCode)
                .accountType(accountType)
                .build();
    }

    /**
     * Resolve SSME product name via product-service (same path as Home Loan overview).
     *
     * <p>Lookup uses LoanProductNameEnricher priority 4 only:
     * externalId = productCode + acctType (e.g. 470310).</p>
     *
     * <p>Does not pass accountType / prodName / projectCode into productLinkage
     * (avoids AF priority 1 and priorities 2-3).</p>
     *
     * <ol>
     *   <li>productNameMapper.getProductName(rawData, "LN") with productCode + acctType</li>
     *   <li>If mapper empty / fails → CBSLD prodName field only</li>
     *   <li>If prodName missing → "-"</li>
     * </ol>
     */
    @SuppressWarnings("unchecked")
    private String resolveSsmeProductName(Map<String, Object> loan) {
        String prodNameFallback = extractOptionalField(loan, PROD_NAME);
        String fallbackDisplay = prodNameFallback != null ? prodNameFallback : "-";

        if (loan == null) {
            return fallbackDisplay;
        }

        String acctType = extractOptionalField(loan, ACCT_TYPE);
        Object accountKeyObj = loan.get(ACCOUNT_KEY);
        if (acctType == null || !(accountKeyObj instanceof Map)) {
            return fallbackDisplay;
        }

        Map<String, Object> accountKey = (Map<String, Object>) accountKeyObj;
        String productCode = extractOptionalField(accountKey, PRODUCT_CODE);
        if (productCode == null) {
            return fallbackDisplay;
        }

        // Priority 4 externalId — used to reject mapper's externalId-as-name fallback
        String externalId = productCode + acctType;

        try {
            // Only acctType + productCode → LoanProductNameEnricher priority 4
            Map<String, Object> productLinkage = new HashMap<>();
            productLinkage.put(ACCT_TYPE, acctType);
            productLinkage.put(ACCOUNT_KEY, Map.of(PRODUCT_CODE, productCode));

            Map<String, Object> rawData = Map.of(PRODUCT_LINKAGE, productLinkage);
            ProductNameLookupResponse productNames = productNameMapper.getProductName(rawData, "LN");

            if (productNames != null
                    && productNames.getProductName() != null
                    && !productNames.getProductName().trim().isEmpty()
                    // ProductNameMapper returns externalId when master miss — treat as miss
                    && !externalId.equals(productNames.getProductName().trim())) {
                log.debug(
                        "Resolved SSME productName from ProductNameMapper (priority 4): "
                                + "externalId={} -> {}",
                        externalId, productNames.getProductName());
                return productNames.getProductName();
            }

            log.debug(
                    "ProductNameMapper miss for SSME externalId={}, falling back to prodName {}",
                    externalId, fallbackDisplay);
        } catch (Exception ex) {
            log.warn("Failed to resolve SSME productName via ProductNameMapper: {}",
                    ex.getMessage(), ex);
        }

        return fallbackDisplay;
    }

    /**
     * Extract non-blank field; returns null when missing or placeholder "-".
     */
    private String extractOptionalField(Map<String, Object> map, String key) {
        if (map == null || key == null) {
            return null;
        }
        Object value = map.get(key);
        if (value == null) {
            return null;
        }
        String str = value.toString().trim();
        if (str.isEmpty() || "-".equals(str)) {
            return null;
        }
        return str;
    }

    /**
     * Extract account relation fields (account number, name, status) from relation item.
     *
     * @param relationItem Account relation item (may be null)
     * @return SsmeLoanAccountFields with extracted values (defaults to "-" if not found)
     */
    @SuppressWarnings("unchecked")
    private SsmeLoanAccountFields extractSsmeLoanAccountRelationFields(Map<String, Object> relationItem) {
        String accNum = "-";
        String accName = "-";
        String accStatus = "-";

        if (relationItem != null) {
            Object productLinkageObj = relationItem.get(PRODUCT_LINKAGE);
            if (productLinkageObj instanceof Map) {
                Map<String, Object> productLinkage = (Map<String, Object>) productLinkageObj;

                accNum = extractFieldValue(productLinkage, ACCOUNT_NUMBER);
                accName = extractFieldValue(productLinkage, ACCOUNT_NAME);
            }
        }

        return new SsmeLoanAccountFields(accNum, accName, accStatus);
    }

    /**
     * Helper record to hold extracted SSME loan account relation fields.
     */
    private record SsmeLoanAccountFields(
            String accountNumber,
            String accountName,
            String accountStatus) {
    }

    /**
     * Extract and map home loan accounts from integration response.
     * Merges data from two sources using index-based mapping:
     * 1. all-account-relation: accountNumber, accountName, accountStatus
     * 2. extended/inquiry/home-loan: productId, productName, duedate
     *
     * <p>Note: Filtering of PF11/PV11 product codes is handled upstream in
     * integration-service (AccountHomeLoanService.collectAndFilterResults).
     * This method assumes the list is already filtered.
     *
     * @param responseBody Integration service response body from extended info
     * @param accountRelationItems Filtered items from all-account-relation
     * @param accountNumbers List of account numbers (same order as responses)
     * @return List of HomeLoanAccountDto
     */
    @SuppressWarnings("unchecked")
    private List<HomeLoanAccountDto> extractHomeLoanAccounts(
            Map<String, Object> responseBody,
            List<Map<String, Object>> accountRelationItems,
            List<String> accountNumbers) {

        if (responseBody == null) {
            return List.of();
        }

        // Navigate: data (which is directly an ArrayList from integration-service)
        Object dataObj = responseBody.get("data");
        if (dataObj == null) {
            return List.of();
        }

        // integration-service returns data as ArrayList directly, not wrapped in loanList
        List<Map<String, Object>> loanList;
        if (dataObj instanceof List) {
            loanList = (List<Map<String, Object>>) dataObj;
        } else {
            log.warn("Expected 'data' to be List, but got: {}", dataObj.getClass().getName());
            return List.of();
        }

        if (loanList.isEmpty()) {
            return List.of();
        }

        // Build index map: accountNumber -> relationItem
        Map<String, Map<String, Object>> accountRelationMap =
                buildAccountRelationMap(accountRelationItems);

        // Build result list - data array from extended info and relation items must match by index
        java.util.List<HomeLoanAccountDto> result = new java.util.ArrayList<>();

        for (int i = 0; i < loanList.size(); i++) {
            Map<String, Object> loan = loanList.get(i);

            // Get corresponding account number from accountNumbers list (same index)
            String accountNumber = (i < accountNumbers.size()) ? accountNumbers.get(i) : null;

            // Look up account relation data
            Map<String, Object> relationItem = (accountNumber != null)
                    ? accountRelationMap.get(accountNumber)
                    : null;

            // Build DTO from loan data and relation item
            HomeLoanAccountDto dto = buildHomeLoanAccountDto(loan, relationItem);
            result.add(dto);
        }

        return result;
    }

    /**
     * Build a map of account number to account relation item for quick lookup.
     *
     * @param accountRelationItems List of account relation items
     * @return Map of account number to account relation item
     */
    @SuppressWarnings("unchecked")
    private Map<String, Map<String, Object>> buildAccountRelationMap(
            List<Map<String, Object>> accountRelationItems) {
        Map<String, Map<String, Object>> accountRelationMap = new java.util.HashMap<>();
        for (Map<String, Object> item : accountRelationItems) {
            Map<?, ?> productLinkage = (Map<?, ?>) item.get(PRODUCT_LINKAGE);
            String accNum = (String) productLinkage.get(ACCOUNT_NUMBER);
            accountRelationMap.put(accNum, item);
        }
        return accountRelationMap;
    }

    /**
     * Build HomeLoanAccountDto from loan data and account relation item.
     *
     * @param loan Loan data from extended/inquiry/home-loan
     * @param relationItem Account relation item (may be null)
     * @return HomeLoanAccountDto
     */
    @SuppressWarnings("unchecked")
    private HomeLoanAccountDto buildHomeLoanAccountDto(
            Map<String, Object> loan,
            Map<String, Object> relationItem) {

        // Extract fields from extended info (extended/inquiry/home-loan source)
        final String duedate = extractFieldValue(loan, "paymentDueDate");

        // Extract fields from account relation (all-account-relation source)
        final HomeLoanAccountFields accountFields = extractAccountRelationFields(relationItem);

        // Map status & subStatus from accountStatus in all-account-relation
        Map<String, String> statusMap = loadLoanStatusMapping();
        Map<String, String> subStatusMap = loadLoanSubStatusMapping();

        String status = "-";
        String subStatus = "-";
        String accountStatusCode = accountFields.accountStatus();
        if (!"-".equals(accountStatusCode)) {
            status = statusMap.getOrDefault(accountStatusCode.replace(" ", ""), "-");
            subStatus = subStatusMap.getOrDefault(accountStatusCode.replace(" ", ""), "-");
        }

        // Enrich with product name and product ID from product-service
        String productId = null;
        String productName = null;
        String externalIdFallback = null;

        try {
            // Extract required fields for external ID
            String acctType = extractFieldValue(loan, ACCT_TYPE);
            Object accountKeyObj = loan.get(ACCOUNT_KEY);

            if (accountKeyObj instanceof Map) {
                Map<String, Object> accountKey = (Map<String, Object>) accountKeyObj;
                String productCode = extractFieldValue(accountKey, PRODUCT_CODE);

                if (acctType != null && productCode != null) {
                    // Build base externalId fallback (productCode + acctType, e.g., "478310")
                    externalIdFallback = productCode + acctType;

                    // Build external ID (Home Loan uses productCode + acctType only)
                    String externalId = buildHomeLoanExternalId(productCode, acctType);

                    log.debug("Enriching Home Loan account with product data: externalId={}", externalId);

                    // Call product-service
                    ProductNameLookupResponse productLookup =
                            productServiceClient.lookupProductName(externalId, "LN");

                    if (productLookup != null) {
                        productId = productLookup.getProductId() != null
                                ? productLookup.getProductId().toString()
                                : null;
                        productName = productLookup.getProductName();

                        log.debug("Enriched Home Loan account: productId={}, productName={}",
                                productId, productName);
                    }
                }
            }
        } catch (Exception ex) {
            log.warn("Failed to enrich Home Loan account with product data: {}", ex.getMessage());
        }

        // Fallback to externalId (productCode + acctType) if product-service lookup failed
        if (productName == null || productName.trim().isEmpty()) {
            productName = externalIdFallback;
            log.debug("Using fallback productName as externalId: {}", productName);
        }

        // Build DTO
        return HomeLoanAccountDto.builder()
                .accountNumber(accountFields.accountNumber())
                .accountName(accountFields.accountName())
                .accountStatus(status)
                .subStatus(subStatus)
                .productId(productId)
                .productName(productName)
                .duedate(duedate)
                .build();
    }

    /**
     * Build Home Loan external ID.
     *
     * <p>For Home Loan, the externalId is always: <strong>productCode + acctType</strong>
     *
     * <p>Example: "478310"
     *
     * <p>Note: Unlike Auto Finance, Home Loan does NOT append prodName or projectCode
     *
     * @param productCode Product code from accountKey (e.g., "478")
     * @param acctType Account type (e.g., "310")
     * @return External ID string (productCode + acctType)
     */
    private String buildHomeLoanExternalId(String productCode, String acctType) {
        // For Home Loan: always use productCode + acctType only
        return productCode + acctType;
    }

    /**
     * Extract account relation fields (account number, name, status) from relation item.
     *
     * @param relationItem Account relation item (may be null)
     * @return HomeLoanAccountFields with extracted values (defaults to "-" if not found)
     */
    @SuppressWarnings("unchecked")
    private HomeLoanAccountFields extractAccountRelationFields(Map<String, Object> relationItem) {
        String accNum = "-";
        String accName = "-";
        String accStatus = "-";

        if (relationItem != null) {
            Object productLinkageObj = relationItem.get(PRODUCT_LINKAGE);
            if (productLinkageObj instanceof Map) {
                Map<String, Object> productLinkage = (Map<String, Object>) productLinkageObj;

                accNum = extractFieldValue(productLinkage, ACCOUNT_NUMBER);
                accName = extractFieldValue(productLinkage, ACCOUNT_NAME);
                accStatus = extractFieldValue(productLinkage, ACCOUNT_STATUS);
            }
        }

        return new HomeLoanAccountFields(accNum, accName, accStatus);
    }

    /**
     * Helper record to hold extracted account relation fields.
     */
    private record HomeLoanAccountFields(
            String accountNumber,
            String accountName,
            String accountStatus) {
    }

    /**
     * Enrich banking accounts with product names from product-service.
     *
     * @param accounts List of account DTOs to enrich
     * @param rawItems Corresponding raw data from Integration Service
     */
    private void enrichBankingAccountsWithProductNames(
            List<BankingAccountRelationDto> accounts,
            List<Map<String, Object>> rawItems) {

        log.info("Enriching {} banking accounts with product names", accounts.size());

        for (int i = 0; i < accounts.size(); i++) {
            BankingAccountRelationDto account = accounts.get(i);
            Map<String, Object> rawData = rawItems.get(i);

            try {
                // Step 1: Determine product code from application code
                String productCode = determineProductCode(rawData);
                if (productCode != null) {
                    // Step 2: Get correct enricher from factory
                    ProductNameEnricher enricher = enricherFactory.getEnricher(productCode);
                    if (enricher != null) {
                        // Step 3: Enrich account with product names
                        enricher.enrichWithProductNames(account, rawData);
                    } else {
                        log.warn("No enricher found for productCode: {}", productCode);
                    }
                } else {
                    log.warn("Cannot determine product code for account: {}",
                            account.getAccountNumber());
                }

            } catch (Exception e) {
                log.error("Failed to enrich account {} with product names: {}",
                        account.getAccountNumber(), e.getMessage(), e);
                // Continue processing other accounts
            }
        }

        log.info("Finished enriching banking accounts with product names");
    }

    /**
     * Determine product code from raw data.
     * Maps application code to product code abbreviation.
     */
    private String determineProductCode(Map<String, Object> rawData) {
        String appCode = extractApplicationCode(rawData);

        return switch (appCode) {
            case "ST", "IM" -> "DP";  // Deposit
            case "EC" -> "EC";         // Electronic card
            case "MF" -> "MF";         // Mutual fund
            case "AL" -> "LN";         // ALL Loans (Auto Finance, Personal Loan, Jaidee Plus, Home Loan)
            default -> {
                log.warn("Unknown application code: {}", appCode);
                yield null;
            }
        };
    }

    @SuppressWarnings("unchecked")
    private CommercialLoanAccountDto transformToCommercialLoanAccountDto(
            Map<String, Object> item,
            Map<String, String> statusMapping,
            Map<String, String> subStatusMapping) {

        AccountFields fields = extractAccountFieldsFromProductLinkage(item);

        String status = statusMapping.getOrDefault(
                fields.accountStatus().replace(" ", ""), "-");

        String subStatus = subStatusMapping.getOrDefault(
                fields.accountStatus().replace(" ", ""), "-");

        String productCode = "-";
        String accountType = "-";
        Object productLinkageObj = item.get(PRODUCT_LINKAGE);
        if (productLinkageObj instanceof Map) {
            Map<String, Object> productLinkage = (Map<String, Object>) productLinkageObj;

            Object productCodeObj = productLinkage.get(ACCOUNT_PRODUCT_CODE);
            if (productCodeObj != null && !productCodeObj.toString().trim().isEmpty()) {
                productCode = productCodeObj.toString();
            }

            Object accountTypeObj = productLinkage.get(ACCOUNT_TYPE);
            if (accountTypeObj != null && !accountTypeObj.toString().trim().isEmpty()) {
                accountType = accountTypeObj.toString();
            }

            // Extract accountType field from productLinkage
            Object accountTypeFieldObj = productLinkage.get(ACCOUNT_TYPE);
            if (accountTypeFieldObj != null && !accountTypeFieldObj.toString().trim().isEmpty()) {
                accountType = accountTypeFieldObj.toString();
            }
        }

        String productName = getAccountTypeDescription(item, productCode);

        String productHoldingSection = "-";
        if (fields.accountNumber().startsWith("496")) {
            productHoldingSection = "Commercial Loan & LG";
        } else if (fields.accountNumber().startsWith("475")) {
            productHoldingSection = "SME/sSME Loan & Other";
        }

        return CommercialLoanAccountDto.builder()
                .accountNumber(fields.accountNumber())
                .accountName(fields.accountName())
                .productName(productName)
                .status(status)
                .subStatus(subStatus)
                .productCode(productCode)
                .accountType(accountType)
                .productHoldingSection(productHoldingSection)
                .build();
    }

    @SuppressWarnings("unchecked")
    private PersonalLoanAccountDto transformToPersonalLoanAccountDto(
            Map<String, Object> item,
            Map<String, String> statusMapping,
            Map<String, String> subStatusMapping) {

        AccountFields fields = extractAccountFieldsFromProductLinkage(item);

        String status = statusMapping.getOrDefault(
                fields.accountStatus().replace(" ", ""), "-");

        String subStatus = subStatusMapping.getOrDefault(
                fields.accountStatus().replace(" ", ""), "-");

        String productCode = "-";
        String accountType = "-";
        Object productLinkageObj = item.get(PRODUCT_LINKAGE);
        if (productLinkageObj instanceof Map) {
            Map<String, Object> productLinkage = (Map<String, Object>) productLinkageObj;

            Object productCodeObj = productLinkage.get(ACCOUNT_PRODUCT_CODE);
            if (productCodeObj != null && !productCodeObj.toString().trim().isEmpty()) {
                productCode = productCodeObj.toString();
            }

            Object accountTypeObj = productLinkage.get(ACCOUNT_TYPE);
            if (accountTypeObj != null && !accountTypeObj.toString().trim().isEmpty()) {
                accountType = accountTypeObj.toString();
            }
        }

        String productName = getAccountTypeDescription(item, productCode);

        return PersonalLoanAccountDto.builder()
                .accountNumber(fields.accountNumber())
                .accountName(fields.accountName())
                .productName(productName)
                .status(status)
                .subStatus(subStatus)
                .productCode(productCode)
                .accountType(accountType)
                .build();
    }

    public CommercialLoanAccountListDataDto getCommercialLoanAccountList(
            CustomerProfileSimpleRequest request) {

        // Step 1: Check permission
        commercialLoanPermissionService.checkAccountListPermission();

        List<String> applicationTypes = mapProductTypeToApplicationTypes(ProductType.CL);

        try {
            ResponseEntity<Map<String, Object>> integrationResponse =
                    integrationCustomerProfileService.queryAccountRelations(
                            request.getCustomerKey(),
                            applicationTypes
                    );

            Map<String, Object> body = integrationResponse.getBody();
            List<Map<String, Object>> items = profileQueryValidator.extractAccountRelationItems(body);

            log.info("[CL] Extracted {} items from integration response", items.size());

            List<Map<String, Object>> filteredItems = items.stream()
                    .filter(item -> profileQueryValidator.isAccountMatchProduct(item, ProductType.CL))
                    .toList();

            log.info("[CL] After filtering: {} items (from {} total)", filteredItems.size(), items.size());

            Map<String, String> statusMapping = loadLoanStatusMapping();
            Map<String, String> subStatusMapping = loadLoanSubStatusMapping();

            List<CommercialLoanAccountDto> accounts = filteredItems.stream()
                    .map(item -> transformToCommercialLoanAccountDto(
                            item, statusMapping, subStatusMapping))
                    .toList();

            log.info("[CL] Transformed {} accounts", accounts.size());

            return CommercialLoanAccountListDataDto.builder()
                    .totalRecord(accounts.size())
                    .accounts(accounts)
                    .build();

        } catch (Exception ex) {
            log.error("[CL] Failed to get commercial loan account list: {}", ex.getMessage(), ex);
            throw new IllegalStateException("Failed to get commercial loan account list", ex);
        }
    }

    public PersonalLoanAccountListDataDto getPersonalLoanAccountList(
            CustomerProfileSimpleRequest request) {

        List<String> applicationTypes = mapProductTypeToApplicationTypes(ProductType.PL);

        try {
            ResponseEntity<Map<String, Object>> integrationResponse =
                    integrationCustomerProfileService.queryAccountRelations(
                            request.getCustomerKey(),
                            applicationTypes
                    );

            Map<String, Object> body = integrationResponse.getBody();
            List<Map<String, Object>> items = profileQueryValidator.extractAccountRelationItems(body);

            log.info("[PL] Extracted {} items from integration response", items.size());

            List<Map<String, Object>> filteredItems = items.stream()
                    .filter(item -> profileQueryValidator.isAccountMatchProduct(item, ProductType.PL))
                    .toList();

            log.info("[PL] After filtering: {} items (from {} total)", filteredItems.size(), items.size());

            Map<String, String> statusMapping = loadLoanStatusMapping();
            Map<String, String> subStatusMapping = loadLoanSubStatusMapping();

            List<PersonalLoanAccountDto> loan = filteredItems.stream()
                    .map(item -> transformToPersonalLoanAccountDto(
                            item, statusMapping, subStatusMapping))
                    .toList();

            log.info("[PL] Transformed {} accounts", loan.size());

            return PersonalLoanAccountListDataDto.builder()
                    .totalRecord(loan.size())
                    .loan(loan)
                    .build();

        } catch (Exception ex) {
            log.error("[PL] Failed to get personal loan account list: {}", ex.getMessage(), ex);
            throw new IllegalStateException("Failed to get personal loan account list", ex);
        }
    }

    /**
     * Fetch SSME extended info from commercial loan service.
     * Returns null if the call fails, allowing CTMD accounts to be returned without enrichment.
     *
     * @param accountNumbers List of account numbers to query
     * @return Map containing extended info response body, or null if fetch fails
     */
    private Map<String, Object> fetchSsmeExtendedInfo(List<String> accountNumbers) {
        try {
            ResponseEntity<Map<String, Object>> ssmeLoanResponse =
                    integrationCustomerProfileService.queryCommercialLoanExtendedInfo(accountNumbers);
            Map<String, Object> ssmeLoanBody = ssmeLoanResponse != null ? ssmeLoanResponse.getBody() : null;
            log.info("🔍 DEBUG - SSME Extended info response body: {}", ssmeLoanBody);
            return ssmeLoanBody;
        } catch (Exception enrichEx) {
            log.warn("SSME commercial extended info failed; returning CTMD accounts without enrichment: {}",
                    enrichEx.getMessage());
            return null;
        }
    }

}
