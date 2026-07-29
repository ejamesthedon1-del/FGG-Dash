from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class ProductCreateRequest(BaseModel):
    title: str = Field(..., min_length=1)
    description_html: Optional[str] = None
    vendor: Optional[str] = None
    product_type: Optional[str] = None
    status: Optional[str] = "DRAFT"
    tags: Optional[List[str]] = None


class ProductRenameRequest(BaseModel):
    product_id: str = Field(..., min_length=1)
    new_title: str = Field(..., min_length=1)


class ShopifyqlRequest(BaseModel):
    """Raw ShopifyQL string; requires read_reports on the app."""

    query: str = Field(..., min_length=1, description="e.g. FROM sales SHOW total_sales SINCE today")


class ProductUnitCostBody(BaseModel):
    garmentCost: float = 0
    laborCost: float = 0


class ProductCostsPutRequest(BaseModel):
    costs: Dict[str, ProductUnitCostBody] = Field(default_factory=dict)


class OrderFlowStatusItem(BaseModel):
    brand: str = Field(..., min_length=1)
    shopifyOrderId: str = Field(..., min_length=1)
    orderName: Optional[str] = None


class OrderFlowStatusUpdateRequest(BaseModel):
    stage: str = Field(..., min_length=1)
    orders: List[OrderFlowStatusItem] = Field(..., min_length=1)
    blanksReceipt: Optional[Dict[str, str]] = None


class OrderFlowNotesUpdateRequest(BaseModel):
    brand: str = Field(..., min_length=1)
    shopifyOrderId: str = Field(..., min_length=1)
    notes: str = ""


class OrderFlowRiskDecisionRequest(BaseModel):
    brand: str = Field(..., min_length=1)
    shopifyOrderId: str = Field(..., min_length=1)
    orderName: Optional[str] = None
    note: str = ""
    actor: str = "ops"
    snapshot: Optional[Dict[str, Any]] = None


class OrderFlowSuppliesAppliedRequest(BaseModel):
    brand: str = Field(..., min_length=1)
    shopifyOrderId: str = Field(..., min_length=1)
    orderName: Optional[str] = None
    actor: str = "ops"
