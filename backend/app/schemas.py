from typing import List, Optional

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
