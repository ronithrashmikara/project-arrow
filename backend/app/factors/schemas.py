from datetime import date
from decimal import Decimal

from pydantic import BaseModel


class FactorCreate(BaseModel):
    factor_code: str
    factor_name: str
    scope: int
    category: str
    activity_unit: str
    factor_unit: str
    factor_value: Decimal
    source_name: str
    source_reference: str | None = None
    version: int = 1
    valid_from: date | None = None
    valid_to: date | None = None
    status: str = "DRAFT"


class FactorUpdate(BaseModel):
    factor_name: str | None = None
    category: str | None = None
    factor_value: Decimal | None = None
    source_name: str | None = None
    source_reference: str | None = None
    valid_from: date | None = None
    valid_to: date | None = None
    status: str | None = None