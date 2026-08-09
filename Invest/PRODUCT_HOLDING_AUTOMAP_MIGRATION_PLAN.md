# Product Holding AutoMap Migration Plan

## Goal

Migrate all Product Holding account-list APIs from the legacy response pattern:

```text
Service
  -> ResponseEntity<StandardResponseDto<T>>
  -> manually sets HTTP status
```

to the shared response / AutoMap pattern already started in Banking:

```text
Service
  -> Response<T>

Controller
  -> autoMap(response)

ResponseService
  -> maps Response<T> to HTTP status + HTTP response
```

The target is to make **Banking the reference implementation** and apply the same pattern to:

- Banking (BK) — already partially migrated
- Auto Finance (AF)
- Home Loan (HL)
- Personal Loan (PL)
- SSME Loan (SSME)
- Commercial Loan (CL)

Do not change business logic, filtering rules, sorting rules, enrichment logic, or product-specific DTO fields unless required for the response migration.

---

# 1. Current Reference Implementation: Banking

## customer-service

### `CustomerProfileSimpleRequest.java`

Keep the existing validation:

```java
@NotBlank(message = "Customer Key is required")
private String customerKey;
```

This is correct and should remain unchanged.

Any controller that accepts this DTO must use:

```java
@Valid @RequestBody CustomerProfileSimpleRequest request
```

Do not add manual blank/null checks for `customerKey` in the service.

### `BankingController.java`

The Banking endpoint is the desired controller pattern:

```java
@PostMapping("/account-list")
public ResponseEntity<Response<BankingAccountListDataDto>> getBankingAccountList(
        @Valid @RequestBody CustomerProfileSimpleRequest request) {

    log.info("Received Banking account list request: {}", request);

    Response<BankingAccountListDataDto> response =
            customerProductHoldingService.getBankingAccountList(request);

    return autoMap(response);
}
```

This is the target pattern for other Product Holding controllers.

`BaseController.autoMap()` already delegates to:

```java
responseService.toResponseEntity(response);
```

Therefore controllers should not manually choose `HttpStatus` for normal Product Holding responses.

### `CustomerProductHoldingService.java`

Banking is already using the desired service return type:

```java
public Response<BankingAccountListDataDto> getBankingAccountList(
        CustomerProfileSimpleRequest request)
```

Success response pattern:

```java
return Response.success(
        ResponseStatus.SUCCESS.getCode(),
        "Banking account list retrieved successfully",
        data
);
```

Error pattern:

```java
catch (Exception ex) {
    log.error(
            "Error in getBankingAccountList for customerKey: {}",
            request.getCustomerKey(),
            ex
    );

    throw new SonicException(
            ResponseStatus.ERROR,
            "Failed to retrieve banking account list",
            ex
    );
}
```

Use this as the migration reference for the other products.

---

# 2. customer-service Changes

## File: `CustomerProductHoldingService.java`

Migrate the account-list methods for all remaining products.

Expected products:

```text
BK   Banking        -> already migrated
AF   Auto Finance
HL   Home Loan
PL   Personal Loan
SSME SSME Loan
CL   Commercial Loan
```

Search for methods that currently return patterns such as:

```java
ResponseEntity<StandardResponseDto<...>>
```

or:

```java
ResponseEntity<StandardResponse<...>>
```

for Product Holding account-list APIs.

Do not blindly migrate unrelated endpoints outside the Product Holding account-list scope.

## 2.1 Auto Finance

Current method is still legacy:

```java
public ResponseEntity<StandardResponseDto<AutoFinanceAccountListDataDto>>
getAutoFinanceAccountList(CustomerProfileSimpleRequest request)
```

Change to:

```java
public Response<AutoFinanceAccountListDataDto> getAutoFinanceAccountList(
        CustomerProfileSimpleRequest request)
```

Preserve all existing logic:

- application type mapping
- integration-service call
- filtering
- status mapping
- product name enrichment
- sorting
- DTO construction

Replace only the response construction.

### Success

Replace legacy:

```java
StandardResponseDto<AutoFinanceAccountListDataDto> response =
        StandardResponseDto.success(
                data,
                "Auto finance account list retrieved successfully"
        );

return ResponseEntity.ok()
        .header(CORRELATION_ID, correlationId)
        .body(response);
```

with:

```java
return Response.success(
        ResponseStatus.SUCCESS.getCode(),
        "Auto finance account list retrieved successfully",
        data
);
```

### Error

Remove patterns like:

```java
AutoFinanceAccountListDataDto emptyData = ...
StandardResponseDto<AutoFinanceAccountListDataDto> errorResponse = ...
return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
        .body(errorResponse);
```

Replace with:

```java
catch (Exception ex) {
    log.error(
            "Error in getAutoFinanceAccountList for customerKey: {}",
            request.getCustomerKey(),
            ex
    );

    throw new SonicException(
            ResponseStatus.ERROR,
            "Failed to retrieve auto finance account list",
            ex
    );
}
```

## 2.2 Home Loan

Apply the same conversion:

```text
ResponseEntity<StandardResponseDto<HomeLoan...>>
    ->
Response<HomeLoan...>
```

Success:

```java
return Response.success(
        ResponseStatus.SUCCESS.getCode(),
        "<existing success message>",
        data
);
```

Error:

```java
throw new SonicException(
        ResponseStatus.ERROR,
        "<existing failure message>",
        ex
);
```

Preserve all Home Loan business logic.

## 2.3 Personal Loan

Apply the same conversion:

```text
ResponseEntity<StandardResponseDto<PersonalLoan...>>
    ->
Response<PersonalLoan...>
```

Preserve all existing business logic and DTO fields.

## 2.4 SSME Loan

Apply the same conversion:

```text
ResponseEntity<StandardResponseDto<SsmeLoan...>>
    ->
Response<SsmeLoan...>
```

Preserve all existing business logic and DTO fields.

## 2.5 Commercial Loan

Apply the same conversion:

```text
ResponseEntity<StandardResponseDto<CommercialLoan...>>
    ->
Response<CommercialLoan...>
```

Preserve all existing business logic and DTO fields.

## 2.6 Imports Cleanup

After migrating each method, remove imports from `CustomerProductHoldingService.java` only when no longer used:

```java
org.springframework.http.HttpStatus
org.springframework.http.ResponseEntity
StandardResponseDto
StandardResponse
```

Do not remove an import if another non-migrated method in the same class still needs it.

The file currently contains other legacy methods, so perform cleanup carefully.

---

# 3. Controller Changes

Find the controllers for:

```text
Auto Finance
Home Loan
Personal Loan
SSME Loan
Commercial Loan
```

For each account-list endpoint, change the controller return type to:

```java
ResponseEntity<Response<ProductDataDto>>
```

and return through `autoMap()`.

Example:

```java
@PostMapping("/account-list")
public ResponseEntity<Response<AutoFinanceAccountListDataDto>>
getAutoFinanceAccountList(
        @Valid @RequestBody CustomerProfileSimpleRequest request) {

    log.info("Received Auto Finance account list request: {}", request);

    Response<AutoFinanceAccountListDataDto> response =
            customerProductHoldingService.getAutoFinanceAccountList(request);

    return autoMap(response);
}
```

A shorter equivalent is also acceptable:

```java
return autoMap(
        customerProductHoldingService.getAutoFinanceAccountList(request)
);
```

Requirements:

- keep `@Valid`
- keep the existing endpoint path
- keep request DTO unchanged
- do not manually use `ResponseEntity.ok()`
- do not manually set HTTP status
- do not wrap shared `Response<T>` in `StandardResponseDto`

---

# 4. Validation Behavior

For endpoints using:

```java
@Valid @RequestBody CustomerProfileSimpleRequest request
```

and:

```java
@NotBlank(message = "Customer Key is required")
private String customerKey;
```

the following must be invalid:

```json
{ "customerKey": null }
```

```json
{ "customerKey": "" }
```

```json
{ "customerKey": "   " }
```

These requests should fail validation before entering the service method.

Important:

`autoMap()` is not involved when Bean Validation fails.

Validation failures go through Spring's exception handling path, typically via:

```text
MethodArgumentNotValidException
    ->
GlobalExceptionHandler / shared web exception handler
    ->
HTTP response
```

Do not add duplicate validation in each Product Holding service just to force HTTP 400.

If validation currently still returns HTTP 200, inspect the Global Exception Handler / shared web library. Do not work around it inside each service.

---

# 5. api-interface / BFF Changes

## File: `customer.datasource.ts`

Banking currently has compatibility logic for the new customer-service format:

```json
{
  "code": "...",
  "message": "...",
  "messageTemplate": {},
  "data": {}
}
```

and the legacy format:

```json
{
  "statusCode": "...",
  "success": true,
  "message": "...",
  "body": {
    "data": {}
  }
}
```

Do not create one almost-identical mapper per product.

Create a generic response compatibility type + mapper.

## 5.1 Generic Backend Response Type

Add or replace Banking-specific envelope handling with:

```ts
export interface BackendResponse<T> {
  // New autoMap format
  code?: string
  message?: string
  messageTemplate?: {
    title?: string | null
    header?: string | null
    body?: string | null
    actionButton?: string | null
    cancelButton?: string | null
  }
  data?: T

  // Temporary legacy compatibility
  statusCode?: string
  success?: boolean
  body?: {
    data?: T
  }
}
```

Keep the legacy fields temporarily until all Product Holding APIs are migrated and deployed.

## 5.2 Generic GraphQL Legacy Mapper

Create a generic mapper to keep the existing GraphQL / web-portal contract stable during migration.

Example:

```ts
function mapBackendResponseToLegacy<T>(
  response: BackendResponse<T> | null | undefined,
  emptyData: T,
  fallbackMessage = 'Unable to load data'
): {
  statusCode: string
  success: boolean
  message: string
  body: {
    data: T
  }
} {
  const code =
    response?.code ??
    response?.statusCode ??
    'GEN-E50000'

  const data =
    response?.data ??
    response?.body?.data ??
    emptyData

  const message =
    response?.messageTemplate?.body ??
    response?.message ??
    fallbackMessage

  const success =
    response?.success ??
    (
      code.startsWith('GEN-S') ||
      code === 'SUCCESS' ||
      /^2\d\d$/.test(code)
    )

  return {
    statusCode: code,
    success: Boolean(success),
    message,
    body: {
      data,
    },
  }
}
```

Important:

Do **not** use this fallback:

```ts
const code = ... ?? '200'
```

because a missing/invalid backend response must not silently become success.

Use an error fallback such as:

```ts
'GEN-E50000'
```

---

# 6. Banking BFF Refactor

The current Banking compatibility mapper:

```ts
mapBankingAccountListToGraphQL(...)
```

may be kept temporarily, but preferably refactor it to use the generic mapper.

Banking-specific logic should only contain Banking-specific data transformations, for example:

```ts
filterBankingAccountRelations(...)
```

The response envelope conversion should be generic.

Example:

```ts
const mapped = mapBackendResponseToLegacy(
  response,
  EMPTY_BANKING_ACCOUNT_LIST_DATA,
  'Failed to fetch banking account list'
)

const originalAccountRelation =
  mapped.body.data.accountRelation ?? []

const filteredAccountRelation =
  filterBankingAccountRelations(originalAccountRelation)

return {
  ...mapped,
  body: {
    data: {
      totalRecord: filteredAccountRelation.length,
      accountRelation: filteredAccountRelation,
    },
  },
}
```

---

# 7. Auto Finance BFF Migration

Current Auto Finance still expects the legacy response directly:

```ts
const response = await this.post<AutoFinanceContractListResponse>(
  'api/v1/product-holding/auto-finance/account-list',
  {
    body: { customerKey },
  }
)

return response
```

Change the backend call to accept the compatibility envelope:

```ts
const response = await this.post<
  BackendResponse<AutoFinanceContractListData>
>(
  'api/v1/product-holding/auto-finance/account-list',
  {
    body: { customerKey },
  }
)
```

Then normalize:

```ts
return mapBackendResponseToLegacy(
  response,
  {
    totalRecord: 0,
    contractList: [],
  },
  'Failed to fetch Auto Finance contract list'
)
```

Use the exact current Auto Finance data type / field names from the repository.

Do not rename GraphQL-facing fields unless required.

---

# 8. Remaining Product BFF Migration

Repeat the same pattern for:

```text
Home Loan
Personal Loan
SSME Loan
Commercial Loan
```

Each method should:

1. call customer-service using `BackendResponse<T>`
2. normalize through `mapBackendResponseToLegacy(...)`
3. preserve its existing product-specific `data`
4. preserve existing GraphQL-facing shape
5. preserve existing product-specific filtering/transformation

Do not duplicate response-envelope parsing logic.

---

# 9. BFF Error Handling

Banking currently attempts to preserve backend error responses when Apollo RESTDataSource throws for non-2xx responses.

Keep this behavior.

Desired pattern:

```ts
const errorBody =
  (error as {
    extensions?: {
      response?: {
        body?: BackendResponse<T>
        status?: number
      }
    }
  })?.extensions?.response?.body

const httpStatus =
  (error as {
    extensions?: {
      response?: {
        status?: number
      }
    }
  })?.extensions?.response?.status
```

If backend error body exists, map the backend response rather than replacing every error with the same `GEN-E50000`.

Example:

```ts
if (errorBody) {
  const mappedError = mapBackendResponseToLegacy(
    errorBody,
    emptyData,
    errorMessage
  )

  return {
    ...mappedError,
    success: false,
    statusCode:
      mappedError.statusCode ||
      String(httpStatus ?? 500),
  }
}
```

Fallback only when no useful backend body exists:

```ts
return {
  statusCode: String(httpStatus ?? 500),
  success: false,
  message: errorMessage,
  body: {
    data: emptyData,
  },
}
```

Do not convert every downstream 400/404 response into `GEN-E50000`.

Preserve backend error information where possible.

---

# 10. GraphQL / web-portal

The current migration strategy should keep the GraphQL-facing legacy envelope stable:

```json
{
  "statusCode": "...",
  "success": true,
  "message": "...",
  "body": {
    "data": {}
  }
}
```

Therefore do not change the web-portal yet unless compilation/tests show a dependency on the backend raw response format.

The BFF is the compatibility boundary during the migration.

Target flow during migration:

```text
customer-service
    new Response<T>
    { code, message, messageTemplate, data }
              |
              v
api-interface datasource
    generic compatibility mapper
              |
              v
GraphQL
    existing contract
    { statusCode, success, message, body.data }
              |
              v
web-portal
    no migration required yet
```

---

# 11. Tests to Update

## customer-service Unit Tests

For migrated service methods, remove assertions tied to HTTP.

Remove:

```java
assertThat(result.getStatusCode()).isEqualTo(HttpStatus.OK);
assertThat(result.getBody()).isNotNull();
```

Replace with shared response assertions:

```java
Response<AutoFinanceAccountListDataDto> result =
        service.getAutoFinanceAccountList(request);

assertThat(result).isNotNull();
assertThat(result.getCode()).isEqualTo(ResponseStatus.SUCCESS.getCode());
assertThat(result.getData()).isNotNull();
```

Add product-specific assertions for:

```text
totalRecord
accountRelation / contractList
sorting
filtering
enrichment fields
```

Do not remove existing business logic assertions.

## customer-service Controller Tests

Controller tests should validate the HTTP mapping boundary.

Success example:

```java
mockMvc.perform(
        post("/api/v1/product-holding/auto-finance/account-list")
                .contentType(MediaType.APPLICATION_JSON)
                .content(validPayload)
)
.andExpect(status().isOk())
.andExpect(jsonPath("$.code").exists())
.andExpect(jsonPath("$.data").exists());
```

Validation test:

```java
mockMvc.perform(
        post("/api/v1/product-holding/auto-finance/account-list")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"customerKey\":\"\"}")
)
.andExpect(status().isBadRequest());
```

If this test returns HTTP 200, investigate the shared Global Exception Handler rather than adding manual checks inside every Product Holding service.

## BFF Tests

For every migrated product, test both backend shapes during the rollout.

### New shape

```ts
{
  code: 'GEN-S00001',
  message: 'Success',
  data: {
    // product data
  }
}
```

Expected GraphQL-facing result:

```ts
{
  statusCode: 'GEN-S00001',
  success: true,
  message: 'Success',
  body: {
    data: {
      // product data
    }
  }
}
```

### Legacy shape

```ts
{
  statusCode: '200',
  success: true,
  message: 'Success',
  body: {
    data: {
      // product data
    }
  }
}
```

Expected output should remain compatible.

### Invalid / missing backend response

Ensure this does **not** become success:

```ts
undefined
```

Expected:

```text
success = false
code/statusCode != 200
```

---

# 12. Recommended Migration Order

Use Banking as the reference.

Recommended order:

```text
1. Banking
   - verify current migration
   - replace Banking-specific envelope mapper with generic mapper

2. Auto Finance
   - customer-service
   - controller
   - tests
   - BFF

3. Home Loan
   - same pattern

4. Personal Loan
   - same pattern

5. SSME Loan
   - same pattern

6. Commercial Loan
   - same pattern

7. End-to-end test all products

8. Remove legacy compatibility only after all environments are migrated
```

---

# 13. Deployment Safety

During rollout, BFF should support both:

```text
old customer-service response
```

and:

```text
new AutoMap response
```

This avoids requiring an exact simultaneous deployment.

Preferred deployment sequence for each product:

```text
1. Deploy BFF compatibility support first
2. Deploy customer-service migration
3. Run integration / E2E test
4. Move to next product
```

This is safer than deploying the breaking customer-service shape first.

After all Product Holding APIs are migrated and stable, remove legacy support from BFF.

---

# 14. Cleanup After Full Migration

Only after all Product Holding endpoints are confirmed migrated:

Remove unused Product Holding usage of:

```text
StandardResponseDto
StandardResponse
statusCode
success
body.data
```

where those fields only exist for legacy customer-service compatibility.

Then simplify BFF backend response type to:

```ts
interface BackendResponse<T> {
  code: string
  message?: string
  messageTemplate?: MessageTemplate
  data: T
}
```

Do not perform this cleanup before all relevant customer-service deployments are complete.

---

# 15. Important Scope Rules for Augment

When implementing this migration:

1. Do not rewrite unrelated code.
2. Do not alter business filtering rules.
3. Do not alter product status mapping.
4. Do not alter sort order.
5. Do not alter integration-service payloads.
6. Do not alter GraphQL schema unless compilation proves it is necessary.
7. Do not alter web-portal behavior unless compilation/tests prove it is necessary.
8. Keep Banking behavior identical except for response-envelope refactoring.
9. Preserve backend HTTP error information in BFF.
10. Do not default malformed/missing responses to success / `200`.
11. Keep `@Valid` + `@NotBlank` validation.
12. Prefer generic response compatibility utilities over product-specific duplicate mappers.
13. Run formatting/lint/tests after edits.
14. Report every file changed and why.

---

# 16. Definition of Done

Migration is complete when:

- [ ] BK uses `Response<T>` + controller `autoMap()`
- [ ] AF uses `Response<T>` + controller `autoMap()`
- [ ] HL uses `Response<T>` + controller `autoMap()`
- [ ] PL uses `Response<T>` + controller `autoMap()`
- [ ] SSME uses `Response<T>` + controller `autoMap()`
- [ ] CL uses `Response<T>` + controller `autoMap()`
- [ ] no migrated service method manually builds `ResponseEntity`
- [ ] migrated service errors throw the shared exception path
- [ ] BFF supports new `{ code, messageTemplate, data }` responses
- [ ] BFF temporarily supports legacy `{ statusCode, success, body.data }`
- [ ] BFF does not default malformed responses to success / `200`
- [ ] frontend / GraphQL contract remains compatible
- [ ] `customerKey = ""` is rejected by validation
- [ ] customer-service unit tests pass
- [ ] customer-service controller tests pass
- [ ] BFF unit tests pass
- [ ] end-to-end Product Holding account-list tests pass

---

# 17. Files Expected to Change

Exact names may vary by repository, but Augment should first locate and update:

```text
customer-service
├─ CustomerProfileSimpleRequest.java
│  └─ verify only; @NotBlank already exists
├─ CustomerProductHoldingService.java
├─ BankingController.java
│  └─ Banking already migrated; use as reference
├─ Auto Finance controller
├─ Home Loan controller
├─ Personal Loan controller
├─ SSME Loan controller
├─ Commercial Loan controller
├─ Product Holding service tests
└─ Product Holding controller tests

api-interface
├─ customer.datasource.ts
├─ response types / shared response helpers if appropriate
└─ Product Holding datasource tests

web-portal
└─ no expected change unless tests/compiler prove otherwise

integration-service
└─ no expected change for this response-envelope migration
```

Before editing, search the repository for:

```text
StandardResponseDto
ResponseEntity<StandardResponse
getBankingAccountList
getAutoFinanceAccountList
HomeLoanAccountList
PersonalLoanAccountList
SsmeLoanAccountList
CommercialLoanAccountList
/product-holding/
```

Use the actual repository method/type names found rather than inventing new parallel APIs.
