# 📋 AutoMap Migration - Complete Change Log

## 🎯 Overview

Migration from `StandardResponseDto` → `Response<T>` with `autoMap()` for **Banking Product**

**Migration Status:** 60% Complete

---

## **Repository 1: customer-service** ☕

### **Files Changed ✅**

#### **1. BankingController.java**
**Path:** `src/main/java/th/co/scb/sonic/customer/controller/productholding/banking/BankingController.java`

**Lines:** 111-119

**Changes:**
- Return type: `StandardResponseDto<T>` → `Response<T>`
- Added `autoMap(response)` call

**BEFORE:**
```java
@PostMapping("/account-list")
public ResponseEntity<StandardResponseDto<BankingAccountListDataDto>> getBankingAccountList(
        @Valid @RequestBody CustomerProfileSimpleRequest request) {
    log.info("Received Banking account list request: {}", request);
    return customerProductHoldingService.getBankingAccountList(request);
}
```

**AFTER:**
```java
@PostMapping("/account-list")
public ResponseEntity<Response<BankingAccountListDataDto>> getBankingAccountList(
        @Valid @RequestBody CustomerProfileSimpleRequest request) {
    log.info("Received Banking account list request: {}", request);
    Response<BankingAccountListDataDto> response = 
        customerProductHoldingService.getBankingAccountList(request);
    return autoMap(response);  // ✅ AutoMap conversion
}
```

---

#### **2. CustomerProductHoldingService.java**
**Path:** `src/main/java/th/co/scb/sonic/customer/service/productholding/CustomerProductHoldingService.java`

**Lines:** 378-444

**Changes:**
- Return type: `ResponseEntity<StandardResponseDto<T>>` → `Response<T>`
- Removed `ResponseEntity.ok()` wrapper
- Changed `statusCode: "200"` → `code: "GEN-S00001"`
- Removed `success: true` field
- Added `messageTemplate` field
- Flattened structure: `body.data` → `data`

**BEFORE:**
```java
public ResponseEntity<StandardResponseDto<BankingAccountListDataDto>> getBankingAccountList(
        CustomerProfileSimpleRequest request) {
    // ... business logic ...
    return ResponseEntity.ok(
        StandardResponseDto.<BankingAccountListDataDto>builder()
            .statusCode("200")
            .success(true)
            .message("Success")
            .body(StandardResponseDto.Body.<BankingAccountListDataDto>builder()
                .data(BankingAccountListDataDto.builder()
                    .totalRecord(accountRelationList.size())
                    .accountRelation(accountRelationList)
                    .build())
                .build())
            .build()
    );
}
```

**AFTER:**
```java
public Response<BankingAccountListDataDto> getBankingAccountList(
        CustomerProfileSimpleRequest request) {
    // ... business logic ...
    return Response.<BankingAccountListDataDto>builder()
        .code("GEN-S00001")
        .message("Account list retrieved successfully")
        .messageTemplate(MessageTemplate.builder()
            .body("Account list retrieved successfully")
            .build())
        .data(BankingAccountListDataDto.builder()
            .totalRecord(accountRelationList.size())
            .accountRelation(accountRelationList)
            .build())
        .build();
}
```

---

### **Files Pending ⚠️**

#### **3. CustomerProductHoldingServiceTest.java**
**Path:** `src/test/java/th/co/scb/sonic/customer/service/productholding/CustomerProductHoldingServiceTest.java`

**Status:** ⚠️ **NEEDS UPDATE**

**Lines to Change:** Test methods for `getBankingAccountList()`

**Changes Required:**
- Return type: `ResponseEntity<StandardResponseDto<T>>` → `Response<T>`
- Remove HTTP status assertions
- Change `statusCode` → `code`
- Remove `success` field assertions
- Change `body.data` → `data`

**BEFORE:**
```java
@Test
void testGetBankingAccountList_Success() {
    ResponseEntity<StandardResponseDto<BankingAccountListDataDto>> result = 
        service.getBankingAccountList(request);
    
    assertThat(result.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(result.getBody()).isNotNull();
    assertThat(result.getBody().getStatusCode()).isEqualTo("200");
    assertThat(result.getBody().isSuccess()).isTrue();
    assertThat(result.getBody().getBody().getData()).isNotNull();
}
```

**AFTER:**
```java
@Test
void testGetBankingAccountList_Success() {
    Response<BankingAccountListDataDto> result = 
        service.getBankingAccountList(request);
    
    assertThat(result).isNotNull();
    assertThat(result.getCode()).isEqualTo("GEN-S00001");
    assertThat(result.getMessage()).isNotNull();
    assertThat(result.getData()).isNotNull();
    assertThat(result.getData().getTotalRecord()).isGreaterThan(0);
}
```

---

#### **4. BankingControllerTest.java** (If exists)
**Path:** `src/test/java/th/co/scb/sonic/customer/controller/productholding/banking/BankingControllerTest.java`

**Status:** ⚠️ **NEEDS UPDATE** (if file exists)

**Changes Required:**
```java
// Mock service to return Response<T>
when(service.getBankingAccountList(any()))
    .thenReturn(Response.<BankingAccountListDataDto>builder()
        .code("GEN-S00001")
        .message("Success")
        .data(...)
        .build());

// Assert HTTP response after autoMap
mockMvc.perform(post("/api/v1/product-holding/banking/account-list"))
    .andExpect(status().isOk())
    .andExpect(jsonPath("$.code").value("GEN-S00001"))
    .andExpect(jsonPath("$.data.totalRecord").exists());
```

---

## **Repository 2: api-interface (BFF)** 🔀

### **Files Pending ⚠️**

#### **1. customer.datasource.ts**
**Path:** `src/datasources/customer.datasource.ts`

**Status:** ⚠️ **NEEDS UPDATE**

**Lines to Change:** ~131-141, ~2305-2316, ~2350-2361

**Change 1 - Interface Definition (Lines ~131-141):**

**BEFORE:**
```typescript
export interface BankingAccountListResponse {
  statusCode: string
  success: boolean
  message: string
  body: {
    data: {
      totalRecord: number
      accountRelation: AccountRelation[]
    }
  }
}
```

**AFTER:**
```typescript
export interface BankingAccountListResponse {
  code: string
  message: string
  messageTemplate: {
    body: string
  }
  data: {
    totalRecord: number
    accountRelation: AccountRelation[]
  }
}
```

---

**Change 2 - Method Implementation (Lines ~2305-2316):**

**BEFORE:**
```typescript
async getBankingAccountList(customerKey: string): Promise<BankingAccountListResponse> {
  const response = await this.post<BankingAccountListResponse>(
    'api/v1/product-holding/banking/account-list',
    { body: { customerKey } }
  );

  return response;
}
```

**AFTER:**
```typescript
async getBankingAccountList(customerKey: string): Promise<BankingAccountListResponse> {
  const response = await this.post<BankingAccountListResponse>(
    'api/v1/product-holding/banking/account-list',
    { body: { customerKey } }
  );

  this.logger.info({
    msg: 'Banking account list fetched',
    customerKey,
    code: response.code,
    totalRecord: response.data?.totalRecord ?? 0,
  });

  return response;
}
```

---

**Change 3 - Error Handler (Lines ~2350-2361):**

**BEFORE:**
```typescript
return {
  statusCode: '500',
  success: false,
  message: error instanceof Error ? error.message : 'Failed to fetch all banking account types',
  body: {
    data: {
      totalRecord: 0,
      accountRelation: [],
    }
  }
};
```

**AFTER:**
```typescript
return {
  code: 'GEN-E50000',
  message: error instanceof Error ? error.message : 'Failed to fetch all banking account types',
  messageTemplate: {
    body: error instanceof Error ? error.message : 'Failed to fetch all banking account types'
  },
  data: {
    totalRecord: 0,
    accountRelation: [],
  }
};
```

---

### **Files That DON'T Need Changes ✅**

#### **2. getCustomerAccountList.resolver.ts**
**Path:** `src/domains/customer/productHolding/banking/getCustomerAccountList/getCustomerAccountList.resolver.ts`

**Status:** ✅ **NO CHANGES NEEDED**

**Reason:** Already uses `transformServiceResponse()` which handles both formats

---

## **Repository 3: web-portal** 🌐

### **All Files - NO CHANGES NEEDED ✅**

**Files Confirmed Safe:**

1. ✅ `lib/graphql/operations/customers/product-holding/banking/get-customer-account-list.graphql`
   - Already uses `code`, `message`, `data` structure

2. ✅ `lib/graphql/query/customers/get-customer-account-list.ts`
   - Just a GraphQL client wrapper

3. ✅ `modules/crm/domain/customer/hook/banking-section/use-get-banking.tsx`
   - Already checks `code !== "SUCCESS"`
   - Already accesses `data.accountRelation`

4. ✅ `modules/crm/domain/customer/customer-product-holding/banking/banking-tab/banking-list-page.tsx`
   - Consumes typed data, no format awareness

---

## **Repository 4: integration-service** 🔌

### **All Files - NO CHANGES NEEDED ✅**

**Reason:** integration-service **provides data TO** customer-service, but doesn't **consume FROM** customer-service.

---

## **📊 Complete Change Summary**

| Repository | Files to Change | Lines to Change | Status |
|------------|-----------------|-----------------|--------|
| **customer-service** | 3-4 files | ~50-80 lines | ⚠️ 2 done, 1-2 pending |
| **api-interface** | 1 file | ~30 lines | ⚠️ TODO |
| **web-portal** | 0 files | 0 lines | ✅ No changes |
| **integration-service** | 0 files | 0 lines | ✅ No changes |
| **TOTAL** | **4-5 files** | **~80-110 lines** | **60% complete** |

---

## **📋 Task Checklist**

### **customer-service** ☕
- [x] Update `BankingController.java`
- [x] Update `CustomerProductHoldingService.java`
- [ ] Update `CustomerProductHoldingServiceTest.java`
- [ ] Update `BankingControllerTest.java` (if exists)
- [ ] Run tests: `mvn -s settings.xml test`

### **api-interface** 🔀
- [ ] Update `customer.datasource.ts` - Interface definition
- [ ] Update `customer.datasource.ts` - Method implementation
- [ ] Update `customer.datasource.ts` - Error handler
- [ ] Run tests: `npm test`
- [ ] Test GraphQL endpoint manually

### **Testing** 🧪
- [ ] Unit tests pass in customer-service
- [ ] Unit tests pass in api-interface
- [ ] Integration test: customer-service → api-interface
- [ ] End-to-end test: Full flow to web-portal UI
- [ ] Banking tab displays data correctly

---

## **🚀 Deployment Order**

```
1. ✅ customer-service
   └─ Deploy after all tests pass

2. ⚠️ api-interface (MUST deploy immediately after customer-service)
   └─ Breaking change if customer-service deployed without this

3. ✅ web-portal
   └─ No deployment needed (already compatible)

4. ✅ integration-service
   └─ No deployment needed (not affected)
```

---

## **⚠️ Breaking Change Warning**

**CRITICAL:** api-interface MUST be deployed immediately after customer-service is deployed.

If customer-service is deployed alone, the BFF will crash because:
- customer-service returns: `{code: "...", data: {...}}`
- BFF expects: `{statusCode: "...", body: {data: {...}}}`

**Safe Deployment:**
1. Deploy customer-service to staging
2. Deploy api-interface to staging immediately
3. Test end-to-end
4. Deploy both to production in quick succession

---

## **📝 Additional Documentation**

- **Migration Guide:** `AUTOMAP_MIGRATION_GUIDE.md` (English)
- **คู่มือการย้าย:** `AUTOMAP_MIGRATION_GUIDE_TH.md` (ไทย)
- **Data Flow:** `BANKING_DATA_FLOW_DETAILED.md`


