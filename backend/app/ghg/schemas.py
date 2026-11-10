from decimal import Decimal

from pydantic import BaseModel


class EmissionCalculationRequest(BaseModel):
    activity_value: Decimal
    emission_factor: Decimal
    activity_unit: str
    factor_unit: str


class EmissionCalculationResponse(BaseModel):
    activity_value: Decimal
    emission_factor: Decimal
    emissions_kg_co2e: Decimal
    converted_activity_value: Decimal
    activity_unit: str
    factor_code: str
    factor_value: Decimal
    factor_unit: str
    factor_version: int