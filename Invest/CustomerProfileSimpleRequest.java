package th.co.scb.sonic.customer.model.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;
import th.co.scb.sonic.customer.model.enums.ProductType;

@Data
public class CustomerProfileSimpleRequest {

    @NotBlank(message = "Customer Key is required")
    private String customerKey;

    private ProductType productType;
}
