# Product Holding AutoMap — BFF Problems

> Companion to `PRODUCT_HOLDING_AUTOMAP_MIGRATION_PLAN.md`.
> Focus: **api-interface** risks if BFF is migrated with a single legacy GraphQL target.

**Status:** Review findings  
**Scope:** Product-holding **account list** paths (BK, AF, HL, PL, CL, SSME)  
**Related fix (reference):** `getCustomerAccountList` — dual-read BE + `ServiceResponse` + `transformServiceResponse`

---

## 1. Summary

| Layer | Plan assumption | Reality in repo | Risk |
|---|---|---|---|
| customer-service | `Response<T>` + `autoMap` | Correct target | Low if BE follows Banking |
| BFF GraphQL target | Always `{ statusCode, success, body.data }` | **Most lists already modern** `{ code, subCode, message, data }` | **High — breaks portal** |
| BFF helper | One legacy normalizer | Need **two** mappers (modern + legacy) | High |
| Files to edit | Mostly `customer.datasource.ts` | Also `productHolding*.datasource.ts` | Medium — missed PRs |
| `handleSuccess` | Keep using it | Reads only `body.data` | **High — empty lists after autoMap** |
| `messageTemplate` | String `message` enough | Portal uses structured message; null vs `""` matters | Medium (UI toasts) |

**Bottom line:** BE half of the plan is fine. BFF half must default to **ServiceResponse → transformServiceResponse**, and use legacy mapping only for the few GraphQL queries that still expose `statusCode/body`.

---

## 2. Two contracts (do not mix)

### 2.1 Backend HTTP (customer-service)

| | Legacy | Modern (autoMap) |
|---|---|---|
| Status | `statusCode`, `success` | `code` |
| Payload | `body.data` | `data` |
| Message | string `message` | `message` + `messageTemplate` |

### 2.2 GraphQL to web-portal

| | Modern GraphQL | Legacy GraphQL |
|---|---|---|
| Shape | `{ code, subCode, message { title, header, body, ... }, data }` | `{ statusCode, success, message, body { data } }` |
| How portal reads list | `query.data` | `query.body.data` |
| How success is judged | `code === "SUCCESS"` | `success` / `statusCode` |

### 2.3 BFF internal (between datasource and resolver)

**Modern path (default for product lists):**

```text
datasource → ServiceResponse { code, message, messageTemplate, data, httpStatus }
resolver   → transformServiceResponse(...)
GraphQL    → { code, subCode, message, data }
```

**Legacy path (exceptions only):**

```text
datasource → { statusCode, success, message, body: { data } }
resolver   → return raw (no transformServiceResponse)
GraphQL    → same legacy shape
```

---

## 3. Problem catalogue

### P1 — Wrong GraphQL target for most products (critical)

Migration plan §5 / §7 / §10 normalizes **everything** to:

```text
{ statusCode, success, message, body: { data } }
```

**Actual GraphQL contracts today:**

| GraphQL query | Contract | Portal impact if forced legacy |
|---|---|---|
| `customerAccountList` | modern | Break / double-wrap |
| `getAutoFinanceAccountList` | modern | **Break AF tab** |
| `getHomeLoanAccountList` | modern | **Break HL** |
| `getPersonalLoanAccountList` | modern | **Break PL** |
| `getCommercialLoanAccountList` | modern | **Break CL** |
| `getSsmeLoanAccountList` | modern | **Break SSME** |
| `getBankingAccountList` | **legacy** | OK with legacy mapper |
| `getAutoFinanceContractList` | **legacy** | Needs dual-read carefully |

Forcing a single legacy mapper into modern resolvers will:

1. Return wrong field names (`statusCode` vs `code`)
2. Nest payload under `body` while schema/portal expect `data`
3. Skip `transformServiceResponse` mapping of `httpStatus` → `ResponseCode`

---

### P2 — `handleSuccess` drops autoMap payload (critical)

Used by HL, CL (and similar list methods):

```ts
return handleSuccess(response, 'Account list retrieved successfully')
```

`handleSuccess` implementation (`response.types.ts`):

- Reads **only** `response.body?.data`
- Builds thin `messageTemplate: { body }` only (no title/header nulls from BE)
- Ignores top-level `data`, `code`, full `messageTemplate`

After customer-service switches to autoMap:

```text
BE: { code, message, messageTemplate, data: { totalRecord, ... } }
handleSuccess → data: null   // body.data is undefined
portal → empty list / broken UI
```

**Required:** stop using `handleSuccess` for migrated list APIs. Use dual-read → `ServiceResponse` helper instead.  
Do **not** blindly widen `handleSuccess` without audit (blast radius across domains).

---

### P3 — One shared legacy helper is insufficient (critical)

Plan proposes one normalizer:

```text
mapBackendResponseToLegacy → always body.data shape
```

Needed:

| Helper | Output | Consumers |
|---|---|---|
| `mapBackendToServiceResponse` | `ServiceResponse` + dual-read `data \| body.data` + pass-through `messageTemplate` + `httpStatus: 200` | AF/HL/PL/CL/SSME lists, `customerAccountList` |
| `mapBackendToLegacyGraphQL` | `{ statusCode, success, message, body: { data } }` | `getBankingAccountList`, `getAutoFinanceContractList`, other true legacy queries |

Errors:

- Modern → existing `handleError` (keeps template when present)
- Legacy → legacy error envelope only for legacy GraphQL methods

---

### P4 — Incomplete file / call-site inventory (high)

Plan leans on `customer.datasource.ts` only. Real list entry points:

| Product | Datasource file |
|---|---|
| BK + AF account list (shared path) | `customer.datasource.ts` (`getCustomerAccountList`) |
| BK legacy list | `customer.datasource.ts` (`getBankingAccountList`) |
| AF contract list (legacy GQL) | `customer.datasource.ts` (`getAutoFinanceContractList`) |
| HL | `productHoldingHomeLoan.datasource.ts` |
| PL | `productHoldingPersonalLoan.datasource.ts` |
| CL | `productHoldingCommercialLoan.datasource.ts` |
| SSME | `productHoldingSsmeLoan.datasource.ts` |
| AF collateral/other | `productHoldingAutoFinance.datasource.ts` (if same BE wave) |

Also:

- Resolvers under `domains/customer/productHolding/**`
- Shared helpers: `types/response.types.ts`
- Unit tests under `__tests__/domains/customer/productHolding/**`

**AF special case — one BE endpoint, multiple BFF consumers:**

1. `getAutoFinanceAccountList` → modern ServiceResponse  
2. `getCustomerAccountList(productType: 'AF')` → same AF URL, modern  
3. `getAutoFinanceContractList` → **legacy** GraphQL (`body.data`)

Migrating AF BE once without updating **all three** call sites will leave at least one path broken.

---

### P5 — `messageTemplate` pass-through under-specified (medium)

Banking list fix behavior (match `getCustomerHeader`):

| Case | BFF should |
|---|---|
| BE sends full `messageTemplate` | Pass through as-is (`null` stays `null`) |
| BE sends only string / no template | Fallback `createResponseMessage(...)` |
| Rebuild every time with `createResponseMessage` | **Avoid** — turns unused fields into `""`, can surface empty toasts/dialogs |

Plan that only maps a string `message` for legacy shape will:

- Lose UI structure for modern GraphQL `message { title header body ... }`
- Reintroduce empty-string vs null inconsistency portal already depends on

`transformServiceResponse` uses:

```ts
message: serviceResponse.messageTemplate || DEFAULT_ERROR_MESSAGE
```

So datasource **must** populate `messageTemplate` correctly on the modern path.

---

### P6 — Error path rewrite vs existing patterns (medium)

Plan catch → always legacy error envelope is wrong for modern lists.

Existing:

```text
catch → handleError(error, emptyOrNull) → ServiceResponse with real httpStatus
resolver → transformServiceResponse → BUSINESS_ERROR / INTERNAL_ERROR
```

Also intentional BE behavior change:

```text
old: sometimes HTTP 200 + success:false + empty data
new: SonicException → non-2xx → RESTDataSource throws → BFF catch
```

That is aligned with Banking, but every list must **not** default missing payload to fake success/`httpStatus: 200` with null data unless product agrees empty-success semantics.

---

### P7 — Deploy order depends on dual-read (medium)

Agreed order remains:

```text
1) BFF dual-read (data || body.data)  — first
2) BE autoMap per product            — second
3) Remove legacy dead code           — last
```

If BFF ships **legacy-only** mapper before dual-read:

- Works only while BE still legacy
- Breaks the moment BE flips to autoMap **or** if mapper wrong for modern GraphQL

Dual-read must land **before** each product BE flip for **every** call site of that endpoint.

---

### P8 — Out of scope but easy to forget (low–medium)

Not wrong to exclude from the first wave; document explicitly:

- Electronic Card list  
- Mutual Fund / Fund / Debenture  
- Account **detail** / bulk inquiry  
- Total accounts / digital adoption  

Portal product-holding shell may call more than account-list APIs; empty tabs after “list migration” may be a different envelope.

Other checks:

| Item | Note |
|---|---|
| Mountebank stubs | May still return legacy `body.data` until updated |
| Non-portal REST clients | If any hit customer-service directly |
| Request DTO shape | Loans may send `{ customerKey, productType }`, not only shared simple request |
| Correlation headers | AF legacy sometimes set headers on `ResponseEntity`; confirm still required under `autoMap` |
| Field names in examples | AF list maps `accountRelation`, not invent `contractList` for the wrong query |

---

## 4. What the BFF half should say instead

### 4.1 Default path (most account lists)

```text
customer-service autoMap
  { code, message, messageTemplate, data }
        ↓
datasource: mapBackendToServiceResponse
  - dual-read: data ?? body?.data
  - code: code ?? statusCode
  - messageTemplate pass-through (nulls kept)
  - fallback createResponseMessage only if no template
  - success path httpStatus: 200
  - catch → handleError
        ↓
resolver: transformServiceResponse (unchanged)
        ↓
GraphQL: { code, subCode, message, data }
        ↓
web-portal: no contract change
```

### 4.2 Legacy path (explicit allow-list only)

```text
same BE dual-read
        ↓
datasource: mapBackendToLegacyGraphQL
        ↓
resolver: return raw
        ↓
GraphQL: { statusCode, success, message, body.data }
```

**Allow-list today (account-list related):**

- `getBankingAccountList`
- `getAutoFinanceContractList`

---

## 5. Recommended BFF checklist (replace plan §5–10 for api-interface)

- [ ] Split helpers: **ServiceResponse** vs **legacy GraphQL** (no single legacy-only normalizer for all)
- [ ] Dual-read `data || body.data` (and code/message) on every migrated call site
- [ ] Prefer BE `messageTemplate`; do not rebuild with empty strings when BE sent nulls
- [ ] Replace `handleSuccess` on migrated **list** methods
- [ ] Keep resolvers that already use `transformServiceResponse` as-is
- [ ] Inventory **all** datasources + dual consumers (especially AF × 3)
- [ ] Unit tests: modern BE shape, legacy BE shape, error via `handleError`, messageTemplate null pass-through
- [ ] Deploy BFF dual-read **before** BE autoMap per product
- [ ] Do not change portal GraphQL operations in this wave
- [ ] Mark EC / Fund / detail APIs out of scope explicitly

---

## 6. Per-product BFF status (account list)

| Product | GraphQL | Datasource today | Main BFF problem when BE flips |
|---|---|---|---|
| BK (`customerAccountList`) | modern | dual-read + ServiceResponse (done pattern) | Keep as reference |
| BK (`getBankingAccountList`) | legacy | maps toward legacy envelope | Needs dual-read → **legacy** mapper |
| AF account list | modern | ServiceResponse path | Dual-read + template pass-through; avoid legacy mapper |
| AF contract list | legacy | `body.data` | Dual-read → legacy; coordinate with AF BE flip |
| HL | modern | `handleSuccess` | **Will return null data** after autoMap |
| PL | modern | partial dual fields / mixed | Finish ServiceResponse pattern |
| CL | modern | `handleSuccess` | **Will return null data** after autoMap |
| SSME | modern | similar list pattern | Dual-read + drop legacy-only assumptions |

---

## 7. Minimal correct helper sketch (guidance only)

```ts
// Modern lists → resolvers using transformServiceResponse
function mapBackendToServiceResponse<T>(backend: BackendEnvelope, fallbackMessage: string): ServiceResponse<T | null> {
  const data = (backend?.data ?? backend?.body?.data ?? null) as T | null
  const code = backend?.code ?? backend?.statusCode ?? DEFAULT_SUB_CODE_SUCCESS
  const message = backend?.messageTemplate?.body ?? backend?.message ?? fallbackMessage
  const messageTemplate = backend?.messageTemplate ?? createResponseMessage(message)
  return { code, message, messageTemplate, data, httpStatus: 200 }
}

// Legacy GraphQL only
function mapBackendToLegacyGraphQL<T>(backend: BackendEnvelope, fallbackMessage: string) {
  const data = backend?.data ?? backend?.body?.data ?? null
  return {
    statusCode: String(backend?.statusCode ?? backend?.code ?? '200'),
    success: backend?.success ?? true,
    message: backend?.message ?? fallbackMessage,
    body: { data },
  }
}
```

Error success rules:

- Do not invent `success: true` when HTTP failed
- On throw → `handleError` for modern; equivalent legacy error only for legacy methods

---

## 8. Acceptance criteria for BFF (done when)

1. Portal product tabs for AF/HL/PL/CL/SSME/BK still load lists without GraphQL schema changes  
2. Modern queries still return `{ code, subCode, message, data }`  
3. Legacy queries still return `{ statusCode, success, body.data }`  
4. BE autoMap and BE legacy both work (dual-read) until cleanup  
5. Unused `messageTemplate` fields remain `null` when BE sends null (match header / BK list)  
6. Non-2xx still surfaces as GraphQL business/internal error via existing mappers  
7. No product list relies on `handleSuccess` after its BE autoMap flip  

---

## 9. Verdict

| Question | Answer |
|---|---|
| Will BE autoMap plan work? | **Yes** (with validation/exception notes already in main plan) |
| Will BFF “legacy GraphQL for all” work? | **No** — breaks modern product lists |
| Safe default for account lists? | **ServiceResponse + transformServiceResponse** |
| When to use legacy mapper? | Only allow-listed legacy GraphQL queries |
| Biggest landmine? | `handleSuccess` + single legacy normalizer after BE `data` moves top-level |

---

## 10. Suggested next edits to the main migration plan

1. Rewrite BFF target section: modern default, legacy exception list  
2. Add both helpers and ban one-size legacy mapper for list resolvers  
3. Expand file list to all `productHolding*Loan.datasource.ts`  
4. Add AF multi-call-site matrix  
5. Explicit `messageTemplate` null pass-through step  
6. Replace `handleSuccess` on migrated lists  
7. Keep deploy order: BFF dual-read → BE autoMap → cleanup  

Reference implementation already in repo:

- Datasource pattern: `getCustomerAccountList` in `customer.datasource.ts`  
- Resolver pattern: `getCustomerAccountList.resolver.ts` + `transformServiceResponse`  
- Avoid: `handleSuccess` for post-autoMap list payloads  

